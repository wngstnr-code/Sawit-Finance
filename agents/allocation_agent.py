#!/usr/bin/env python3
"""Sawit Finance — AI Allocation Agent: watches the treasury account for incoming CSPR
"buy SAWIT" transfers (native transfer with transfer-id/memo == BUY_MEMO_ID) and, for each
new one, allocates + sends SAWIT to the buyer via the `allocate` Rust binary."""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv, dotenv_values

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sawit-allocation-agent")

REPO_ROOT = Path(__file__).resolve().parent.parent
LIVENET_ENV_FILE = Path(os.getenv("LIVENET_ENV_FILE", str(REPO_ROOT / ".env")))

ALLOCATE_BIN = os.getenv("ALLOCATE_BIN", str(REPO_ROOT / "target" / "release" / "allocate"))
READ_STATE_BIN = os.getenv("READ_STATE_BIN", str(REPO_ROOT / "target" / "release" / "read_state"))
STATE_FILE = REPO_ROOT / "agents" / ".allocation_state.json"

CSPR_CLOUD_API = os.getenv("CSPR_CLOUD_API", "https://api.testnet.cspr.cloud")
CSPR_CLOUD_API_KEY = os.getenv("CSPR_CLOUD_API_KEY", "")

TREASURY_ACCOUNT_HASH = os.getenv(
    "TREASURY_ACCOUNT_HASH",
    "e8134d5d5caf9ace626209d09365af48a867a18199b5139da8873733c6c14efe",
)
SAWIT_PRICE_CSPR = int(os.getenv("SAWIT_PRICE_CSPR", "10"))
BUY_MEMO_ID = int(os.getenv("BUY_MEMO_ID", "5417"))
SALE_EPOCH_ENV = os.getenv("SALE_EPOCH", "").strip()
# Own var name — CHECK_INTERVAL_SECONDS already belongs to yield_router (hourly).
CHECK_INTERVAL_SECONDS = int(os.getenv("ALLOCATION_INTERVAL_SECONDS", "60"))

_TREASURY_ACCOUNT_HASH_NORM = TREASURY_ACCOUNT_HASH.replace("account-hash-", "").lower()

_debug_logged_sample = False


def _account_hash_from_public_key(public_key_hex: str) -> str:
    """Casper account-hash = blake2b256( algo_name + 0x00 + key_bytes ), matching the
    derivation already used in agents/mcp_server.py (kept in-agent to avoid adding a new
    pycspr call path; pycspr 1.1.0 is available in requirements.txt as a fallback if this
    ever needs richer key-type handling)."""
    pk = public_key_hex.lower()
    tag, key = pk[:2], bytes.fromhex(pk[2:])
    algo = {"01": b"ed25519", "02": b"secp256k1"}.get(tag)
    if not algo:
        raise ValueError(f"unsupported public key algorithm tag: {tag}")
    h = hashlib.blake2b(algo + b"\x00" + key, digest_size=32)
    return h.hexdigest()


def _normalize_account_hash(value: str) -> str:
    return value.replace("account-hash-", "").lower()


def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            with open(STATE_FILE) as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            log.warning(f"[STATE] failed to load {STATE_FILE}: {e} — starting fresh")
    return {}


def save_state(state: dict) -> None:
    try:
        with open(STATE_FILE, "w") as f:
            json.dump(state, f, indent=2, sort_keys=True)
    except OSError as e:
        log.error(f"[STATE] failed to write {STATE_FILE}: {e}")


def fetch_transfers(page_size: int = 50) -> list[dict]:
    """GET recent transfers into the treasury account from CSPR.cloud."""
    global _debug_logged_sample

    query = urllib.parse.urlencode({"page_size": page_size})
    url = f"{CSPR_CLOUD_API}/accounts/{TREASURY_ACCOUNT_HASH}/transfers?{query}"
    req = urllib.request.Request(url, headers={"Authorization": CSPR_CLOUD_API_KEY})

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        log.error(f"[FETCH] CSPR.cloud request failed: HTTP {e.code} {e.reason}")
        return []
    except Exception as e:
        log.error(f"[FETCH] CSPR.cloud request failed: {e}")
        return []

    items = payload.get("data", [])
    if not isinstance(items, list):
        log.error(f"[FETCH] unexpected response shape (no 'data' list): {str(payload)[:300]}")
        return []

    if not _debug_logged_sample and items:
        log.debug(f"[FETCH] sample transfer item: {json.dumps(items[0])[:800]}")
        _debug_logged_sample = True

    return items


def _extract_deploy_hash(item: dict) -> Optional[str]:
    for key in ("deploy_hash", "transaction_hash", "deployHash"):
        if item.get(key):
            return item[key]
    return None


def _extract_recipient_account_hash(item: dict) -> Optional[str]:
    for key in ("to_account_hash", "recipient", "target_account_hash", "target"):
        if item.get(key):
            return _normalize_account_hash(str(item[key]))
    return None


