# Sawit Finance — Frontend

Next.js 14 (App Router, pinned to `14.2.35`) app for **Sawit Finance**: the landing site plus the
investor dashboard (`/app`) for a fractional, yield-bearing token on verified Indonesian CPO
(crude palm oil) production, on Casper Testnet. Wallet connect is via **CSPR.click**
(Casper Wallet / Ledger).

## Prerequisites

- Node.js 18+ and npm
- A Casper Testnet wallet (CSPR.click-compatible) for the connected-wallet flows
- Optional, for **live** on-chain reads instead of snapshot data: the Rust read/write
  bridge binaries built from the repo root (`cargo build --release -p sawit-deploy`),
  which produce `read_state`, `read_balance`, and `kyc` under `../target/release/`

## Setup

```bash
npm install
cp .env.local.example .env.local   # create if it doesn't exist yet — see vars below
npm run dev                        # http://localhost:3000
```

## Environment variables (`.env.local`)

| Variable | Purpose | Default if unset |
| --- | --- | --- |
| `NEXT_PUBLIC_CSPR_CLICK_APP_ID` | CSPR.click wallet app id (get one from the CSPR.click dashboard) | `csprclick-template` (placeholder) |
| `NEXT_PUBLIC_ACCESS_EMAIL` | Contact email shown on the landing "request access" section | falls back to a maintainer address |
| `READ_STATE_BIN`, `READ_BALANCE_BIN`, `KYC_BIN` | Override paths to the Rust bridge binaries (server-side only) | `../target/release/{read_state,read_balance,kyc}` |
| `LIVENET_ENV_FILE` | Env file with signer keys, passed through to the bridge binaries | `../.env` |
| `CSPR_CLOUD_API_KEY` (or set inside `AGENTS_ENV_FILE`, default `../agents/.env`) | CSPR.cloud key used server-side by `/api/activity` for wallet deploy history | none (activity read is skipped gracefully) |

None of these need real secrets to run the app locally — every API route degrades to
bundled snapshot/demo data when a binary or key is missing (see below).

## Live vs. snapshot data

`/api/state`, `/api/balance`, and `/api/activity` try to read real chain state first
(a serverless-safe JSON-RPC reader, then the Rust bridge as a cross-check/fallback for
local dev). If neither is reachable, they fall back to static data bundled in the app
(`frontend/src/lib/stateSnapshot.ts` for `/api/state`, an inline map for `/api/balance`)
and mark the response with `snapshot: true` (a `cached: true` flag can also appear on a
recently-served live response that's refreshing in the background — that's still real
data, not a fallback). When the app is serving the static snapshot, the investor
dashboard shows a small "Snapshot data — live chain read unavailable" badge in the top
nav.

## Demo KYC (testnet shortcut)

`/app/tools/kyc` calls `/api/demo-kyc`, a self-service shortcut that runs the `kyc` bridge
binary directly (no manual review) so anyone with a Testnet wallet can unlock buying and
claiming without a real KYC provider. This exists for demo/hackathon purposes only.

## Buy flow (SAWIT acquisition)

Buying SAWIT is **not** an atomic on-chain swap. From `/app` (Explore), the app builds a
plain CSPR transfer to the treasury account with a fixed memo/transfer id (`5417`) at a
fixed price (10 CSPR per SAWIT). An off-chain allocation agent watches the treasury,
confirms the transfer on-chain, and allocates the corresponding SAWIT to the sender —
typically within 1–2 minutes of the transfer confirming, not instantly.

## Pages

| Route | Description |
| --- | --- |
| `/` | Marketing/landing site |
| `/app` | Explore — CPO price, distribution yield, fair value, buy SAWIT |
| `/app/portfolio` | Connected wallet's SAWIT/CSPR holdings, share of supply, on-chain activity |
| `/app/tools/claim` | Claim CSPR yield for the latest funded epoch |
| `/app/tools/kyc` | Complete the demo KYC shortcut described above |

## Learn more

See the [root README](../README.md) for the full-stack picture (contracts, agents, x402,
MCP server) and how to run the whole system end to end.
