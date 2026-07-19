"""Sawit Finance — Rule-based Yield Router / Settlement Keeper (no LLM in the loop): monitors CPO prices and real SAWIT
holder balances, creates+funds yield distribution epochs on Casper Testnet, then settles
per-holder claimable amounts (idempotent) and detects expired unclaimed epochs.

Cycle shape (poll-and-react, idempotent, per-item try/except so one bad holder/epoch never
kills the cycle):
  1. check_and_trigger(): if the monthly/price trigger fires, snapshot real holders, compute a
     largest-remainder apportionment of MONTHLY_DISTRIBUTION_CSPR, create+fund the epoch via the
     `fund` bin, then settle it by calling `set_claimable` per holder (resumable via
     agents/.yield_state.json — already-settled holders are skipped on retry).
  2. detect_expired_epochs(): every cycle (independent of trigger), reads the last few epochs via
     `read_state` and reports (logs + records) any funded epoch whose claim_deadline has passed
     with unclaimed CSPR still outstanding.
"""

import argparse
import asyncio
import contextlib
import fcntl
import json
import logging
import os
import re
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import aiohttp
from dotenv import load_dotenv, dotenv_values

try:
    from x402 import X402Payer, fetch_with_x402, X402Error
    X402_AVAILABLE = True
except ImportError:
    X402_AVAILABLE = False

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sawit-yield-router")

REPO_ROOT = Path(__file__).resolve().parent.parent
FUND_BIN = os.getenv("FUND_BIN", str(REPO_ROOT / "target" / "release" / "fund"))
SET_CLAIMABLE_BIN = os.getenv("SET_CLAIMABLE_BIN", str(REPO_ROOT / "target" / "release" / "set_claimable"))
READ_STATE_BIN = os.getenv("READ_STATE_BIN", str(REPO_ROOT / "target" / "release" / "read_state"))
SWEEP_BIN = os.getenv("SWEEP_BIN", str(REPO_ROOT / "target" / "release" / "sweep"))
# Off by default: sweeping moves unclaimed CSPR back to the authority, so it stays an
# explicit operator decision rather than something the keeper does silently.
AUTO_SWEEP = os.getenv("AUTO_SWEEP", "0") == "1"
READ_BALANCE_BIN = os.getenv("READ_BALANCE_BIN", str(REPO_ROOT / "target" / "release" / "read_balance"))
LIVENET_ENV_FILE = os.getenv("LIVENET_ENV_FILE", str(REPO_ROOT / ".env"))

ALLOCATION_STATE_FILE = REPO_ROOT / "agents" / ".allocation_state.json"
ALLOCATION_STATE_LOCK_FILE = REPO_ROOT / "agents" / ".allocation_state.lock"
YIELD_STATE_FILE = REPO_ROOT / "agents" / ".yield_state.json"

CSPR_CLOUD_API = "https://api.testnet.cspr.cloud"
CASPER_TESTNET_RPC = "https://rpc.testnet.casperlabs.io"

PRODUCTION_VAULT_CONTRACT = os.getenv("PRODUCTION_VAULT_CONTRACT", "")
YIELD_DISTRIBUTOR_CONTRACT = os.getenv("YIELD_DISTRIBUTOR_CONTRACT", "")
SAWIT_TOKEN_CONTRACT = os.getenv("SAWIT_TOKEN_CONTRACT", "")
YIELD_ROUTER_SECRET_KEY = os.getenv("YIELD_ROUTER_SECRET_KEY", "")
CSPR_CLOUD_API_KEY = os.getenv("CSPR_CLOUD_API_KEY", "")

X402_LIVE = os.getenv("X402_LIVE", "off").lower() == "on"
X402_FACILITATOR_URL = os.getenv("X402_FACILITATOR_URL", "http://127.0.0.1:8402")
X402_NETWORK = os.getenv("X402_NETWORK", "casper-test")
X402_MAX_MOTES = int(os.getenv("X402_MAX_PRICE_MOTES", "100000000"))

_x402_payer = None
if X402_LIVE and X402_AVAILABLE:
    _seed = YIELD_ROUTER_SECRET_KEY if len(YIELD_ROUTER_SECRET_KEY) >= 64 else None
    _x402_payer = X402Payer(seed_hex=_seed, network=X402_NETWORK)

TRIGGER_MODE = os.getenv("TRIGGER_MODE", "monthly")
PRICE_TRIGGER_CENTS = int(os.getenv("PRICE_TRIGGER_CENTS", "85000"))
MONTHLY_DISTRIBUTION_CSPR = int(os.getenv("MONTHLY_DISTRIBUTION_CSPR", "5000"))
CHECK_INTERVAL_SECONDS = int(os.getenv("CHECK_INTERVAL_SECONDS", "3600"))

