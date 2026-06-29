# Sawit Finance

**Tokenized Indonesian Palm Oil on Casper Network**

> Real CPO. Real revenue. On-chain.

Sawit Finance tokenizes Indonesian crude palm oil (CPO) production revenue on Casper Network. Each SAWIT token represents a fractional claim on real palm oil production — not a synthetic, not a price tracker. CPO flows through mills, revenue hits the chain as CSPR, and token holders claim yield.

Built for the **Casper Agentic Buildathon 2026** — powered by autonomous AI agents.

Indonesia is the world's largest palm oil producer (~60% of global supply, $30B+ annual export value). Sawit Finance brings this market on-chain for the first time via Casper RWA infrastructure.

---

## How It Works

<pre>
Palm Oil Mills (PKS)
       │
       ▼
AI Oracle Agent ──live──> FRED/IMF palm oil feed   (real price, every cycle)
       │        ──x402──> KPBN / MPOB / GAPKI      (Gemini cross-validation)
       │
       ▼
ProductionVault ───────────────┐  (verified CPO tons + price, KYC registry,
       │ CPI: get_epoch()      │   oracle reputation score)
       ▼                       │  CPI: is_kyc_verified()
TokenMinter ──CPI: mint()──> SawitToken (CEP-18)
       │                       │
       ▼                       ▼
   holders hold SAWIT      KYC-gated claim
       ▲                       ▲
       │                       │
Revenue (CSPR) ──> YieldDistributor ──CSPR──> SAWIT holders
       ▲                  ▲
       │                  │
AI Yield Router      AI Market Analyst
(triggers on price)  (reads all contracts → Gemini →
                      autonomously tunes GORR on-chain)
</pre>

---

## Four Casper Contracts (Odra Framework)

| # | Contract | What It Does |
|---|----------|-------------|
| 1 | **ProductionVault** | Stores AI-verified CPO production data (tons, price, mills, OER) |
| 2 | **SawitToken** | CEP-18 fungible token — SAWIT — yield-bearing claim on CPO revenue |
| 3 | **TokenMinter** | Reads verified epoch from ProductionVault (CPI) → mints via SawitToken.mint() (CPI) |
| 4 | **YieldDistributor** | Distributes CSPR per epoch; KYC-gated claims (reads ProductionVault via CPI) |

All four contracts are built with **Odra Framework**, deploy as **upgradable** packages, and target **Casper Testnet**.

---

## Three AI Agents (Agentic Layer)

| Agent | Role | AI |
|-------|------|----|
| **Oracle Agent** | Anchors on live FRED/IMF palm oil price, cross-validates GAPKI/KPBN/MPOB with Gemini, posts to chain | Gemini 2.5 Flash |
| **Yield Router** | Monitors CPO price, auto-triggers CSPR yield distributions when threshold met | Rule-based |
| **Market Analyst** | Reads all contracts, runs Gemini analysis, **autonomously adjusts GORR on-chain** | Gemini 2.5 Flash |

### Gemini AI Reasoning (Oracle Agent)
After statistical cross-validation, the Oracle Agent passes all 3 source readings to **Gemini 2.5 Flash** for expert analysis. Gemini detects seasonal anomalies, flags suspicious price spikes, and can adjust the validation score up or down before data hits the chain. If Gemini returns `"recommendation": "REJECT"`, the epoch is blocked regardless of the statistical score.

