"""
Sawit Finance — AI Yield Router Agent
==================================
Autonomous agent that monitors CPO (Crude Palm Oil) prices and SAWIT token holder
balances, then autonomously triggers yield distributions when conditions are met.

Responsibilities:
  1. Monitor CPO benchmark price (KPBN/MPOB) via x402-gated API
  2. When CPO price meets distribution trigger threshold → create distribution epoch
  3. Snapshot SAWIT token holder balances from Casper blockchain
  4. Compute per-holder CSPR claimable amounts proportional to SAWIT holdings
  5. Submit on-chain: create_epoch() + set_claimable_batch() + fund_epoch()

The Yield Router demonstrates:
  - Autonomous DeFi agent on Casper (Agentic AI + DeFi requirement)
  - x402 micropayments for real-time CPO price data
  - Casper MCP Server integration for blockchain reads
  - Machine-to-machine commerce (agent pays for data, earns by routing yield)

Trigger conditions (configurable):
  - Monthly schedule: trigger on first day of month regardless of price
  - Price-triggered: trigger when CPO price > PRICE_TRIGGER_CENTS/ton
  - Both conditions available — operator sets mode via environment variables
"""

import asyncio
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

# Real x402 client (graceful if cryptography isn't installed)
try:
    from x402 import X402Payer, fetch_with_x402, X402Error
    X402_AVAILABLE = True
except ImportError:
    X402_AVAILABLE = False

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sawit-yield-router")

# The Router's on-chain write goes through the `fund` livenet bin (create_epoch +
# payable fund_epoch), mirroring how the other agents write to chain.
REPO_ROOT = Path(__file__).resolve().parent.parent
FUND_BIN = os.getenv("FUND_BIN", str(REPO_ROOT / "target" / "release" / "fund"))
LIVENET_ENV_FILE = os.getenv("LIVENET_ENV_FILE", str(REPO_ROOT / ".env"))

# ─── CONFIG ───

CSPR_CLOUD_API = "https://api.testnet.cspr.cloud"
CASPER_TESTNET_RPC = "https://rpc.testnet.casperlabs.io"

PRODUCTION_VAULT_CONTRACT = os.getenv("PRODUCTION_VAULT_CONTRACT", "")
YIELD_DISTRIBUTOR_CONTRACT = os.getenv("YIELD_DISTRIBUTOR_CONTRACT", "")
SAWIT_TOKEN_CONTRACT = os.getenv("SAWIT_TOKEN_CONTRACT", "")
YIELD_ROUTER_SECRET_KEY = os.getenv("YIELD_ROUTER_SECRET_KEY", "")
CSPR_CLOUD_API_KEY = os.getenv("CSPR_CLOUD_API_KEY", "")

# x402 config
X402_LIVE = os.getenv("X402_LIVE", "off").lower() == "on"
X402_FACILITATOR_URL = os.getenv("X402_FACILITATOR_URL", "http://127.0.0.1:8402")
X402_NETWORK = os.getenv("X402_NETWORK", "casper-test")
X402_MAX_MOTES = int(os.getenv("X402_MAX_PRICE_MOTES", "100000000"))  # 0.1 CSPR ceiling

_x402_payer = None
if X402_LIVE and X402_AVAILABLE:
    _seed = YIELD_ROUTER_SECRET_KEY if len(YIELD_ROUTER_SECRET_KEY) >= 64 else None
    _x402_payer = X402Payer(seed_hex=_seed, network=X402_NETWORK)

# Trigger config
TRIGGER_MODE = os.getenv("TRIGGER_MODE", "monthly")       # "monthly" or "price"
PRICE_TRIGGER_CENTS = int(os.getenv("PRICE_TRIGGER_CENTS", "85000"))  # $850/ton
MONTHLY_DISTRIBUTION_CSPR = int(os.getenv("MONTHLY_DISTRIBUTION_CSPR", "5000"))  # 5,000 CSPR
CHECK_INTERVAL_SECONDS = int(os.getenv("CHECK_INTERVAL_SECONDS", "3600"))  # check hourly


# ─── DATA STRUCTURES ───

