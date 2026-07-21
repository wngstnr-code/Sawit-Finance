# x402 — Official Protocol Integration

Agents pay per-request for gated CPO data over the **official Casper x402 protocol**, using [`@make-software/casper-x402`](https://github.com/make-software/casper-x402) — the same mechanism package that powers the hosted CSPR.cloud Facilitator (`x402-facilitator.cspr.cloud`).

**Proof it's live (Casper Testnet):**

- Payment token: **SAWITX** — a CEP-18 with the `transfer_with_authorization` entry point, deployed for this integration: [`ace00b4d…`](https://testnet.cspr.live/contract-package/ace00b4d5e5e1fb52be4260e0aba9cbf2595992eb599519d6b596b9ff0ea1f2b)
- Live settlement: [`1ea0a5f2…`](https://testnet.cspr.live/deploy/1ea0a5f2c4a03a282055ecb9e826108bb4ad3d04e8e5530d9baf856f27e490f3) — 402 challenge → EIP-712 authorization → on-chain settlement in ~15s, **zero gas paid by the agent** (the facilitator pays gas; the agent only spends SAWITX)
- Oracle paying through the same rails (2026-07-21), one settlement per gated resource: [`59fbfc54…`](https://testnet.cspr.live/deploy/59fbfc54d9d93a39416f3086067257b2b4f3b4361387155f399adaab71352bf8) (`/api/kpbn/price`) and [`da5eef38…`](https://testnet.cspr.live/deploy/da5eef384c9b28ef5fb2f9ef6f4a8deb4e9f6b01fa6a63d7aeb68fb192f664d4) (`/api/mpob/benchmark`) — recorded in `agents/.oracle_provenance.json` as `x402_provenance: "official"`

> The facilitator and the client must use **different keys** (see `.env.example`): the facilitator holds CSPR for gas, the client holds SAWITX. Budget ~4 CSPR of gas per settlement.

## Flow

```
agent.ts ──GET──────────────> server.ts (@x402/express paymentMiddleware)
        <─402 + PaymentRequirements─┘
signs EIP-712 transfer authorization (casper-eip-712 typed data)
        ──GET + PAYMENT-SIGNATURE──> server ──verify/settle──> facilitator.ts
                                                └─ transfer_with_authorization ─> Casper Testnet
        <─200 + live FRED CPO price + PAYMENT-RESPONSE (tx hash)─┘
```

## Run

```bash
npm install
npm run facilitator   # terminal 1 — verifies + settles (needs funded testnet key for gas)
npm run server        # terminal 2 — x402-gated live CPO price endpoint
npm run agent         # terminal 3 — pays 1 SAWITX, prints settlement tx + explorer link
```

`paid-fetch.ts` is a one-shot bridge for the Python agents: `npx tsx paid-fetch.ts <url>` performs the full paid fetch and prints one JSON line (`{ok, data, settlement}`) — the Oracle Agent (`agents/oracle_agent.py`, `fetch_via_x402_official`) uses it to pay for KPBN (`/api/kpbn/price`) and MPOB (`/api/mpob/benchmark`) data inside its verification pipeline, the same subprocess-bridge pattern as `deploy/`'s `read_state`.

Config comes from `.env` here or the repo-root `.env` (see `env.ts`; defaults point at the deployed SAWITX token and Casper Testnet). To settle through the **hosted** CSPR.cloud Facilitator instead of the local one, set `FACILITATOR_URL=https://x402-facilitator.cspr.cloud` and `FACILITATOR_API_KEY=<your CSPR.cloud access token>` — the payload format is identical; nothing else changes.

## Why this repo also has a from-scratch x402 implementation

`agents/x402.py` / `agents/x402_settle.py` predate this integration: a complete x402 handshake built from primitives (ed25519 proofs binding amount/recipient/resource/nonce, replay protection, live native-CSPR settlement). We kept it as a **reference implementation** — it's how we learned the protocol well enough to integrate the official rails correctly, and it documents exactly what a signed payment proof must bind to be safe. Production traffic uses the official protocol path in this directory, which is spec-interoperable: any x402 client can pay our endpoint, and our agent can pay any Casper x402 endpoint.