# Real-holder snapshot sources (see snapshot_sawit_holders() docstring).
TREASURY_ACCOUNT_HASH = os.getenv(
    "TREASURY_ACCOUNT_HASH",
    "e8134d5d5caf9ace626209d09365af48a867a18199b5139da8873733c6c14efe",
)
EXTRA_HOLDERS = [h.strip() for h in os.getenv("EXTRA_HOLDERS", "").split(",") if h.strip()]
VERIFY_BALANCES = os.getenv("VERIFY_BALANCES", "0").lower() in ("1", "true", "on", "yes")


@dataclass
class HolderBalance:
    address: str          # account-hash-<hex>, always with the "account-hash-" prefix
    sawit_balance: int     # SAWIT weight used for proportional apportionment


@dataclass
class DistributionPlan:
    epoch_label: str
    total_cspr_motes: int
    trigger_price_cents: int
    holders: list[HolderBalance]
    per_holder_cspr_motes: dict[str, int]
    total_holders: int


# ── Cross-process file lock (stdlib fcntl; shared sidecar with allocation_agent.py, no
# importable common module exists between these separate processes, so this helper is
# intentionally duplicated there) ───────────────────────────────────────────────────────

@contextlib.contextmanager
def _allocation_state_lock(timeout_seconds: float = 10.0, poll_interval: float = 0.2):
    """Blocking-with-timeout advisory lock on ALLOCATION_STATE_LOCK_FILE, guarding reads of
    agents/.allocation_state.json against a concurrent write from allocation_agent.py. On
    timeout, logs and yields anyway so the caller falls back to its existing behaviour
    (reuse previous/empty snapshot) rather than deadlocking."""
    ALLOCATION_STATE_LOCK_FILE.touch(exist_ok=True)
    fd = os.open(str(ALLOCATION_STATE_LOCK_FILE), os.O_RDWR)
    deadline = time.monotonic() + timeout_seconds
    acquired = False
    try:
        while time.monotonic() < deadline:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                acquired = True
                break
            except BlockingIOError:
                time.sleep(poll_interval)
        if not acquired:
            log.warning(f"[LOCK] timed out waiting for {ALLOCATION_STATE_LOCK_FILE} — proceeding without lock")
        yield acquired
    finally:
        if acquired:
            with contextlib.suppress(OSError):
                fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


# ── Keeper state (idempotency) ──────────────────────────────────────────────

def load_yield_state() -> dict:
    if YIELD_STATE_FILE.exists():
        try:
            with open(YIELD_STATE_FILE) as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            log.warning(f"[STATE] failed to load {YIELD_STATE_FILE}: {e} — starting fresh")
    return {"epochs": {}, "expired": {}}


def save_yield_state(state: dict) -> None:
    """Atomic write (tmp file + os.replace) so a crash mid-write never leaves a corrupt
    agents/.yield_state.json — this file is written after every settled holder."""
    tmp_path = YIELD_STATE_FILE.with_suffix(YIELD_STATE_FILE.suffix + ".tmp")
    try:
        with open(tmp_path, "w") as f:
            json.dump(state, f, indent=2, sort_keys=True)
        os.replace(tmp_path, YIELD_STATE_FILE)
    except OSError as e:
        log.error(f"[STATE] failed to write {YIELD_STATE_FILE}: {e}")


def _normalize_account_hash(value: str) -> str:
    return value.replace("account-hash-", "").lower()


def _with_prefix(value: str) -> str:
    v = _normalize_account_hash(value)
    return f"account-hash-{v}"


# ── read_state / read_balance bridges ───────────────────────────────────────

def read_state() -> Optional[dict]:
    """Run the read-only `read_state` bin and parse the SAWIT_STATE_JSON line. Returns None on
    any failure (bin missing, timeout, unparseable output) — callers must handle None gracefully."""
    if not os.path.exists(READ_STATE_BIN):
        log.error(f"[READ_STATE] bin not found at {READ_STATE_BIN}")
        return None

    env = {**os.environ, **dotenv_values(LIVENET_ENV_FILE)}
    try:
        proc = subprocess.run([READ_STATE_BIN], capture_output=True, text=True, env=env, timeout=130)
    except subprocess.TimeoutExpired:
        log.error("[READ_STATE] bin timed out")
        return None

    for line in proc.stdout.splitlines():
        if line.startswith("SAWIT_STATE_JSON "):
            try:
                return json.loads(line[len("SAWIT_STATE_JSON "):])
            except json.JSONDecodeError as e:
                log.error(f"[READ_STATE] failed to parse SAWIT_STATE_JSON: {e}")
                return None

    log.error(
        f"[READ_STATE] SAWIT_STATE_JSON not found in output (exit {proc.returncode}): "
        f"{(proc.stderr or proc.stdout)[-400:]}"
    )
    return None