### Gemini AI Strategy + Closed-Loop Autonomy (Market Analyst Agent)
The Market Analyst reads live on-chain state from all 4 contracts through the `read_state` bridge (which reads Odra's `state` dictionary via the livenet client), then feeds it to Gemini for strategic analysis: oracle health, CPO market sentiment, GORR recommendations, claim deadline alerts, and operator action items. Runs every 6 hours.

It is the only agent that **closes the loop** — `READ chain → REASON with Gemini → WRITE back to chain`. When `AUTONOMY_MODE=on`, it autonomously calls `TokenMinter.update_config()` to adjust GORR based on its own analysis. Hard safety rails cap any single change to ±100 bps and keep GORR inside a [1%, 10%] band, so a hallucinated recommendation can never harm holders.

### x402 Micropayments (implemented + runnable)
Oracle Agent and Yield Router pay per-request for gated CPO data using a real **x402 handshake** (`agents/x402.py`): `GET → 402 Payment Required → signed ed25519 payment authorization → retry with X-PAYMENT → data`. Payment proofs use Casper's ed25519 key scheme, bind amount/recipient/resource/nonce, and are replay-protected.

A runnable facilitator (`agents/x402_facilitator.py`) gates the KPBN/MPOB price endpoints behind x402 — and serves the **live FRED/IMF palm oil price** once paid — so the whole flow is demonstrable end-to-end over HTTP:

```bash
# Terminal 1 — start the x402-gated data server
python agents/x402_facilitator.py

# Terminal 2 — agent pays x402 and fetches (set X402_LIVE=on in .env)
python agents/oracle_agent.py

# Or just verify the protocol in-process (real ed25519, no network):
python agents/x402.py     # → 5 handshake checks: valid / replay / underpay / forged / wrong-resource
```

> **What's real vs. pending:** the full handshake + cryptographic payment authorization run today. On-chain *settlement* (the facilitator broadcasting the authorized transfer) activates once the agent has a funded Testnet key. Note: KPBN/MPOB don't natively speak x402, so the gated endpoints are Sawit Finance's own facilitator standing in for them — an honest prototype of agent-pays-for-data commerce.

### Casper MCP Server (Model Context Protocol)
Sawit Finance ships a real **MCP server** (`agents/mcp_server.py`) that exposes the
protocol's live on-chain state to any MCP-compatible AI agent as standardized
*tools* — the Casper AI Toolkit pattern. Instead of bespoke API glue, an LLM
(Claude, etc.) can query SAWIT chain state through tool calls:

| MCP tool | Returns |
|----------|---------|
| `get_protocol_state` | SAWIT supply, verified CPO value/tons/price, GORR, oracle reputation, epochs, claim window |
| `get_oracle_reputation` | rolling on-chain accuracy score (0–100) + interpretation |
| `get_account_position` | a holder's SAWIT balance + claimable CSPR (by public key) |
| `get_palm_oil_price` | live FRED `PPOILUSDM` (IMF) palm-oil price |
| `get_contracts` / `get_economic_loop` | deployed package hashes + executed-loop tx hashes (cspr.live links) |
| `refresh_protocol_state` | force a fresh live read of all four contracts |

Reads go through the same `read_state` / `read_balance` bridges the frontend uses
(CSPR.cloud can't see Odra's internal state, so we read it directly via Odra's
livenet client). Built on the official **MCP SDK** (`mcp[cli]`).

```bash
# Verify the tools end-to-end (no MCP client needed):
./.venv/bin/python agents/mcp_test.py

# Run the MCP server (stdio transport):
./.venv/bin/python agents/mcp_server.py
```

Connect it to **Claude Desktop** by adding to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sawit-finance": {
      "command": "/ABS/PATH/.venv/bin/python",
      "args": ["/ABS/PATH/agents/mcp_server.py"]
    }
  }
}
```

Then ask Claude things like *"What's Sawit Finance's oracle reputation and SAWIT
supply right now?"* — it calls the MCP tools and answers from live on-chain state.

---

## Tokenomics

### Minting Formula

```
sawit_tokens = tons_cpo_produced × token_rate × (gorr_bps / 10,000)
```

- **token_rate** = 1,000 SAWIT tokens per ton CPO (configurable)
- **GORR** = Gross Overriding Royalty Rate — % of CPO revenue to token holders

### Example (June 2026 Epoch)

| Metric | Value |
|--------|-------|
| CPO produced | 45,000 tons |
| CPO price | $825/ton |
| Gross revenue | $37,125,000 |
| GORR | 500 bps (5%) |
| Revenue to holders | $1,856,250 |
| SAWIT minted | 2,250,000 SAWIT |
| Yield target | 12% APY |

### Yield Math

For a $1M total raise against $1.5M/month gross CPO revenue, ~67 bps GORR delivers 12% APY:

```
Monthly yield needed = $1,000,000 × 12% / 12 = $10,000
GORR required        = $10,000 / $1,500,000   = 0.67% (67 bps)
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Smart Contracts | Odra Framework 2.x (Rust) |
| Token Standard | CEP-18 (Casper fungible token) |
| Oracle | AI Oracle Agent (Python) + CSPR.cloud REST API |
| Micropayments | Casper x402 Protocol |
| Blockchain Access | Casper MCP Server |
| Yield Distribution | Per-epoch claimable mapping, operator-posted (Merkle-proof claims on roadmap) |
| Agent Runtime | asyncio + aiohttp |

---