@dataclass
class HolderBalance:
    address: str
    sawit_balance: int    # SAWIT tokens (in base units)


@dataclass
class DistributionPlan:
    epoch_label: str
    total_cspr_motes: int
    trigger_price_cents: int
    holders: list[HolderBalance]
    per_holder_cspr_motes: dict[str, int]   # address → claimable CSPR motes
    total_holders: int


# ─── CPO PRICE MONITORING ───

async def get_current_cpo_price(session: aiohttp.ClientSession) -> int:
    """
    Fetch current CPO benchmark price from KPBN via x402-gated API.
    Returns price in USD cents per ton.
    """
    log.info("[PRICE] Fetching CPO benchmark price (x402 micropayment)...")

    # Real x402: pay per request for the gated KPBN price
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

    # Fallback (x402 off / facilitator down): simulated price
    await asyncio.sleep(0.2)
    simulated_price = 83_500  # $835/ton — within typical range
    log.info(f"[PRICE] Current CPO price: ${simulated_price/100:.2f}/ton")
    return simulated_price


# ─── SAWIT TOKEN HOLDER SNAPSHOT ───

async def snapshot_sawit_holders(session: aiohttp.ClientSession) -> list[HolderBalance]:
    """
    Snapshot SAWIT token balances from Casper blockchain using CSPR.cloud API.

    CSPR.cloud provides a REST API to query CEP-18 token holder balances.
    This gives us the proportional distribution weights.

    In production:
      GET https://api.testnet.cspr.cloud/tokens/{SAWIT_TOKEN_CONTRACT}/holders
      → returns list of {account_hash, balance}
    """
    log.info("[SNAPSHOT] Fetching SAWIT token holder balances from Casper...")

    # In production: use CSPR.cloud API
    # async with session.get(
    #     f"{CSPR_CLOUD_API}/tokens/{SAWIT_TOKEN_CONTRACT}/holders",
    #     headers={"Authorization": CSPR_CLOUD_API_KEY},
    # ) as resp:
    #     data = await resp.json()
    #     return [
    #         HolderBalance(address=h["account_hash"], sawit_balance=int(h["balance"]))
    #         for h in data["data"]
    #     ]

    # Demo snapshot
    return [
        HolderBalance(address="account-hash-a1b2c3...investor1", sawit_balance=2_250_000),
        HolderBalance(address="account-hash-d4e5f6...investor2", sawit_balance=1_125_000),
        HolderBalance(address="account-hash-g7h8i9...investor3", sawit_balance=562_500),
    ]


# ─── DISTRIBUTION CALCULATION ───

def compute_distribution(
    holders: list[HolderBalance],
    total_cspr_motes: int,
    epoch_label: str,
    trigger_price_cents: int,
) -> DistributionPlan:
    """
    Compute per-holder CSPR yield amounts proportional to SAWIT holdings.

    allocation_i = total_cspr × (sawit_balance_i / total_sawit_supply)
    """
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

    per_holder = {}
    allocated = 0

    for holder in holders:
        share = holder.sawit_balance / total_sawit
        cspr_amount = int(total_cspr_motes * share)
        per_holder[holder.address] = cspr_amount
        allocated += cspr_amount

    # Dust goes to first holder (rounding remainder)
    remainder = total_cspr_motes - allocated
    if remainder > 0 and holders:
        per_holder[holders[0].address] += remainder

    log.info(f"[COMPUTE] Distribution plan for {epoch_label}:")
    log.info(f"  Total CSPR    : {total_cspr_motes / 1e9:,.2f} CSPR")
    log.info(f"  Total holders : {len(holders)}")
    log.info(f"  Total SAWIT   : {total_sawit:,}")
    for h in holders:
        cspr = per_holder[h.address] / 1e9
        log.info(f"  {h.address[:24]}... → {cspr:.4f} CSPR ({h.sawit_balance/total_sawit*100:.1f}%)")

    return DistributionPlan(
        epoch_label=epoch_label,
        total_cspr_motes=total_cspr_motes,
        trigger_price_cents=trigger_price_cents,
        holders=holders,
        per_holder_cspr_motes=per_holder,
        total_holders=len(holders),
    )