def read_balance(account_hash: str) -> Optional[int]:
    """Read-only `read_balance` bin — actual on-chain SAWIT balance for one account. Slow
    (~minutes per call on testnet), so only used when VERIFY_BALANCES=1."""
    if not os.path.exists(READ_BALANCE_BIN):
        log.error(f"[READ_BALANCE] bin not found at {READ_BALANCE_BIN}")
        return None

    env = {**os.environ, **dotenv_values(LIVENET_ENV_FILE), "BALANCE_ACCOUNT": _with_prefix(account_hash)}
    try:
        proc = subprocess.run([READ_BALANCE_BIN], capture_output=True, text=True, env=env, timeout=180)
    except subprocess.TimeoutExpired:
        log.error(f"[READ_BALANCE] bin timed out for {account_hash}")
        return None

    for line in proc.stdout.splitlines():
        if line.startswith("SAWIT_BALANCE_JSON "):
            try:
                data = json.loads(line[len("SAWIT_BALANCE_JSON "):])
                return int(data["balance"])
            except (json.JSONDecodeError, KeyError, ValueError) as e:
                log.error(f"[READ_BALANCE] failed to parse SAWIT_BALANCE_JSON: {e}")
                return None

    log.error(
        f"[READ_BALANCE] SAWIT_BALANCE_JSON not found for {account_hash} "
        f"(exit {proc.returncode}): {(proc.stderr or proc.stdout)[-300:]}"
    )
    return None


# ── Price feed (unchanged) ──────────────────────────────────────────────────

async def get_current_cpo_price(session: aiohttp.ClientSession) -> int:
    """Fetch the current CPO benchmark price from KPBN via x402-gated API; returns USD cents per ton."""
    log.info("[PRICE] Fetching CPO benchmark price (x402 micropayment)...")

    if X402_LIVE and X402_AVAILABLE and _x402_payer is not None:
        url = f"{X402_FACILITATOR_URL}/api/kpbn/price"
        try:
            data = await fetch_with_x402(session, url, _x402_payer, X402_MAX_MOTES)
            price = int(data["price_cents_per_ton"])
            log.info(f"[PRICE] ✅ Paid via x402 — CPO price ${price/100:.2f}/ton")
            return price
        except X402Error as e:
            log.warning(f"[PRICE] x402 failed: {e} — using fallback")
        except Exception as e:
            log.warning(f"[PRICE] facilitator unreachable ({e}) — using fallback")

    await asyncio.sleep(0.2)
    simulated_price = 83_500
    log.info(f"[PRICE] Current CPO price: ${simulated_price/100:.2f}/ton")
    return simulated_price


# ── Real holder snapshot ─────────────────────────────────────────────────────

def _load_allocation_holders() -> dict[str, int]:
    """Sum allocated SAWIT per investor from agents/.allocation_state.json (status=="allocated").
    Returns {account_hash_without_prefix: total_allocation_units}."""
    with _allocation_state_lock():
        if not ALLOCATION_STATE_FILE.exists():
            log.warning(f"[SNAPSHOT] {ALLOCATION_STATE_FILE} not found — no investor holders from allocation state")
            return {}

        try:
            with open(ALLOCATION_STATE_FILE) as f:
                alloc_state = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            log.error(f"[SNAPSHOT] failed to read {ALLOCATION_STATE_FILE}: {e}")
            return {}

    totals: dict[str, int] = {}
    for deploy_hash, entry in alloc_state.items():
        try:
            if not isinstance(entry, dict) or entry.get("status") != "allocated":
                continue
            investor = _normalize_account_hash(str(entry["investor"]))
            amount = int(entry["allocation"]["allocation"])
            totals[investor] = totals.get(investor, 0) + amount
        except Exception as e:
            log.warning(f"[SNAPSHOT] skipping malformed allocation entry {deploy_hash}: {e}")
            continue

    return totals