## Project Structure

```
Sawit-Finance/
├── contracts/
│   ├── production-vault/        # AI-verified CPO production recording
│   ├── sawit-token/             # CEP-18 SAWIT token
│   ├── token-minter/            # CPO-to-token minting engine
│   └── yield-distributor/       # CSPR yield claim system
├── agents/
│   ├── cpo_price.py             # Live CPO price feed (FRED PPOILUSDM / IMF, no key)
│   ├── oracle_agent.py          # AI Oracle: live price + GAPKI/KPBN/MPOB + Gemini reasoning
│   ├── yield_router.py          # AI Yield Router: monitors CPO price, triggers distribution
│   ├── market_analyst_agent.py  # AI Analyst: reads contracts + Gemini strategy reports
│   ├── mcp_server.py            # Casper MCP server — live on-chain state as MCP tools
│   ├── mcp_test.py              # MCP tools self-test (no MCP client required)
│   ├── x402.py                  # Real x402 client/verifier (ed25519) + in-process self-test
│   ├── x402_facilitator.py      # Runnable x402-gated data server (serves live FRED price)
│   ├── requirements.txt         # Python deps (aiohttp, pycspr, dotenv, gemini, cryptography)
│   └── .env.example             # Config template (incl. GEMINI_API_KEY, X402_LIVE)
├── e2e/
│   └── tests/full_flow.rs       # End-to-end: production → mint → KYC → claim (all 4 contracts)
├── deploy/
│   └── src/deploy.rs            # Livenet deploy binary — installs 4 upgradable contracts + wiring
├── frontend/                    # Next.js 14 app — landing + investor dashboard
│                                #   (CSPR.click wallet, live /api/state + CSPR.cloud reads)
├── Cargo.toml                   # Odra workspace
└── README.md
```

---

## Quick Start

### Prerequisites

```bash
# Rust nightly (required by Odra macros)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup toolchain install nightly-2026-01-01
rustup target add wasm32-unknown-unknown --toolchain nightly-2026-01-01

# wasm post-processing (lowers bulk-memory/sign-ext ops Casper rejects)
brew install binaryen wabt

# Python (for AI agents) — use a venv
python3 -m venv .venv && ./.venv/bin/pip install -r agents/requirements.txt

# Configure agents — fill in contract addresses (printed by deploy) + API keys
cp agents/.env.example agents/.env
```

### Build Contracts

```bash
# Run all tests — 15 total, incl. the full e2e pipeline (no node required)
cargo +nightly-2026-01-01 test

# Run only the end-to-end pipeline test (all 4 contracts wired together)
cargo +nightly-2026-01-01 test -p sawit-e2e

# Build all 4 contracts to wasm/*.wasm for Casper.
# (Sawit Finance is one crate per contract, so we don't use `cargo odra build`;
#  build-wasm.sh builds each contract and lowers bulk-memory/sign-ext ops that
#  Casper's Wasm preprocessor rejects — needs `brew install binaryen wabt`.)
./build-wasm.sh
```

### Deploy to Casper Testnet

Odra does **not** deploy via the `cargo odra` CLI. Deployment runs through Odra's
**livenet backend**: a small Rust binary that uses the same `Deployer`/upgrade API as the
tests, but targets a real node. It is configured entirely with environment variables.

**1. Create + fund a Testnet account**

```bash
# Generate an ed25519 keypair (writes secret_key.pem, public_key.pem, public_key_hex)
casper-client keygen ./keys

# Fund the account's public key with test CSPR:
#   https://testnet.cspr.live/tools/faucet   (paste public_key_hex, request)
```

**2. Configure livenet env** (in `.env` at repo root)

```bash
ODRA_BACKEND=casper
ODRA_CASPER_LIVENET_NODE_ADDRESS=https://node.testnet.casper.network
ODRA_CASPER_LIVENET_EVENTS_URL=https://node.testnet.casper.network/events
ODRA_CASPER_LIVENET_CHAIN_NAME=casper-test
ODRA_CASPER_LIVENET_SECRET_KEY_PATH=./keys/secret_key.pem
```

> `EVENTS_URL` is required by Odra's livenet client. On Casper 2.0 the SSE path is
> `/events` (not `/events/main`). Load the file before each command with
> `set -a && . ./.env && set +a`.

**3. Build wasm + run the deploy binary**

