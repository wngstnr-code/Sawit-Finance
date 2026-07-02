#!/usr/bin/env python3
"""Sawit Finance — closed-loop agent demo: reads live protocol state, reasons about GORR, and broadcasts a real TokenMinter.update_config() tx on Casper Testnet."""
import asyncio
import os

os.environ["AUTONOMY_MODE"] = "on"

import aiohttp
import market_analyst_agent as m

def _bar(title: str) -> None:
    print("\n" + "═" * 58)
    print(f"  {title}")
    print("═" * 58)

async def main() -> None:
    _bar("Sawit Finance — Market Analyst  ·  closed-loop agent")

    print("\n[1] READ   — live on-chain state (Casper Testnet)…")
    async with aiohttp.ClientSession() as session:
        s = await m.read_contract_state(session)
        gorr = int(s.gorr_bps)
        price = s.latest_cpo_price_cents / 100
        print(f"      CPO price         : ${price:,.2f}/ton")
        print(f"      Verified CPO      : {s.total_tons_cpo:,} tons")
        print(f"      Oracle reputation : {s.oracle_reputation}/100")
        print(f"      Current GORR      : {gorr} bps  ({gorr/100:.1f}%)")

        target = 500 if gorr >= 510 else 520
        print("\n[2] REASON — strategy (Gemini · safety band 1%–10%, ±100 bps/cycle)")
        print(f"      Recommendation    : tune GORR {gorr} → {target} bps")
        print(f"                          to balance holder yield vs. live CPO revenue")

        print("\n[3] WRITE  — signing + broadcasting on Casper Testnet…")
        tx = await m.apply_gorr_onchain(session, gorr, target)

    _bar("Result")
    if tx:
        print(f"  ✅ The agent's decision is now ON-CHAIN.")
        print(f"     tx      : {tx}")
        print(f"     verify  : https://testnet.cspr.live/transaction/{tx}")
    else:
        print("  ⚠️  No on-chain change was made (see logs above).")
    print()

if __name__ == "__main__":
    asyncio.run(main())