def _extract_sender_account_hash(item: dict) -> Optional[str]:
    # Prefer a direct account-hash field if the API provides one.
    for key in ("initiator_account_hash", "from_account_hash", "source_account_hash"):
        if item.get(key):
            return _normalize_account_hash(str(item[key]))

    # Otherwise derive from a public key field.
    for key in ("from_purse_public_key", "caller_public_key", "initiator_public_key", "public_key"):
        if item.get(key):
            try:
                return _account_hash_from_public_key(str(item[key]))
            except Exception as e:
                log.warning(f"[FETCH] could not derive account hash from {key}={item[key]}: {e}")
    return None


def _extract_memo(item: dict) -> Optional[int]:
    for key in ("transfer_id", "id"):
        if item.get(key) is not None:
            try:
                return int(item[key])
            except (TypeError, ValueError):
                continue
    return None


def _extract_amount_motes(item: dict) -> Optional[int]:
    if item.get("amount") is None:
        return None
    try:
        return int(item["amount"])
    except (TypeError, ValueError):
        return None


def latest_epoch() -> Optional[int]:
    """Resolve the epoch to allocate against.

    If SALE_EPOCH is set explicitly, use it. Otherwise fall back to the vault's
    `epoch_count` field from read_state's SAWIT_STATE_JSON. This is the closest field
    exposed by read_state to "the epoch tokens should be allocated from": TokenMinter's
    `epoch_mints` records are keyed by the same epoch_number as the ProductionVault epoch
    that was minted from (see token_minter.rs `mint_epoch`, which reads
    `production_vault.get_epoch(epoch_number)`), and `epoch_count` is the latest recorded
    vault epoch. Caveat: if the latest vault epoch hasn't been minted yet (mint_epoch not
    yet called for it), `allocate` will fail fast with ALLOCATE_ERR {"reason":"epoch_not_minted"}
    rather than silently misallocating — so operators should set SALE_EPOCH explicitly during
    any window where vault epoch_count is ahead of the last minted epoch.
    """
    if SALE_EPOCH_ENV:
        try:
            return int(SALE_EPOCH_ENV)
        except ValueError:
            log.error(f"[EPOCH] invalid SALE_EPOCH={SALE_EPOCH_ENV!r} — ignoring")

    if not os.path.exists(READ_STATE_BIN):
        log.error(
            f"[EPOCH] read_state bin not found at {READ_STATE_BIN} and SALE_EPOCH not set — "
            "build it: cargo build -p sawit-deploy --bin read_state --features livenet --release "
            "(or set SALE_EPOCH env var)"
        )
        return None

    env = {**os.environ, **dotenv_values(LIVENET_ENV_FILE)}
    try:
        proc = subprocess.run(
            [READ_STATE_BIN], capture_output=True, text=True, env=env, timeout=130
        )
    except subprocess.TimeoutExpired:
        log.error("[EPOCH] read_state bin timed out")
        return None

    for line in proc.stdout.splitlines():
        if line.startswith("SAWIT_STATE_JSON "):
            try:
                state = json.loads(line[len("SAWIT_STATE_JSON "):])
            except json.JSONDecodeError as e:
                log.error(f"[EPOCH] failed to parse SAWIT_STATE_JSON: {e}")
                return None
            epoch = state.get("epoch_count")
            if epoch is None:
                log.error("[EPOCH] SAWIT_STATE_JSON missing 'epoch_count'")
                return None
            return int(epoch)

    log.error(
        f"[EPOCH] SAWIT_STATE_JSON not found in read_state output (exit {proc.returncode}): "
        f"{(proc.stderr or proc.stdout)[-400:]}"
    )
    return None


def run_allocate(epoch: int, investor_account_hash: str, deposit_cspr: int) -> Optional[dict]:
    """Invoke the `allocate` Rust binary. Returns the parsed allocation dict on success,
    or a dict with {"error": reason} on an expected ALLOCATE_ERR failure. Returns None on
    unexpected failure (bin missing / timeout / crash) — caller should NOT write to state
    in that case so the transfer is retried next cycle."""
    if not os.path.exists(ALLOCATE_BIN):
        log.error(
            f"[ALLOCATE] allocate bin not found at {ALLOCATE_BIN} — build it: "
            "cargo build -p sawit-deploy --bin allocate --features livenet --release"
        )
        return None

    env = {
        **os.environ,
        **dotenv_values(LIVENET_ENV_FILE),
        "ALLOC_EPOCH": str(epoch),
        "ALLOC_INVESTOR": investor_account_hash,
        "ALLOC_DEPOSIT_CSPR": str(deposit_cspr),
        "ALLOC_PRICE_CSPR": str(SAWIT_PRICE_CSPR),
    }

    try:
        proc = subprocess.run(
            [ALLOCATE_BIN], capture_output=True, text=True, env=env, timeout=300
        )
    except subprocess.TimeoutExpired:
        log.error(f"[ALLOCATE] allocate bin timed out for investor={investor_account_hash}")
        return None

    for line in proc.stdout.splitlines():
        if line.startswith("ALLOCATE_OK "):
            try:
                return json.loads(line[len("ALLOCATE_OK "):])
            except json.JSONDecodeError as e:
                log.error(f"[ALLOCATE] failed to parse ALLOCATE_OK json: {e}")
                return None
        if line.startswith("ALLOCATE_ERR "):
            try:
                return {"error": json.loads(line[len("ALLOCATE_ERR "):])}
            except json.JSONDecodeError:
                return {"error": {"reason": "unparseable_allocate_err"}}

    # Some errors surface only on stderr (e.g. env var missing -> panic).
    for line in proc.stderr.splitlines():
        if line.startswith("ALLOCATE_ERR "):
            try:
                return {"error": json.loads(line[len("ALLOCATE_ERR "):])}
            except json.JSONDecodeError:
                return {"error": {"reason": "unparseable_allocate_err"}}

    log.error(
        f"[ALLOCATE] no ALLOCATE_OK/ALLOCATE_ERR sentinel found (exit {proc.returncode}): "
        f"{(proc.stderr or proc.stdout)[-400:]}"
    )
    return None