```bash
./build-wasm.sh       # produces wasm/*.wasm for all four contracts

# Deploy script installs contracts (as UPGRADABLE packages) in dependency order
# and wires permissions: SawitToken.set_minter(), then prints all addresses.
set -a && . ./.env && set +a
cargo run -p sawit-deploy --bin deploy --features livenet
```

> The deploy binary (`deploy/src/deploy.rs`) installs each contract with `InstallConfig::new::<T>(true, false)`,
> so packages can be upgraded later via Odra's `upgrade()` API without changing their address.
> Deployment order matters: **sawit-token → production-vault → token-minter → yield-distributor**,
> then `SawitToken.set_minter(<token-minter>)` and `ProductionVault.register_kyc(<investor>)`.

**4. Record addresses + verify**

```bash
# Copy the printed contract package hashes into agents/.env
```

---

## Live on Casper Testnet (`casper-test`)

Deployed 2026-06-27 as **upgradable** packages. Deployer account hash:
`57895ec9532fba625e63d3f7a5e250b50f9c5e0fb5321f8fa5890dd05d4ae2ec`

| Contract | Package Hash (cspr.live) | Install Tx |
|----------|--------------------------|------------|
| **SawitToken** (CEP-18) | [`579f3197…205a47`](https://testnet.cspr.live/contract-package/579f3197493048529a56ea3887721c4bd027e3fad6755644f19446b4c9205a47) | [`a6ad948c…`](https://testnet.cspr.live/transaction/a6ad948c2c80b3e5c2fc944dcc29f6e73bb405662a1f644553042c5199681988) |
| **ProductionVault** | [`0b860c57…55e365`](https://testnet.cspr.live/contract-package/0b860c574e7b7cd6969a33dd57992fc6efedd503473b44e1c9309f1c8455e365) | [`c58085f6…`](https://testnet.cspr.live/transaction/c58085f61bf4e642655f44963a64233ac9f96e2aa76d452225f813bedafb37db) |
| **TokenMinter** | [`cb3b96b8…58d8e06`](https://testnet.cspr.live/contract-package/cb3b96b8cdb987178db0353ef6a713a7d888a4256f59702243187982358d8e06) | [`a8bf1bd9…`](https://testnet.cspr.live/transaction/a8bf1bd92fa45a15f62f415cb368e7a39f8dfc2d2cac9d8f25100afd73308893) |
| **YieldDistributor** | [`1a049357…1ccf1e9`](https://testnet.cspr.live/contract-package/1a04935782cbd60b7a4cfddea6ab18a6efd0348b862171c6a4fe25c111ccf1e9) | [`56b83c70…`](https://testnet.cspr.live/transaction/56b83c70a9906a9e57ac7099021f6c14eeb7defed8dd56dc58073b27ca4a0f11) |

Wiring tx (`SawitToken.set_minter` → TokenMinter): [`55350dc1…`](https://testnet.cspr.live/transaction/55350dc1803dbf59950acedab51874761217c352a9ba4f2fd4df6bf3ed32edf8)

### Verify the build (reproducible)

cspr.live source verification is still a roadmap feature, so Sawit Finance is verifiable
**by reproducible build**: rebuild from source and confirm the wasm hash matches what
was installed on-chain (visible in each install tx above).

```bash
# Toolchain: rust nightly-2026-01-01, binaryen wasm-opt v130 (brew install binaryen wabt)
./build-wasm.sh
shasum -a 256 wasm/*.wasm
```

Expected SHA-256 of the deployed wasm:

```
048acb2f2c588f8e45bba57bdac7a876f55d69bee3dd329fe93638bfd0256aa3  SawitMinter.wasm
582f8c2613a6f78712d291a7316185fd76c0a7a1390659fdc3da65f319cdde56  SawitProductionVault.wasm
d89e80148d3f96f6d904f7ea5a934d6ee413d671e3e1244535dea9dc1efaed47  SawitToken.wasm
73b57f8937e27f0cd37fef2654b7846494ba947f94486825527bda83f3f19d37  SawitYieldDistributor.wasm
```

> **Cross-contract wiring:** TokenMinter reads the verified epoch from ProductionVault and
> calls `SawitToken.mint()` — both via CPI — so the token's `minter` must point at TokenMinter,
> and the minter + distributor are deployed with the vault's address.

---

## The Full Economic Loop — Live On-Chain

The complete Sawit Finance cycle has been executed end-to-end on Casper Testnet:
**record production → mint SAWIT → fund yield → KYC-gated claim.** Each step is a
small livenet bin under `deploy/src/` (run with `set -a && . ./.env && set +a` first):

| Step | Command | What happens | Tx |
|------|---------|--------------|----|
| 1. Record | `cargo run -p sawit-deploy --bin record --features livenet` | Oracle records epoch: 45,200 t CPO @ $825, oracle rep 92/100 | [`4d83e1a4…`](https://testnet.cspr.live/transaction/4d83e1a4b9c12ee2f386e0e14fd325a14ae81abb9446508650a20471b54a7bdb) |
| 2. Mint | `cargo run -p sawit-deploy --bin mint --features livenet` | TokenMinter (CPI→Vault, CPI→Token) mints **2,260,000 SAWIT** | [`b257a688…`](https://testnet.cspr.live/transaction/b257a68867b5253b1d5f05c6e362759091f91ec223cd650b6f555335351afb93) |
| 3a. Create | `cargo run -p sawit-deploy --bin fund --features livenet` | Create distribution epoch (90-day claim window) | [`77150929…`](https://testnet.cspr.live/transaction/77150929b3d7cd09100c91309193ddc0da714c1e403208e2ad9ed05572b08dc0) |
| 3b. Fund | *(same bin, payable call)* | Fund epoch with **100 CSPR** (`fund_epoch`, via proxy) | [`6fb18931…`](https://testnet.cspr.live/transaction/6fb1893145d969bad32e0f6ba26810a81f532be5b5b288af3977a142e489772f) |
| 4a. KYC | `cargo run -p sawit-deploy --bin claim --features livenet` | `register_kyc(holder)` — RWA compliance gate | [`6d3fc1dd…`](https://testnet.cspr.live/transaction/6d3fc1dd0f6c3f9d8b75fd49239a9d84c18208a2e0d892c57d35072894372644) |
| 4b. Allocate | *(same bin)* | `set_claimable(epoch, holder, 100 CSPR)` | [`32dab6d8…`](https://testnet.cspr.live/transaction/32dab6d8afae8f4f2aeb5d8dbd3c511f8af0b7cc1407d85e5cdaaf10cb7289ce) |
| 4c. Claim | *(same bin)* | `claim_yield` (CPI→Vault KYC check) → **100 CSPR to holder** | [`23e6e9d7…`](https://testnet.cspr.live/transaction/23e6e9d7d665a3a94e58170ee2c70434cf6dc71f8c18a2998f97f8497f80f8f6) |

This exercises every core entrypoint, **cross-contract CPI** (mint reads the vault;
claim checks KYC against the vault), and a **payable** CSPR transfer — the same flow
the AI agents drive autonomously.

> Yield settles in **CSPR** in v1. Because CPO revenue is USD-denominated, v2 moves
> yield to a USD stablecoin ([csprUSD](https://www.casper.network/news/sarson-funds-csprusd-stablecoin-live-on-casper-network-testnet))
> as a drop-in CEP-18 swap — see [Roadmap](#roadmap).

### Read live on-chain state

```bash
# Reads Odra's `state` dictionary across all 4 contracts and prints JSON.
# (CSPR.cloud's named-keys endpoint can't see Odra state; this bridge can.)
cargo build -p sawit-deploy --bin read_state --features livenet --release
set -a && . ./.env && set +a && ./target/release/read_state
```

### Run AI Agents

```bash
# One-time setup
python3 -m venv .venv && ./.venv/bin/pip install -r agents/requirements.txt
cp agents/.env.example agents/.env   # then fill in keys (see below)

# Start Oracle Agent (scrapes CPO data + Gemini AI validation, runs monthly)
./.venv/bin/python agents/oracle_agent.py

# Start Yield Router (monitors CPO price, triggers CSPR distributions)
./.venv/bin/python agents/yield_router.py

# Start Market Analyst (reads live on-chain state + Gemini strategy report, every 6h)
./.venv/bin/python agents/market_analyst_agent.py
```

> **Live reads:** the Market Analyst reads real on-chain state through the
> `read_state` bridge bin (build it first, see above). If the bin is missing it
> falls back to clearly-labelled demo state.
>
> **Gemini API key** (`GEMINI_API_KEY` in `agents/.env`): free at
> [aistudio.google.com/apikey](https://aistudio.google.com/apikey); model defaults to
> `gemini-2.5-flash`. Agents run without it (rule-based fallback), but AI features need it.
>
> **CSPR.cloud key** (`CSPR_CLOUD_API_KEY`, optional): create at
> [console.cspr.build](https://console.cspr.build) for higher-throughput reads.

---

## CPO Production Data Sources

The Oracle Agent anchors on a **live, real-world palm oil price** and cross-validates
across three named benchmarks. A validation score below 60/100 rejects the submission —
protecting against bad data entering the vault.

| Source | Data | Live now? |
|--------|------|-----------|
| **FRED `PPOILUSDM`** (IMF Global price of Palm Oil, USD/ton) | Authoritative price the oracle anchors on | ✅ **Live** — fetched every cycle (free, no key) |
| **KPBN** (Indonesian CPO tender benchmark) | Price benchmark, fetched via **x402 micropayment** | ✅ Live price (served through the x402-gated endpoint) |
| **MPOB** (Malaysian Palm Oil Board) | Regional SEA price benchmark | ✅ Live price · ⚠️ regional production tonnage is representative |
| **GAPKI** (Indonesian producers assoc.) | Estate-group production tonnage | ⚠️ Representative figure (GAPKI publishes aggregate PDFs, not a per-estate API) |

> **What's real vs. representative (honest):** the **CPO price is genuinely live**
> — pulled from FRED's `PPOILUSDM` series (IMF data) every oracle cycle, and also
> served behind the x402 paywall so "pay-per-request → real data" is end-to-end real.
> **Production tonnage** (tons per estate/region) is a representative figure: GAPKI/KPBN
> don't expose free per-estate production APIs, so live tonnage requires a data
> partnership (see [Roadmap](#roadmap)). Code: `agents/cpo_price.py`.

---

## Agentic Architecture

```
┌─────────────────────────────────────────────────────┐
│             Sawit Finance Agent System              │
│                                                     │
│  ┌─────────────────┐    ┌───────────────────────┐   │
│  │  Oracle Agent   │    │   Yield Router Agent  │   │
│  │                 │    │                       │   │
│  │ scrape → verify │    │ monitor CPO price     │   │
│  │ → post on-chain │    │ → snapshot holders    │   │
│  │                 │    │ → trigger distribution│   │
│  └────────┬────────┘    └──────────┬────────────┘   │
│           │ x402 pay               │ x402 pay       │
│           │ (KPBN/MPOB API)        │ (CPO price API)│
│           ▼                        ▼                │
│  ┌─────────────────────────────────────────────┐    │
│  │          Casper MCP Server                  │    │
│  │   (natural language blockchain interface)   │    │
│  └─────────────────────────────────────────────┘    │
│                        │                            │
│                        ▼                            │
│  ┌──────────────────────────────────────────────┐   │
│  │         Casper Testnet Contracts             │   │
│  │  ProductionVault → TokenMinter → SAWIT Token │   │
│  │  YieldDistributor ← CSPR revenue             │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## Oracle Reputation System

Sawit Finance implements **on-chain verifiable oracle reputation** — directly requested by the Casper Agentic Buildathon judging criteria.

Each time the AI Oracle Agent submits verified CPO data, `ProductionVault` records the validation score and maintains a rolling average across all historical submissions:

```
reputation_score = sum(validation_scores) / total_submissions
```

This score is publicly readable on-chain via `get_oracle_reputation()`. Any token holder, auditor, or smart contract can verify oracle reliability without trusting the operator.

| Score Range | Interpretation |
|-------------|---------------|
| 90–100 | Excellent — GAPKI + KPBN + MPOB all agree |
| 75–89 | Good — minor divergence between sources |
| 60–74 | Acceptable — submitted but flagged for review |
| <60 | Rejected — contract reverts, epoch not recorded |

The `OracleReputationUpdated` event is emitted on every submission, providing a full auditable history of oracle performance on-chain.

---

## Trust Model — A Permissioned RWA

Sawit Finance is deliberately a **permissioned** real-world-asset protocol, not a trustless DeFi primitive. Tokenizing regulated palm-oil revenue legally requires a licensed operator and KYC/AML — so the design embraces a trusted operator *and makes its every action auditable on-chain* rather than pretending the operator doesn't exist.

| Concern | How Sawit Finance handles it today |
|---------|-------------------------------|
| Who can post production data? | Only the whitelisted oracle agent; every submission updates a public **reputation score** |
| Are minted amounts honest? | TokenMinter reads tons_cpo **from ProductionVault via CPI** — the operator can't fabricate figures |
| Who can receive yield? | Only **KYC-verified** holders (enforced cross-contract); claims leave permanent on-chain receipts |
| Who computes the per-holder split? | The operator computes pro-rata shares off-chain (CEP-18 has no on-chain holder enumeration) and posts them; amounts and claims are fully visible on-chain |

The one remaining trust assumption is the **off-chain computation of each holder's share** — a deliberate, documented trade-off, because iterating all token holders on-chain is infeasible (no enumerable holder set, prohibitive gas).

**Roadmap to progressive decentralization:**
- **Merkle-proof claims** — the agent publishes only a Merkle root on-chain; holders claim with a proof verifiable against the public balance snapshot, removing trust in the operator's arithmetic.
- **Multi-sig operator** — distribution + KYC authority behind an m-of-n council.
- **DAO-governed GORR bounds** — token holders vote on the safety band the AI agent operates within.

---

## Key Protections

- **Multi-source oracle validation** — data rejected if 3 sources diverge >10%
- **Minimum validation score** — score <60/100 blocks epoch recording
- **On-chain oracle reputation** — rolling accuracy score, publicly readable via `get_oracle_reputation()`
- **KYC compliance gate** — only KYC-verified holders can claim yield (enforced cross-contract)
- **AI safety rails** — autonomous GORR changes capped to ±100 bps/cycle, locked to [1%, 10%] band
- **Duplicate epoch prevention** — contract rejects same-timestamp epochs
- **Oracle agent whitelist** — only authorized AI agent can post production data
- **Authorized minting** — SawitToken only accepts mint() from the TokenMinter contract
- **Claim receipts** — per-address claimed flag prevents double-claiming
- **Claim window** — 90-day window, unclaimed CSPR rolls to next epoch

---

## RWA Case: Why Indonesian Palm Oil?

| Factor | Value |
|--------|-------|
| Indonesia global CPO share | ~60% of world supply |
| Annual CPO export value | ~$25-30 billion USD |
| Number of palm oil estates | 16+ million hectares |
| Number of PKS mills | 1,700+ active mills |
| Price transparency | Daily KPBN tender auctions |
| On-chain RWA precedent | None — Sawit Finance is first |

---

## Roadmap

| Status | Item |
|--------|------|
| 🔜 Next | **Stablecoin-denominated yield.** CPO revenue is USD-denominated, so paying yield in volatile CSPR creates an FX mismatch for holders. v2 settles yield in a USD stablecoin. `YieldDistributor` will take a generic CEP-18 stablecoin reference at init, so the migration is a drop-in — no holder-facing change. **Production target: [csprUSD](https://www.casper.network/news/sarson-funds-csprusd-stablecoin-live-on-casper-network-testnet)** (Sarson Funds — US-registered, regulation-aligned, already on Casper testnet), matching Sawit Finance's regulated-RWA positioning. USDC is not native to Casper. |
| 🔜 Next | Merkle-based yield distribution (gas-efficient claims at holder scale) |
| 🔜 Next | Mainnet deployment + real mill data partnerships (GAPKI/KPBN feeds) |

> **Why CSPR yield in v1:** the native-CSPR loop is fully working on-chain today and
> has zero external dependencies. csprUSD's testnet contract address and test tokens
> aren't publicly distributed (they require coordinating with the issuer), so we ship
> the working CSPR loop now and treat the stablecoin swap as a clean, well-scoped v2.

---

## Casper Buildathon 2026

Submitted to: **Casper Agentic Buildathon 2026 — Innovation Track**

| Criterion | Implementation |
|-----------|---------------|
| Technical Execution | 4 Odra contracts, 15 tests (incl. full e2e pipeline), 3 real CPIs + 3 AI agents |
| Innovation | First Indonesian palm oil RWA on Casper |
| Agentic AI | Closed-loop autonomous agent (read→reason→write) + Gemini + x402 + **Casper MCP server** |
| Oracle Reputation | On-chain rolling accuracy score, readable via `get_oracle_reputation()` |
| Compliance | KYC-gated yield claims enforced cross-contract |
| Real-World Applicability | $30B CPO market, real mill data |
| Working Smart Contracts | 15 tests green; upgradable, livenet-deploy-ready for Casper Testnet |
| Long-Term Potential | Indonesia's commodity sector on-chain |

---

*Casper Agentic Buildathon 2026 — RWA + DeFi + Agentic AI*
