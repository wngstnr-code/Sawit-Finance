#!/usr/bin/env python3
"""Sawit Finance — closed-loop agent demo: reads live protocol state, reasons about GORR, and broadcasts a real TokenMinter.update_config() tx on Casper Testnet."""
import asyncio
import os
import textwrap

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

        print("\n[2] REASON — live Gemini market analysis…")
        analysis = await m.run_gemini_analysis(s)
        target = int(analysis.get("gorr_recommendation_bps", gorr))
        engine = m.GEMINI_MODEL if m.GEMINI_API_KEY else "deterministic fallback (no GEMINI_API_KEY set)"
        print(f"      Engine            : {engine}")
        print(f"      Market sentiment  : {analysis.get('market_sentiment', 'N/A')}")
        print(f"      Oracle health     : {analysis.get('oracle_health', 'N/A')}")
        summary = textwrap.fill(
            str(analysis.get("analysis", "n/a")).strip(),
            width=52, initial_indent=" " * 26, subsequent_indent=" " * 26,
        ).lstrip()
        print(f"      Analysis          : {summary}")
        print(f"      Recommendation    : GORR {gorr} → {target} bps")
        print( "                          (safety rails enforced in [3]: band 1%–10%, ±100 bps, 24h cooldown)")

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