def process_transfer(item: dict, state: dict) -> str:
    """Process a single candidate transfer item. Returns a short status string for logging.
    Mutates `state` in place and saves it (unless the outcome is a retry-worthy exception)."""
    deploy_hash = _extract_deploy_hash(item)
    if not deploy_hash:
        return "skip_no_deploy_hash"

    if deploy_hash in state:
        return "skip_already_seen"

    recipient = _extract_recipient_account_hash(item)
    if recipient != _TREASURY_ACCOUNT_HASH_NORM:
        return "skip_not_treasury"

    memo = _extract_memo(item)
    if memo != BUY_MEMO_ID:
        return "skip_wrong_memo"

    sender = _extract_sender_account_hash(item)
    if not sender:
        log.warning(f"[PROCESS] deploy={deploy_hash} matched buy memo but sender could not be resolved — skipping (will retry)")
        return "retry_no_sender"

    amount_motes = _extract_amount_motes(item)
    if amount_motes is None:
        log.warning(f"[PROCESS] deploy={deploy_hash} missing amount — skipping (will retry)")
        return "retry_no_amount"

    deposit_cspr = amount_motes // 10**9

    if deposit_cspr < SAWIT_PRICE_CSPR:
        state[deploy_hash] = {
            "status": "too_small",
            "timestamp": time.time(),
            "investor": sender,
            "deposit_cspr": deposit_cspr,
        }
        save_state(state)
        return "too_small"

    epoch = latest_epoch()
    if epoch is None:
        log.warning(f"[PROCESS] deploy={deploy_hash} epoch could not be resolved — skipping (will retry)")
        return "retry_no_epoch"

    result = run_allocate(epoch, sender, deposit_cspr)
    if result is None:
        # unexpected failure: do not write to state, retry next cycle
        return "retry_unexpected_failure"

    if "error" in result:
        state[deploy_hash] = {
            "status": "failed",
            "timestamp": time.time(),
            "investor": sender,
            "deposit_cspr": deposit_cspr,
            "epoch": epoch,
            "reason": result["error"],
        }
        save_state(state)
        log.error(f"[PROCESS] deploy={deploy_hash} allocate failed: {result['error']}")
        return "failed"

    state[deploy_hash] = {
        "status": "allocated",
        "timestamp": time.time(),
        "investor": sender,
        "deposit_cspr": deposit_cspr,
        "epoch": epoch,
        "allocation": result,
    }
    save_state(state)
    log.info(f"[PROCESS] deploy={deploy_hash} ✅ allocated {result.get('allocation')} SAWIT to {sender} (epoch {epoch})")
    return "allocated"


def run_cycle(state: dict) -> None:
    items = fetch_transfers()
    outcomes: dict[str, int] = {}

    for item in items:
        status = process_transfer(item, state)
        outcomes[status] = outcomes.get(status, 0) + 1

    processed = sum(v for k, v in outcomes.items() if k in ("allocated", "failed", "too_small"))
    log.info(
        f"[CYCLE] seen={len(items)} processed_new={processed} outcomes={outcomes}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Sawit Finance allocation agent")
    parser.add_argument("--once", action="store_true", help="run a single cycle and exit")
    args = parser.parse_args()

    log.info("Sawit Finance Allocation Agent starting...")
    log.info(f"Treasury account : {TREASURY_ACCOUNT_HASH}")
    log.info(f"Buy memo id      : {BUY_MEMO_ID}")
    log.info(f"SAWIT price CSPR : {SAWIT_PRICE_CSPR}")
    log.info(f"Check interval   : {CHECK_INTERVAL_SECONDS}s")
    if not CSPR_CLOUD_API_KEY:
        log.warning("[INIT] CSPR_CLOUD_API_KEY not set — CSPR.cloud requests will likely fail")

    state = load_state()

    if args.once:
        run_cycle(state)
        return

    while True:
        try:
            run_cycle(state)
        except Exception as e:
            log.error(f"[CYCLE] unexpected error: {e}", exc_info=True)
        time.sleep(CHECK_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