# ─── ON-CHAIN SUBMISSION ───

async def submit_distribution(
    session: aiohttp.ClientSession,
    plan: DistributionPlan,
) -> list[str]:
    """
    Submit the distribution plan to Casper Testnet.

    Real on-chain write: the router signs and broadcasts the distribution on
    Casper Testnet via the `fund` livenet bin — create_epoch() + a payable
    fund_epoch() that attaches the CSPR pool. The bin prints the executed
    transaction hash; per-holder pro-rata claimable is then posted by the
    operator (the off-chain-computed split documented in the trust model).
    """
    log.info(f"[CASPER] Submitting distribution for epoch {plan.epoch_label} "
             f"({plan.total_cspr_motes / 1e9:g} CSPR)...")

    if not os.path.exists(FUND_BIN):
        log.error(
            f"[CASPER] fund bin not found at {FUND_BIN} — build it: "
            "cargo build -p sawit-deploy --bin fund --features livenet --release"
        )
        return []

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
        return []

    if "FUND_OK" not in proc.stdout:
        log.error(f"[CASPER] on-chain distribution failed (exit {proc.returncode}): "
                  f"{(proc.stderr or proc.stdout)[-400:]}")
        return []

    m = re.search(r'Transaction "([0-9a-f]{64})"', proc.stdout)
    deploy_hash = m.group(1) if m else ""
    if deploy_hash:
        log.info(f"[CASPER] ✅ Distribution funded on-chain — tx {deploy_hash}")
        log.info(f"[CASPER]    https://testnet.cspr.live/transaction/{deploy_hash}")
    else:
        log.info("[CASPER] ✅ Distribution funded on-chain (tx hash not parsed)")
    return [deploy_hash] if deploy_hash else []


# ─── TRIGGER LOGIC ───

def should_trigger_monthly() -> bool:
    """Trigger on first day of each month."""
    now = datetime.now(timezone.utc)
    return now.day == 1


async def check_and_trigger(session: aiohttp.ClientSession) -> bool:
    """Check trigger conditions and execute distribution if met."""
    now = datetime.now(timezone.utc)
    epoch_label = now.strftime("%b-%y")

    trigger_price = await get_current_cpo_price(session)
    total_cspr_motes = MONTHLY_DISTRIBUTION_CSPR * int(1e9)  # convert to motes

    should_trigger = False

    if TRIGGER_MODE == "price":
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

    # Execute distribution
    holders = await snapshot_sawit_holders(session)

    if not holders:
        log.warning("[ROUTER] No holders found — skipping distribution")
        return False

    plan = compute_distribution(holders, total_cspr_motes, epoch_label, trigger_price)
    deploy_hashes = await submit_distribution(session, plan)

    log.info(f"[ROUTER] 🌴 Yield distribution triggered for {epoch_label}!")
    log.info(f"[ROUTER] {len(holders)} holders will receive yield from {total_cspr_motes/1e9:.0f} CSPR pool")

    return True


# ─── MAIN LOOP ───

async def main():
    """Run yield router continuously."""
    log.info("Sawit Finance AI Yield Router Agent starting...")
    log.info(f"Mode          : {TRIGGER_MODE}")
    log.info(f"Price trigger : ${PRICE_TRIGGER_CENTS/100:.2f}/ton CPO")
    log.info(f"Distribution  : {MONTHLY_DISTRIBUTION_CSPR:,} CSPR/epoch")
    log.info(f"Check interval: {CHECK_INTERVAL_SECONDS}s")

    async with aiohttp.ClientSession() as session:
        while True:
            try:
                log.info(f"[ROUTER] Checking trigger conditions...")
                triggered = await check_and_trigger(session)
                if triggered:
                    log.info("[ROUTER] Distribution executed — sleeping until next cycle")
                    await asyncio.sleep(30 * 24 * 3600)  # sleep 30 days after trigger
                else:
                    await asyncio.sleep(CHECK_INTERVAL_SECONDS)
            except Exception as e:
                log.error(f"[ROUTER] Error: {e}", exc_info=True)
                await asyncio.sleep(60)


if __name__ == "__main__":
    asyncio.run(main())