async def snapshot_sawit_holders(session: aiohttp.ClientSession, state_json: Optional[dict]) -> list[HolderBalance]:
    """Snapshot real SAWIT holder weights from three sources, deduped:
      1. agents/.allocation_state.json — investors who bought SAWIT via the allocation agent
         (weight = sum of their allocated SAWIT units).
      2. The deployer/treasury account — holds the remaining (unsold) pool. Its weight is
         estimated as total_sawit_supply (from read_state) minus the sum of investor weights;
         only included when read_state succeeded this cycle.
      3. EXTRA_HOLDERS env (comma-separated account hashes) — manual supplementary holders
         (e.g. holders who received SAWIT outside the allocation flow).

    If VERIFY_BALANCES=1, every candidate address's weight is overridden with its *actual*
    on-chain SAWIT balance via the read-only `read_balance` bin (slow — ~minutes per account).
    If VERIFY_BALANCES=0 (default), investor/treasury weights use the estimates above; extra
    holders with no state-file record get weight 0 (logged) since there is no other source for
    their balance without an on-chain read.
    """
    log.info("[SNAPSHOT] Building real SAWIT holder snapshot...")

    investor_totals = _load_allocation_holders()

    holders: dict[str, int] = {_with_prefix(addr): bal for addr, bal in investor_totals.items()}

    treasury_addr = _with_prefix(TREASURY_ACCOUNT_HASH)
    if state_json is not None:
        try:
            total_supply = int(state_json["total_sawit_supply"])
            treasury_balance = total_supply - sum(investor_totals.values())
            if treasury_balance > 0:
                holders[treasury_addr] = treasury_balance
            elif treasury_balance < 0:
                log.warning(
                    f"[SNAPSHOT] computed treasury balance is negative ({treasury_balance}) — "
                    "allocation state may be stale relative to on-chain supply; excluding treasury"
                )
        except (KeyError, ValueError, TypeError) as e:
            log.warning(f"[SNAPSHOT] could not derive treasury balance from state_json: {e}")
    else:
        log.warning("[SNAPSHOT] read_state unavailable this cycle — treasury holder excluded from snapshot")

    for extra in EXTRA_HOLDERS:
        addr = _with_prefix(extra)
        if addr not in holders:
            holders[addr] = 0
            log.warning(
                f"[SNAPSHOT] EXTRA_HOLDERS entry {addr} has no allocation-state weight — "
                "set VERIFY_BALANCES=1 to resolve its real on-chain balance, otherwise it "
                "contributes 0 weight to this epoch's apportionment"
            )

    if VERIFY_BALANCES:
        log.info(f"[SNAPSHOT] VERIFY_BALANCES=1 — verifying {len(holders)} balances on-chain (slow)...")
        for addr in list(holders.keys()):
            try:
                actual = read_balance(addr)
            except Exception as e:
                log.warning(f"[SNAPSHOT] read_balance failed for {addr}: {e} — keeping estimate")
                continue
            if actual is not None:
                holders[addr] = actual

    result = [HolderBalance(address=addr, sawit_balance=bal) for addr, bal in holders.items() if bal > 0]
    log.info(f"[SNAPSHOT] {len(result)} holders with positive weight (of {len(holders)} candidates)")
    return result


def compute_distribution(
    holders: list[HolderBalance],
    total_cspr_motes: int,
    epoch_label: str,
    trigger_price_cents: int,
) -> DistributionPlan:
    """Compute per-holder CSPR yield proportional to SAWIT holdings using the largest-remainder
    method so the sum of per-holder allocations is always exactly total_cspr_motes."""
    total_sawit = sum(h.sawit_balance for h in holders)

    if total_sawit == 0:
        log.warning("[COMPUTE] No SAWIT holders found")
        return DistributionPlan(
            epoch_label=epoch_label,
            total_cspr_motes=0,
            trigger_price_cents=trigger_price_cents,
            holders=[],
            per_holder_cspr_motes={},
            total_holders=0,
        )

    floors: dict[str, int] = {}
    remainders: list[tuple[float, str]] = []
    allocated = 0

    for holder in holders:
        exact = total_cspr_motes * holder.sawit_balance / total_sawit
        floor = int(exact)
        floors[holder.address] = floor
        allocated += floor
        remainders.append((exact - floor, holder.address))

    leftover = total_cspr_motes - allocated
    remainders.sort(key=lambda r: r[0], reverse=True)
    for i in range(leftover):
        addr = remainders[i % len(remainders)][1]
        floors[addr] += 1

    per_holder = floors

    log.info(f"[COMPUTE] Distribution plan for {epoch_label}:")
    log.info(f"  Total CSPR    : {total_cspr_motes / 1e9:,.2f} CSPR")
    log.info(f"  Total holders : {len(holders)}")
    log.info(f"  Total SAWIT   : {total_sawit:,}")
    for h in holders:
        cspr = per_holder[h.address] / 1e9
        log.info(f"  {h.address[:24]}... → {cspr:.4f} CSPR ({h.sawit_balance/total_sawit*100:.1f}%)")

    assert sum(per_holder.values()) == total_cspr_motes, "largest-remainder apportionment must sum exactly"

    return DistributionPlan(
        epoch_label=epoch_label,
        total_cspr_motes=total_cspr_motes,
        trigger_price_cents=trigger_price_cents,
        holders=holders,
        per_holder_cspr_motes=per_holder,
        total_holders=len(holders),
    )


