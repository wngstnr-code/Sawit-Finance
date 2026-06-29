"""
Sawit Finance — x402 Facilitator + Gated Data Server (demo)
=======================================================
A runnable server that gates mock CPO data (standing in for KPBN/MPOB, which do
not natively speak x402) behind the x402 micropayment protocol.

This makes the agents' x402 client genuinely demonstrable end-to-end over HTTP:

    Terminal 1:  python agents/x402_facilitator.py
    Terminal 2:  python agents/oracle_agent.py        # pays x402, fetches data

Endpoints (each costs 0.01 CSPR via x402):
    GET /api/kpbn/price        → daily CPO tender price
    GET /api/mpob/benchmark    → regional SEA benchmark

Flow per endpoint:
    1. No X-PAYMENT header        → 402 Payment Required + challenge
    2. Valid X-PAYMENT header     → 200 + data (+ X-PAYMENT-RESPONSE)
    3. Invalid/replayed payment   → 402 with the rejection reason

In production the facilitator settles the authorized transfer on Casper Testnet;
in demo mode it cryptographically verifies the signed authorization (ed25519).
"""

import logging
import os

import aiohttp
from aiohttp import web

from cpo_price import fetch_palm_oil_price, FEED_LABEL
from x402 import X402Verifier

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("x402-facilitator")

PRICE_MOTES = int(os.getenv("X402_PRICE_MOTES", "10000000"))  # 0.01 CSPR
HOST = os.getenv("X402_HOST", "127.0.0.1")
PORT = int(os.getenv("X402_PORT", "8402"))

# One verifier instance holds the receiving account + spent-nonce ledger
verifier = X402Verifier(
    pay_to_hex=os.getenv("X402_PAY_TO", None),
    network=os.getenv("X402_NETWORK", "casper-test"),
)

# Mock data each gated endpoint returns once paid
GATED_DATA = {
    "/api/kpbn/price": {
        "source": "KPBN",
        "instrument": "CPO daily tender",
        "price_usd_per_ton": 818.0,
        "price_cents_per_ton": 81_800,
        "currency": "USD",
    },
    "/api/mpob/benchmark": {
        "source": "MPOB",
        "instrument": "SEA regional benchmark",
        "price_usd_per_ton": 832.0,
        "price_cents_per_ton": 83_200,
        "production_tons": 44_800,
    },
}


async def gated_handler(request: web.Request) -> web.Response:
    resource = request.path
    data = GATED_DATA[resource]
    payment_header = request.headers.get("X-PAYMENT")

    # No payment yet → issue a 402 challenge
    if not payment_header:
        challenge = verifier.make_challenge(resource, PRICE_MOTES, f"{data['source']} data access")
        log.info(f"402 → {resource} (challenge issued, {PRICE_MOTES} motes)")
        return web.json_response(challenge, status=402)

    # Payment present → verify it
    ok, reason = verifier.verify(payment_header, resource, PRICE_MOTES)
    if not ok:
        log.warning(f"402 → {resource} payment rejected: {reason}")
        return web.json_response({"error": reason}, status=402)

    # Overlay the live global palm oil price (FRED/IMF) so the paid response is
    # real data, not a static figure. Falls back to the static price if the feed
    # is unreachable.
    data = dict(data)
    async with aiohttp.ClientSession() as feed_session:
        feed = await fetch_palm_oil_price(feed_session)
    if feed:
        price_cents, obs_date = feed
        data["price_cents_per_ton"] = price_cents
        data["price_usd_per_ton"] = round(price_cents / 100, 2)
        data["price_feed"] = FEED_LABEL
        data["observation_date"] = obs_date
        data["live"] = True
        log.info(f"200 → {resource} verified, serving LIVE {data['source']} "
                 f"price ${price_cents/100:,.2f}/ton (obs {obs_date})")
    else:
        data["live"] = False
        log.info(f"200 → {resource} verified, serving static {data['source']} data (feed down)")

    resp = web.json_response(data)
    resp.headers["X-PAYMENT-RESPONSE"] = "settled=demo-verified"
    return resp


def build_app() -> web.Application:
    app = web.Application()
    for resource in GATED_DATA:
        app.router.add_get(resource, gated_handler)
    return app


if __name__ == "__main__":
    log.info("Sawit Finance x402 facilitator starting...")
    log.info(f"Receiving account (payTo): {verifier.pay_to[:24]}...")
    log.info(f"Price per request        : {PRICE_MOTES} motes ({PRICE_MOTES/1e9:.3f} CSPR)")
    log.info(f"Listening on http://{HOST}:{PORT}  → /api/kpbn/price, /api/mpob/benchmark")
    web.run_app(build_app(), host=HOST, port=PORT, print=None)