async def submit_distribution(
    session: aiohttp.ClientSession,
    plan: DistributionPlan,
) -> tuple[list[str], Optional[int]]:
    """Submit the distribution to Casper Testnet via the fund livenet bin (create_epoch + payable
    fund_epoch); returns (tx hashes, epoch_number) — epoch_number is parsed from the bin's
    FUND_OK sentinel so downstream settlement always targets the correct on-chain epoch."""
    log.info(f"[CASPER] Submitting distribution for epoch {plan.epoch_label} "
             f"({plan.total_cspr_motes / 1e9:g} CSPR)...")

    if not os.path.exists(FUND_BIN):
        log.error(
            f"[CASPER] fund bin not found at {FUND_BIN} — build it: "
            "cargo build -p sawit-deploy --bin fund --features livenet --release"
        )
        return [], None

    env = {
        **os.environ,
        **dotenv_values(LIVENET_ENV_FILE),
        "FUND_EPOCH_LABEL": plan.epoch_label,
        "FUND_AMOUNT_MOTES": str(plan.total_cspr_motes),
        "FUND_TRIGGER_CENTS": str(plan.trigger_price_cents),
    }
    try:
        proc = subprocess.run(
            [FUND_BIN], capture_output=True, text=True, env=env, timeout=240
        )
    except subprocess.TimeoutExpired:
        log.error("[CASPER] fund bin timed out before confirmation")
        return [], None

    if "FUND_OK" not in proc.stdout:
        log.error(f"[CASPER] on-chain distribution failed (exit {proc.returncode}): "
                  f"{(proc.stderr or proc.stdout)[-400:]}")
        return [], None

    epoch_number = None
    for line in proc.stdout.splitlines():
        if line.startswith("FUND_OK "):
            try:
                epoch_number = int(json.loads(line[len("FUND_OK "):])["epoch"])
            except (json.JSONDecodeError, KeyError, ValueError) as e:
                log.warning(f"[CASPER] could not parse FUND_OK epoch number: {e}")

    m = re.search(r'Transaction "([0-9a-f]{64})"', proc.stdout)
    deploy_hash = m.group(1) if m else ""
    if deploy_hash:
        log.info(f"[CASPER] ✅ Distribution funded on-chain — tx {deploy_hash}")
        log.info(f"[CASPER]    https://testnet.cspr.live/transaction/{deploy_hash}")
    else:
        log.info("[CASPER] ✅ Distribution funded on-chain (tx hash not parsed)")
    return ([deploy_hash] if deploy_hash else []), epoch_number


# ── Settlement (set_claimable per holder, idempotent) ───────────────────────

class PoolExceededError(Exception):
    """The contract refused an allocation because the epoch's claimable sum
    would exceed its funded pool (DistError::ClaimableExceedsPool)."""

    def __init__(self, epoch_number: int):
        super().__init__(f"epoch {epoch_number} claimable pool exceeded")
        self.epoch_number = epoch_number


def call_set_claimable(epoch_number: int, holder_addr: str, amount_motes: int) -> bool:
    """Invoke the `set_claimable` livenet bin for a single holder. Note: this bin also
    auto-registers KYC for the holder if not already verified (see deploy/src/set_claimable.rs) —
    that is inherent bin behaviour, not something this keeper controls."""
    env = {
        **os.environ,
        **dotenv_values(LIVENET_ENV_FILE),
        "CLAIM_HOLDER": holder_addr,
        "CLAIM_AMOUNT_MOTES": str(amount_motes),
        "CLAIM_EPOCH": str(epoch_number),
    }
    proc = subprocess.run([SET_CLAIMABLE_BIN], capture_output=True, text=True, env=env, timeout=240)
    if "SET_CLAIMABLE_OK" not in proc.stdout:
        out = (proc.stderr or "") + (proc.stdout or "")
        # DistError::ClaimableExceedsPool (13): the contract-side cap refused an
        # allocation that would push the epoch's claimable sum past its funded
        # pool. Retrying other holders would fail the same way — signal abort.
        if "User error: 13" in out or "ClaimableExceedsPool" in out:
            log.error(
                f"[SETTLE] contract cap hit for {holder_addr} epoch {epoch_number}: "
                "allocation would exceed the epoch's funded pool — aborting settlement "
                "for this epoch (plan does not match on-chain pool)"
            )
            raise PoolExceededError(epoch_number)
        log.error(
            f"[SETTLE] set_claimable failed for {holder_addr} epoch {epoch_number} "
            f"(exit {proc.returncode}): {out[-400:]}"
        )
        return False
    return True


def call_sweep(epoch_number: int) -> tuple[bool, str]:
    """Invoke the `sweep` livenet bin: SawitYieldDistributor::sweep_unclaimed(epoch).
    Returns (ok, reason). "already_swept" from the bin counts as ok so the keeper can
    mark its state and stop retrying."""
    env = {
        **os.environ,
        **dotenv_values(LIVENET_ENV_FILE),
        "SWEEP_EPOCH": str(epoch_number),
    }
    proc = subprocess.run([SWEEP_BIN], capture_output=True, text=True, env=env, timeout=240)
    out = (proc.stdout or "") + (proc.stderr or "")
    if "SWEEP_OK" in out:
        return True, "swept"
    if "already_swept" in out:
        return True, "already_swept"
    log.error(
        f"[SWEEP] sweep failed for epoch {epoch_number} (exit {proc.returncode}): {out[-400:]}"
    )
    return False, "failed"


def settle_epoch(epoch_number: int, plan: DistributionPlan, state: dict) -> dict[str, int]:
    """Settle every holder in `plan` for `epoch_number` by calling set_claimable. Idempotent:
    holders already marked "done" in agents/.yield_state.json are skipped, so a re-run after a
    partial failure only retries the ones that didn't succeed. Per-holder try/except so one bad
    holder never aborts the rest of the settlement."""
    epoch_key = str(epoch_number)
    epoch_state = state.setdefault("epochs", {}).setdefault(epoch_key, {"holders": {}})
    holders_state = epoch_state.setdefault("holders", {})

    outcomes = {"done": 0, "skipped_already_done": 0, "failed": 0, "skipped_zero": 0}

    # Sanity: the plan's per-holder sum must never exceed the pool this epoch
    # was funded with — the contract now enforces the same cap on-chain
    # (ClaimableExceedsPool), this just fails fast before burning gas.
    plan_sum = sum(plan.per_holder_cspr_motes.values())
    if plan_sum > plan.total_cspr_motes:
        log.error(
            f"[SETTLE] plan sum {plan_sum} motes exceeds funded pool "
            f"{plan.total_cspr_motes} motes for epoch {epoch_number} — refusing to settle"
        )
        outcomes["failed"] = len(plan.per_holder_cspr_motes)
        return outcomes

    if not os.path.exists(SET_CLAIMABLE_BIN):
        log.error(f"[SETTLE] set_claimable bin not found at {SET_CLAIMABLE_BIN} — skipping settlement")
        outcomes["failed"] = len(plan.per_holder_cspr_motes)
        return outcomes

    for holder_addr, motes in plan.per_holder_cspr_motes.items():
        if motes <= 0:
            outcomes["skipped_zero"] += 1
            continue

        if holders_state.get(holder_addr, {}).get("status") == "done":
            outcomes["skipped_already_done"] += 1
            continue

        try:
            ok = call_set_claimable(epoch_number, holder_addr, motes)
        except PoolExceededError:
            # Contract cap: further set_claimable calls for this epoch would
            # fail identically — mark this holder failed and stop the loop.
            holders_state[holder_addr] = {
                "status": "failed",
                "motes": str(motes),
                "ts": datetime.now(timezone.utc).isoformat(),
            }
            save_yield_state(state)
            outcomes["failed"] += 1
            break
        except subprocess.TimeoutExpired:
            log.error(f"[SETTLE] set_claimable timed out for {holder_addr} epoch {epoch_number}")
            ok = False
        except Exception as e:
            log.error(f"[SETTLE] unexpected error settling {holder_addr} epoch {epoch_number}: {e}", exc_info=True)
            ok = False

        holders_state[holder_addr] = {
            "status": "done" if ok else "failed",
            "motes": str(motes),
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        # Persist after every holder so a crash mid-settlement loses no progress.
        save_yield_state(state)

        outcomes["done" if ok else "failed"] += 1

    log.info(f"[SETTLE] epoch {epoch_number} settlement outcomes: {outcomes}")
    return outcomes


# ── Expired-epoch detection (report-only; see note below) ──────────────────

def detect_expired_epochs(state: dict, state_json: Optional[dict]) -> None:
    """Report funded epochs whose claim window has passed with CSPR still unclaimed.

    When AUTO_SWEEP=1 and the `sweep` bin is built, expired epochs are also swept on-chain via
    SawitYieldDistributor::sweep_unclaimed(epoch) (deploy/src/sweep.rs), returning unclaimed
    CSPR to the authority. Default is detect-and-report only (AUTO_SWEEP=0)."""
    if state_json is None:
        log.warning("[EXPIRY] read_state unavailable this cycle — skipping expired-epoch check")
        return

    epochs = state_json.get("epochs", [])
    now_ms = int(time.time() * 1000)
    expired_state = state.setdefault("expired", {})
    found_any = False

    for entry in epochs:
        try:
            epoch_number = int(entry["epoch_number"])
            funded = bool(entry.get("funded"))
            deadline_ms = int(entry.get("claim_deadline_ms", 0))
            total_distribution = int(entry.get("total_distribution_cspr", "0"))
            total_claimed = int(entry.get("total_claimed_cspr", "0"))
        except (KeyError, ValueError, TypeError) as e:
            log.warning(f"[EXPIRY] skipping malformed epoch entry: {e}")
            continue

        if not funded or deadline_ms == 0 or now_ms <= deadline_ms:
            continue
        if total_claimed >= total_distribution:
            continue

        unclaimed = total_distribution - total_claimed
        found_any = True

        key = str(epoch_number)
        prior = expired_state.get(key, {})

        if prior.get("swept"):
            continue

        log.warning(
            f"[EXPIRY] epoch {epoch_number} EXPIRED with unclaimed funds: "
            f"{unclaimed / 1e9:,.4f} CSPR unclaimed of {total_distribution / 1e9:,.4f} CSPR"
            + ("" if AUTO_SWEEP else " (AUTO_SWEEP=0 — detect-and-report only)")
        )

        entry_state = {
            "first_detected": prior.get("first_detected", datetime.now(timezone.utc).isoformat()),
            "last_checked": datetime.now(timezone.utc).isoformat(),
            "unclaimed_motes": str(unclaimed),
            "total_distribution_motes": str(total_distribution),
        }

        if AUTO_SWEEP:
            if not os.path.exists(SWEEP_BIN):
                log.error(f"[SWEEP] AUTO_SWEEP=1 but sweep bin not found at {SWEEP_BIN}")
            else:
                try:
                    ok, reason = call_sweep(epoch_number)
                    if ok:
                        entry_state["swept"] = True
                        entry_state["sweep_result"] = reason
                        log.info(f"[SWEEP] epoch {epoch_number}: {reason}")
                except Exception as e:
                    log.error(f"[SWEEP] epoch {epoch_number} raised: {e}")

        expired_state[key] = entry_state

    if not found_any:
        log.info("[EXPIRY] no expired unclaimed epochs found this cycle")


# ── Trigger logic ────────────────────────────────────────────────────────────

def should_trigger_monthly() -> bool:
    """Trigger on first day of each month."""
    now = datetime.now(timezone.utc)
    return now.day == 1


async def check_and_trigger(session: aiohttp.ClientSession, state: dict, state_json: Optional[dict], force: bool = False) -> bool:
    """Check trigger conditions and execute a full create+fund+settle cycle if met.
    `force=True` (manual/demo) bypasses the monthly/price gate and distributes now."""
    now = datetime.now(timezone.utc)
    epoch_label = now.strftime("%b-%y")

    trigger_price = await get_current_cpo_price(session)
    total_cspr_motes = MONTHLY_DISTRIBUTION_CSPR * int(1e9)

    should_trigger = False

    if force:
        log.info("[ROUTER] ⚡ Force mode — bypassing the trigger gate, distributing a fresh epoch now (manual/demo)")
        should_trigger = True
    elif TRIGGER_MODE == "price":
        if trigger_price >= PRICE_TRIGGER_CENTS:
            log.info(
                f"[ROUTER] ✅ Price trigger: ${trigger_price/100:.2f} >= ${PRICE_TRIGGER_CENTS/100:.2f} — DISTRIBUTING"
            )
            should_trigger = True
        else:
            log.info(
                f"[ROUTER] Price ${trigger_price/100:.2f} below trigger ${PRICE_TRIGGER_CENTS/100:.2f} — waiting"
            )
    elif TRIGGER_MODE == "monthly":
        if should_trigger_monthly():
            log.info("[ROUTER] ✅ Monthly trigger: first day of month — DISTRIBUTING")
            should_trigger = True
        else:
            log.info(f"[ROUTER] Monthly trigger not met (day {now.day}) — waiting")

    if not should_trigger:
        return False

    holders = await snapshot_sawit_holders(session, state_json)

    if not holders:
        log.warning("[ROUTER] No holders found — skipping distribution")
        return False

    plan = compute_distribution(holders, total_cspr_motes, epoch_label, trigger_price)
    if not plan.per_holder_cspr_motes:
        log.warning("[ROUTER] Empty distribution plan — skipping")
        return False

    deploy_hashes, epoch_number = await submit_distribution(session, plan)

    if not deploy_hashes and epoch_number is None:
        log.error(
            f"[ROUTER] Distribution for {epoch_label} did NOT execute on-chain — the fund tx "
            f"failed (see the [CASPER] error above; commonly an under-funded operator purse). "
            f"No epoch was funded this cycle."
        )
        return False

    log.info(f"[ROUTER] 🌴 Yield distribution triggered for {epoch_label}!")
    log.info(f"[ROUTER] {len(holders)} holders will receive yield from {total_cspr_motes/1e9:.0f} CSPR pool")

    if epoch_number is not None:
        try:
            settle_epoch(epoch_number, plan, state)
        except Exception as e:
            log.error(f"[ROUTER] settlement pass raised: {e}", exc_info=True)
    else:
        log.error("[ROUTER] fund tx sent but epoch number could not be parsed — "
                   "settlement skipped this cycle (will need manual set_claimable or a retry)")

    return True


def _fail_fast_check_bins() -> None:
    """Fail-fast at startup if the critical write bins aren't built — a settlement keeper that
    silently no-ops on every cycle is worse than one that refuses to start."""
    missing = [p for p in (FUND_BIN, SET_CLAIMABLE_BIN, READ_STATE_BIN) if not os.path.exists(p)]
    if missing:
        log.error(
            "[STARTUP] required bin(s) not found, refusing to start: "
            + ", ".join(missing)
            + " — build with: cargo build -p sawit-deploy --bins --features livenet --release"
        )
        raise SystemExit(1)


async def run_cycle(session: aiohttp.ClientSession, state: dict, force: bool = False) -> bool:
    state_json = read_state()

    detect_expired_epochs(state, state_json)
    save_yield_state(state)

    triggered = await check_and_trigger(session, state, state_json, force=force)
    save_yield_state(state)
    return triggered


async def main(once: bool = False, force: bool = False):
    """Run the settlement keeper (continuously, unless once=True)."""
    log.info("Sawit Finance Yield Router / Settlement Keeper (rule-based) starting...")
    log.info(f"Mode          : {TRIGGER_MODE}")
    log.info(f"Price trigger : ${PRICE_TRIGGER_CENTS/100:.2f}/ton CPO")
    log.info(f"Distribution  : {MONTHLY_DISTRIBUTION_CSPR:,} CSPR/epoch")
    log.info(f"Check interval: {CHECK_INTERVAL_SECONDS}s")
    log.info(f"Verify balances on-chain: {VERIFY_BALANCES}")
    log.info(f"Extra holders : {len(EXTRA_HOLDERS)}")

    _fail_fast_check_bins()

    state = load_yield_state()

    async with aiohttp.ClientSession() as session:
        if once:
            log.info(f"[ROUTER] Checking trigger conditions (--once{', force' if force else ''})...")
            try:
                await run_cycle(session, state, force=force)
            except Exception as e:
                # A single-cycle CI run should surface problems (insufficient operator
                # purse — submit_distribution already returns empty for that —, a
                # ClaimableExceedsPool revert, or transient RPC) without hard-failing the
                # scheduled workflow. Whatever state was produced is still saved and
                # committed by the caller.
                log.error(f"[ROUTER] --once cycle error (non-fatal): {e}", exc_info=True)
            return

        while True:
            try:
                log.info(f"[ROUTER] Checking trigger conditions...")
                triggered = await run_cycle(session, state)
                if triggered:
                    log.info("[ROUTER] Distribution executed — sleeping until next cycle")
                    await asyncio.sleep(30 * 24 * 3600)
                else:
                    await asyncio.sleep(CHECK_INTERVAL_SECONDS)
            except SystemExit:
                raise
            except Exception as e:
                log.error(f"[ROUTER] Error: {e}", exc_info=True)
                await asyncio.sleep(60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sawit Finance yield router / settlement keeper")
    parser.add_argument("--once", action="store_true", help="run a single cycle and exit")
    parser.add_argument("--force", action="store_true",
                        help="bypass the monthly/price trigger and distribute a fresh epoch now (manual/demo)")
    args = parser.parse_args()
    asyncio.run(main(once=args.once, force=args.force))
