# Sawit Finance

**Tokenized Indonesian Palm Oil on Casper Network**

> Real CPO. Real revenue. On-chain yield — driven by autonomous AI agents.

Built for the **Casper Agentic Buildathon 2026**.

**🎥 [Watch the demo](https://youtu.be/jT4uH5fRL8E)** · **🌐 Live app: [sawitfinance.xyz](https://sawitfinance.xyz)** · Live on Casper Testnet · [GitHub](https://github.com/wngstnr-code/Sawit-Finance) · [X / Twitter](https://x.com/wnsstt) · [DoraHacks BUIDL](https://dorahacks.io/buidl/46159)

> ### ✅ Verify it yourself in 30 seconds
> - **🎥 Watch the demo:** [youtu.be/jT4uH5fRL8E](https://youtu.be/jT4uH5fRL8E) — full walkthrough (claim, agent on-chain write, MCP, x402)
> - **🟢 Use it:** [sawitfinance.xyz](https://sawitfinance.xyz) — connect a Casper wallet and claim real CSPR yield
> - **⛓️ See the loop on-chain:** KYC-gated yield claim [`23e6e9d7…`](https://testnet.cspr.live/transaction/23e6e9d7d665a3a94e58170ee2c70434cf6dc71f8c18a2998f97f8497f80f8f6) on cspr.live (record→mint→fund→claim — [full loop below](#live-on-casper-testnet--the-full-loop-executed-on-chain))
> - **🤖 Agentic write:** an autonomous agent's GORR decision, broadcast on-chain [`1b703ee1…`](https://testnet.cspr.live/transaction/1b703ee1d289ebdcee96496b2ff0d0ecb8c9aad708c6ad29f31dd428467cc0d0) (read→reason→write, with safety rails)
> - **🔌 Toolkit:** [Casper MCP server](#the-agentic-layer) (7 live-state tools) + **official-protocol x402 settlement** [`1ea0a5f2…`](https://testnet.cspr.live/deploy/1ea0a5f2c4a03a282055ecb9e826108bb4ad3d04e8e5530d9baf856f27e490f3) — an agent paid a CEP-18 `transfer_with_authorization` (EIP-712, gasless) for gated CPO data
>
> **Don't trust the explorer links — check the chain directly.** Every transaction claim in this README resolves at the data layer, not just as a URL that returns 200. Verify any of them against a public node:
>
> ```bash
> curl -sS -X POST https://node.testnet.casper.network/rpc -H 'Content-Type: application/json' \
>   -d '{"jsonrpc":"2.0","id":1,"method":"info_get_transaction",
>        "params":{"transaction_hash":{"Version1":"95026df66c129a8b86baca0f2f119e7c851f124c0406ca897c629f6becf362f5"}}}'
> ```
>
> That one returns the AI agent's own GORR change: entry point `update_config`, `new_gorr_bps = 600`, against the TokenMinter package, `error_message: null`. Swap in any hash below.

---

## The Problem

Indonesia produces ~60% of the world's palm oil — a **$30B+/year** export market. Yet that revenue is completely off-chain and inaccessible to global investors:

- **No fractional access.** You can't buy a $100 stake in a palm oil estate's revenue.
- **Opaque pricing.** CPO prices clear in daily KPBN tender auctions most investors never see.
- **Trust gap.** Real-world-asset (RWA) tokenization usually means "trust the operator" — production figures, yield math, and compliance all happen in a black box.

## The Solution

Sawit Finance tokenizes **CPO production revenue** as **SAWIT** (a CEP-18 token). Each token is a fractional, yield-bearing claim on real palm oil output — not a synthetic, not a price tracker. An AI oracle runs a live verification pipeline and records each production epoch on-chain (the palm-oil **price is a live feed**; production tonnage is representative today — [stated plainly below](#data-provenance--whats-live-vs-representative)); SAWIT is then minted against that on-chain record **via CPI**, so the operator can't inflate it, and revenue flows back to holders as on-chain CSPR yield.

The difference from a typical RWA: **every operator action is verifiable on-chain.** An AI oracle's accuracy is scored on-chain, mint amounts are read cross-contract (the operator can't fabricate them), and yield claims are KYC-gated and leave permanent receipts. A trusted operator that can't lie undetected.

---

## How It Works

<pre>
Palm Oil Mills (PKS)
       │
       ▼
AI Oracle Agent ──live──> FRED/IMF palm oil price   (real feed, every cycle)
       │        ──x402──> KPBN / MPOB / GAPKI        (tonnage representative · Gemini check)
       │
       ▼
ProductionVault ───────────────┐  (verified CPO tons + price, KYC registry,
       │ CPI: get_epoch()      │   on-chain oracle reputation score)
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
Yield Router (rules) AI Market Analyst
(triggers on price)  (reads chain → Gemini → autonomously tunes GORR on-chain)
</pre>

**Four Casper contracts** (Odra Framework, upgradable packages on Testnet):

| Contract | What it does |
|----------|-------------|
| **ProductionVault** | Stores AI-verified CPO data (tons, price, mills), the KYC registry, and the rolling oracle reputation score |
| **SawitToken** | CEP-18 token — SAWIT — the yield-bearing claim on CPO revenue |
| **TokenMinter** | Reads the verified epoch from ProductionVault (CPI) → mints via SawitToken.mint() (CPI) |
| **YieldDistributor** | Holds CSPR revenue per epoch; KYC-gated claims (checks ProductionVault via CPI) |

---

## Live on Casper Testnet — the full loop, executed on-chain

The complete cycle has run end-to-end on `casper-test`: **record production → mint SAWIT → fund yield → KYC-gated claim.** Every step is a real transaction:

| Step | What happened | Tx |
|------|---------------|----|
| 1. Record | Oracle records epoch: 45,200 t CPO @ $825, oracle reputation 92/100 | [`4d83e1a4…`](https://testnet.cspr.live/transaction/4d83e1a4b9c12ee2f386e0e14fd325a14ae81abb9446508650a20471b54a7bdb) |
| 2. Mint | TokenMinter (CPI→Vault, CPI→Token) mints **2,260,000 SAWIT** | [`b257a688…`](https://testnet.cspr.live/transaction/b257a68867b5253b1d5f05c6e362759091f91ec223cd650b6f555335351afb93) |
| 3. Fund | Distribution epoch funded with **100 CSPR** (claim window now 30 days — [tuned live](#live-protocol-operations--a-real-incident-fixed-with-a-live-upgrade)) | [`6fb18931…`](https://testnet.cspr.live/transaction/6fb1893145d969bad32e0f6ba26810a81f532be5b5b288af3977a142e489772f) |
| 4. Claim | KYC-verified holder claims (CPI→Vault KYC check) → **CSPR to holder** | [`23e6e9d7…`](https://testnet.cspr.live/transaction/23e6e9d7d665a3a94e58170ee2c70434cf6dc71f8c18a2998f97f8497f80f8f6) |

This exercises every core entrypoint, **3 real cross-contract CPIs**, and a **payable** CSPR transfer — the same flow the AI agents drive autonomously.

### Deployed contracts (upgradable packages)

Deployer account hash: `57895ec9532fba625e63d3f7a5e250b50f9c5e0fb5321f8fa5890dd05d4ae2ec`

| Contract | Package (cspr.live) |
|----------|---------------------|
| **SawitToken** (CEP-18) | [`579f3197…205a47`](https://testnet.cspr.live/contract-package/579f3197493048529a56ea3887721c4bd027e3fad6755644f19446b4c9205a47) |
| **ProductionVault** | [`0b860c57…55e365`](https://testnet.cspr.live/contract-package/0b860c574e7b7cd6969a33dd57992fc6efedd503473b44e1c9309f1c8455e365) |
| **TokenMinter** | [`cb3b96b8…58d8e06`](https://testnet.cspr.live/contract-package/cb3b96b8cdb987178db0353ef6a713a7d888a4256f59702243187982358d8e06) |
| **YieldDistributor** | [`1a049357…1ccf1e9`](https://testnet.cspr.live/contract-package/1a04935782cbd60b7a4cfddea6ab18a6efd0348b862171c6a4fe25c111ccf1e9) |

> Yield settles in **CSPR** in v1. Because CPO revenue is USD-denominated, v2 swaps yield to a USD stablecoin ([csprUSD](https://www.casper.network/news/sarson-funds-csprusd-stablecoin-live-on-casper-network-testnet)) — a drop-in CEP-18 change. See [Launch Plan](#launch-plan).

---

## The Agentic Layer

Four autonomous agents run the protocol — two with a real LLM at the decision point, two deliberately deterministic — and this is the heart of the Buildathon entry.

| Agent | Role | AI |
|-------|------|----|
| **Oracle Agent** | Anchors on the live FRED/IMF palm oil price, cross-validates GAPKI/KPBN/MPOB with Gemini, posts verified data on-chain | Gemini 2.5 Flash |
| **Yield Router** | Monitors CPO price, auto-triggers CSPR yield distribution when a threshold is met | Rule-based |
| **Market Analyst** | Reads all 4 contracts, runs Gemini strategy analysis, **autonomously adjusts GORR on-chain** | Gemini 2.5 Flash |
| **Allocation Agent** | Settles SAWIT purchases: watches the treasury for CSPR deposits tagged with buy-memo `5417` (the app's Acquire tab), allocates + sends SAWIT deterministically (10 CSPR/SAWIT, deduped by deploy hash) | Rule-based + Gemini advisory screen |

The Allocation Agent keeps the LLM **out of the settlement hot path** on purpose: amounts and pricing are deterministic; Gemini only *screens* each deposit for anomalies (oversized or rapid-repeat deposits), and anything flagged is held for manual review instead of auto-allocated.

**Every agent writes on-chain — for real (no simulated hashes).** Each agent signs and broadcasts its decision as a live Casper transaction: the Oracle records verified production ([`2e6e00b1…`](https://testnet.cspr.live/transaction/2e6e00b168066072d960184fdee4300c46a946dbb3b6b6b141c8fcb8166e8ac6)), the Yield Router funds a distribution epoch ([`3cb6b496…`](https://testnet.cspr.live/transaction/3cb6b496392c88b80e2ebe64820d2858b78e948072f963ac52b9f122438856b8)), and the Market Analyst tunes GORR ([`1b703ee1…`](https://testnet.cspr.live/transaction/1b703ee1d289ebdcee96496b2ff0d0ecb8c9aad708c6ad29f31dd428467cc0d0)). Two agents are **LLM-driven** (Oracle, Market Analyst — Gemini 2.5 Flash); the Yield Router and Allocation Agent are **deterministic**. All four act through the same signed-livenet path.

**Closed-loop autonomy — a real on-chain decision.** The Market Analyst is the only agent that closes the loop: `READ chain → REASON with Gemini → WRITE back to chain`. With `AUTONOMY_MODE=on` it signs and **broadcasts a real `TokenMinter.update_config()` transaction** to tune GORR from its own analysis. This isn't scaffolded, and it isn't a one-off — the agent has tuned GORR on-chain across separate cycles, from its own fresh analysis each time:

| Cycle | Agent's decision | Tx |
|-------|------------------|-----|
| 1 | GORR 510 → 500 bps | [`1b703ee1…`](https://testnet.cspr.live/transaction/1b703ee1d289ebdcee96496b2ff0d0ecb8c9aad708c6ad29f31dd428467cc0d0) |
| 2 | GORR 500 → 600 bps | [`95026df6…`](https://testnet.cspr.live/transaction/95026df66c129a8b86baca0f2f119e7c851f124c0406ca897c629f6becf362f5) |

**Safety rails** cap any single change to ±100 bps and lock GORR to a [1%, 10%] band, with a 24h cooldown between changes — a hallucinated recommendation can never harm holders. Both cycles landed inside those rails.

**Gemini reasoning gate.** Before data hits the chain, the Oracle Agent passes all 3 source readings to Gemini, which flags seasonal anomalies / suspicious spikes and can veto a submission (`"recommendation": "REJECT"` blocks the epoch regardless of the statistical score).

**Unattended autonomy — the agents run from CI, not a laptop.** A GitHub Actions scheduler ([`.github/workflows/agents.yml`](.github/workflows/agents.yml)) runs the agents on an orchestrated cadence — Market Analyst and Allocation daily, Oracle → Yield Router monthly. Each cycle signs and broadcasts **real Casper Testnet transactions from CI**, then commits the resulting agent state back to the repo; that commit redeploys [sawitfinance.xyz](https://sawitfinance.xyz), so the **Agent Control Room** on the live site always reflects genuine, fresh on-chain activity with no human in the loop. Any agent can also be run on demand via `workflow_dispatch`.

### Data provenance — what's live vs. representative

Stated plainly, because it matters: the **palm-oil price is a genuinely live feed** (FRED `PPOILUSDM`, IMF — pulled every cycle, no key), and the **entire verification pipeline runs for real on it** — 3-source cross-check, divergence scoring, the Gemini anomaly veto, and the on-chain reputation score. The one piece **not** yet wired to a real-time source is **production tonnage**: GAPKI / KPBN / MPOB publish monthly *aggregate* figures as PDFs, not per-estate APIs, so the tonnage the pipeline ingests is a **representative figure** (clearly labelled as such in `agents/oracle_agent.py`), not scraped live.

This is a **data-source** limitation, not an architectural one. The pipeline is feed-agnostic — connecting a live mill-data partnership (a scoped [mainnet step](#launch-plan)) swaps the input without touching the contracts or the agent logic. And nothing downstream is faked: once an epoch is recorded on-chain, `TokenMinter` reads the tonnage **via CPI** (`token_minter.rs`), so the minted amount is cryptographically locked to the on-chain record — the operator can't substitute a different number after the fact, live feed or not.

**x402 micropayments — official protocol, live on-chain settlement.** Agents pay per-request for gated CPO data over the **official Casper x402 protocol** (`agents/x402-official/`, built on [`@make-software/casper-x402`](https://github.com/make-software/casper-x402) — the same stack behind the hosted CSPR.cloud Facilitator): the agent receives `402` + PaymentRequirements, signs an **EIP-712 transfer authorization**, and the facilitator settles it via the CEP-18 `transfer_with_authorization` entry point — **gasless for the agent**, spec-interoperable with any x402 client. Payments are made in **SAWITX**, our own CEP-18 x402 token deployed for this ([`ace00b4d…`](https://testnet.cspr.live/contract-package/ace00b4d5e5e1fb52be4260e0aba9cbf2595992eb599519d6b596b9ff0ea1f2b)). Live settlement: [`1ea0a5f2…`](https://testnet.cspr.live/deploy/1ea0a5f2c4a03a282055ecb9e826108bb4ad3d04e8e5530d9baf856f27e490f3) — 402 → EIP-712 → on-chain in ~15s. This isn't a standalone demo: the **Oracle Agent pays for its KPBN/MPOB data through this path** in its pipeline (`fetch_via_x402_official` → the `paid-fetch.ts` bridge, the same subprocess-bridge pattern as `read_state`), falling back to the reference client if the official rail is down.

**Key separation.** The x402 facilitator loads its signing key from `X402_SECRET_KEY_PATH`, kept separate from the contract-authority key — `ODRA_CASPER_LIVENET_SECRET_KEY_PATH` remains only a fallback for local demo, never the facilitator's live key. Settlement is capped at **7 CSPR per payment** (`limitedPaymentMotes`) and rate-limited (30 req/min). Multi-sig operator remains a Phase-3 [roadmap](#launch-plan) item.

**Why there's also a from-scratch implementation.** Before integrating the official rails, we implemented the full x402 handshake ourselves (`agents/x402.py` — ed25519 proofs, amount/recipient/resource/nonce binding, replay protection, self-tests) with live native-CSPR settlement ([`8b25fb9e…`](https://testnet.cspr.live/deploy/8b25fb9e548b2f3cf639f5ca65e5c54581223f43bb3a647730b0d6fffb074856)). It stays in the repo as a **reference implementation**: proof we understand the protocol down to the bytes we sign, not just the SDK surface. Production traffic goes through the official protocol path.

**Casper MCP Server.** `agents/mcp_server.py` exposes the protocol's live on-chain state to any MCP-compatible LLM (Claude, etc.) as standardized tools — the Casper AI Toolkit pattern. An LLM can query SAWIT supply, oracle reputation, a holder's position, and the live palm oil price through tool calls instead of bespoke API glue.

| MCP tool | Returns |
|----------|---------|
| `get_protocol_state` | SAWIT supply, CPO value/tons/price, GORR, oracle reputation, epochs, claim window |
| `get_oracle_reputation` | rolling on-chain accuracy score (0–100) + interpretation |
| `get_account_position` | a holder's SAWIT balance + claimable CSPR (by public key) |
| `get_palm_oil_price` | live FRED `PPOILUSDM` (IMF) palm-oil price |
| `get_contracts` / `get_economic_loop` | deployed hashes + executed-loop tx (cspr.live links) |
| `refresh_protocol_state` | force a fresh live read of all four contracts |

**See it connected:** the [demo video](https://youtu.be/jT4uH5fRL8E) shows Claude Desktop connected to this server and invoking these tools live against Casper Testnet. To reproduce it yourself, add the server to your MCP client config:

```jsonc
// claude_desktop_config.json → "mcpServers"
"sawit-finance": {
  "command": "/absolute/path/to/sawit-fi/.venv/bin/python",
  "args": ["/absolute/path/to/sawit-fi/agents/mcp_server.py"]
}
```

Restart the client and ask it *"what's the current SAWIT protocol state?"* — the tools above resolve against live contract state, no API glue.

---

## On-Chain Oracle Reputation

A trust-minimized oracle — directly requested by the Buildathon judging criteria. Every time the Oracle Agent submits data, `ProductionVault` records the validation score and maintains a public rolling average:

```
reputation_score = sum(validation_scores) / total_submissions
```

Readable on-chain via `get_oracle_reputation()` — any holder, auditor, or contract can verify oracle reliability without trusting the operator. An `OracleReputationUpdated` event gives a full auditable history. A score < 60/100 reverts the epoch; ≥ 90 means all three benchmarks agree.

---

## Why It's Trustworthy (a permissioned RWA, done honestly)

Tokenizing regulated palm-oil revenue legally requires a licensed operator + KYC/AML — so Sawit Finance embraces a trusted operator **and makes its every action auditable on-chain**, rather than pretending the operator doesn't exist.

- **Oracle can't fabricate** — mint amounts are read from ProductionVault via CPI; every submission updates the public reputation score.
- **Yield is KYC-gated** — only KYC-verified holders can claim (enforced cross-contract); claims leave permanent receipts.
- **Multi-source validation** — data rejected if the 3 sources diverge > 10% or the score drops below 60/100.
- **AI safety rails** — autonomous GORR changes capped to ±100 bps/cycle, locked to [1%, 10%].

Two documented trade-offs: **(1)** per-holder shares are computed off-chain (CEP-18 has no on-chain holder enumeration), then posted — amounts and claims stay fully visible on-chain; **(2)** a single operator authority key currently controls all four upgradable packages — the same key that performed the live in-place upgrades below. That's a deliberate v1 simplification for a testnet protocol run by one operator, and it's stated here rather than left for you to discover. **Roadmap:** Merkle-proof claims retire the first; a multi-sig operator + timelock (Phase 3) retires the second, alongside DAO-governed GORR bounds.

---

## Tokenomics

```
sawit_minted = tons_cpo × token_rate × (gorr_bps / 10,000)
```

- **token_rate** = 1,000 SAWIT per ton CPO (configurable)
- **GORR** = Gross Overriding Royalty Rate — share of CPO revenue routed to holders

**Example (June 2026 epoch):** 45,000 t × $825 = **$37.1M** gross revenue; at 500 bps GORR → **$1.86M** to holders, **2,250,000 SAWIT** minted (~12% APY target). For a $1M raise against $1.5M/month revenue, ~67 bps GORR delivers 12% APY.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart contracts | Odra Framework 2.x (Rust) → CEP-18 + 3 custom contracts, upgradable |
| Agents | Python (asyncio/aiohttp) · Gemini 2.5 Flash · x402 official protocol (`@make-software/casper-x402`, EIP-712/CEP-18) + from-scratch reference (ed25519) · MCP SDK |
| Price feed | FRED `PPOILUSDM` (IMF Global price of Palm Oil) — live, no key |
| On-chain reads | `read_state` / `read_balance` Odra livenet bridges (reads Odra's internal state CSPR.cloud can't) |
| Frontend | Next.js 14 + CSPR.click wallet + casper-js-sdk (landing + investor dashboard, live claims) |

**App freshness.** Portfolio now shows the connected wallet's **real on-chain activity**: the app merges its local action log with the wallet's full deploy history, fetched server-side from CSPR.cloud via `/api/activity` (the CSPR.cloud API key stays server-side, never shipped to the client). The provenance/epoch table now includes distribution-only epochs too (e.g. the epoch-3 re-fund) — `read_state` iterates distribution epochs with the production record treated as optional. The **"CSPR distributed"** metric is the sum of funded epochs' distribution pools (the contract's all-time counter only advances on sweep) — currently **260 CSPR across 4 funded epochs**. On the landing page, the On-chain Proof section is now a vertical ledger with all five tx proofs always visible. Buying SAWIT is live too: the app's **Acquire tab** issues a native CSPR transfer (memo `5417`) to the treasury, and the [Allocation Agent](#the-agentic-layer) screens the deposit and settles SAWIT back automatically.

---

## Run It Yourself

```bash
# 1. Contracts — run all tests incl. the full e2e pipeline (no node needed)
cargo +nightly-2026-01-01 test            # 68 tests, incl. record→mint→KYC→claim

# 2. Agents
python3 -m venv .venv && ./.venv/bin/pip install -r agents/requirements.txt
cp agents/.env.example agents/.env        # fill GEMINI_API_KEY (free) + contract addresses

./.venv/bin/python agents/oracle_agent.py         # AI oracle (live price + Gemini)
./.venv/bin/python agents/market_analyst_agent.py # closed-loop GORR autonomy
./.venv/bin/python agents/allocation_agent.py --once  # screen buy-deposits + settle SAWIT

# 3a. x402 — official protocol (EIP-712 + CEP-18 transfer_with_authorization)
cd agents/x402-official && npm install
npm run facilitator   # terminal 1 — official-protocol facilitator (verify + settle)
npm run server        # terminal 2 — x402-gated live CPO price endpoint
npm run agent         # terminal 3 — agent pays 1 SAWITX, settles on Testnet

# 3b. x402 — from-scratch reference implementation
./.venv/bin/python agents/x402.py          # 5 handshake checks (crypto, no network)
./.venv/bin/python agents/x402_settle.py   # 402 → signed proof → live CSPR transfer → verify

# 4. MCP server — expose live chain state to any LLM
./.venv/bin/python agents/mcp_test.py      # verify all 7 tools end-to-end
./.venv/bin/python agents/mcp_server.py    # run (stdio); add to claude_desktop_config.json

# 5. Frontend — landing + investor dashboard
cd frontend && npm install
cp .env.local.example .env.local          # every var documented inline; all optional for a read-only run
npm run dev                               # http://localhost:3000
```

Frontend env (`frontend/.env.local`): at minimum `NEXT_PUBLIC_CSPR_CLICK_APP_ID` (CSPR.click wallet app id) and `NEXT_PUBLIC_ACCESS_EMAIL`; see `frontend/src/lib/config.ts` for the full list read at runtime. Without the Rust bridge binaries built (`cargo build --release -p sawit-deploy`, which produces `read_state`/`read_balance`) and reachable, the app's API routes fall back to bundled snapshot/demo data (`snapshot: true` in the JSON responses) instead of live on-chain reads — the UI still works end-to-end for local development.

Deploy to Testnet (Odra livenet backend) and reproducible-build verification are documented inline in `deploy/src/` and `build-wasm.sh`. Contracts deploy as **upgradable** packages; the build is verifiable by rebuilding from source and matching the on-chain wasm hash.

---

## Repository

```
contracts/   production-vault · sawit-token · token-minter · yield-distributor  (Odra/Rust)
agents/      oracle · yield_router · market_analyst · allocation · x402 (reference) · x402_settle · mcp_server
agents/x402-official/  official-protocol x402: facilitator · gated server · paying agent (TS)
e2e/         full_flow.rs — production → mint → KYC → claim across all 4 contracts
deploy/      livenet deploy + agent-driven bins (record/fund/set_gorr/mint/claim/set_claimable) + read_state/read_balance bridges
frontend/    Next.js 14 app — landing + investor dashboard (CSPR.click, live reads & claims)
.github/workflows/agents.yml  CI scheduler — unattended agent cycles signing real Testnet txs
```

Demo: **[youtu.be/jT4uH5fRL8E](https://youtu.be/jT4uH5fRL8E)** · Live app: **[sawitfinance.xyz](https://sawitfinance.xyz)** · GitHub: **[wngstnr-code/Sawit-Finance](https://github.com/wngstnr-code/Sawit-Finance)** · X: **[@wnsstt](https://x.com/wnsstt)**

---

## Live protocol operations — a real incident, fixed with a live upgrade

Autonomy is only as good as what happens when something goes wrong on a live deployment. During finals prep we found exactly that: distribution epoch 1 had **125 CSPR claimed against a 100 CSPR funded pool** — a real economic bug on our own testnet contracts, not a hypothetical. Root cause: `set_claimable` had no on-chain cap on the sum of allocations per epoch, so claimables could be set past what the pool actually held.

The fix shipped as a **live, in-place package upgrade** — the contracts have been deployed upgradable since day one, so this was a deploy, not a migration or a redeploy-and-migrate-state exercise. `set_claimable` / `set_claimable_batch` now track a running per-epoch allocation sum and **revert with `ClaimableExceedsPool`** the moment an allocation would exceed the funded pool; `sweep_unclaimed` uses checked subtraction so the historical over-claimed epoch stays safely sweepable instead of underflowing.

- **Upgrade tx** (same package hash `1a04935782cbd60b7a4cfddea6ab18a6efd0348b862171c6a4fe25c111ccf1e9`, state fully retained across the upgrade): [`7757f5ed…`](https://testnet.cspr.live/transaction/7757f5ed1c904744256e701b0ec63fdc0f9f8efe6c52d4ca365098710a85123b)
- **Guard verified live:** an intentional 31-CSPR allocation against a 30-CSPR pool was rejected on-chain — `User error: 13` — [`20be11c9…`](https://testnet.cspr.live/transaction/20be11c94614482435f94407eefd5127a6a7309435b93b996dba93c97978e7b9)
- **Second in-place upgrade** closed the root cause structurally: `fund_epoch` now tracks cumulative `funded_amount` and only marks an epoch funded once the pool is fully covered, and `sweep_unclaimed` rejects unfunded epochs — [`ba1a9b22…`](https://testnet.cspr.live/transaction/ba1a9b22c1e5862a7a4a9ab5409d79889893cdb0beed8feac6e234e94c2b8e72) (same package hash, state retained again)
- Distributor purse solvency was restored with a payable top-up through `fund_epoch` (25 CSPR).
- **Third in-place upgrade — a production-integrity bound on the vault:** `ProductionVault.record_production` now enforces a per-epoch tonnage ceiling (`max_tons_per_epoch`, default 100,000 t, operator-tunable via `set_max_tons_per_epoch`) so a compromised or fat-fingered oracle can't mint SAWIT against an absurd tonnage. Shipped as the same kind of live, state-retaining package upgrade — vault epoch count preserved (2 → 2) and the new `get_max_tons_per_epoch` getter live on-chain — [`48cb7b52…`](https://testnet.cspr.live/transaction/48cb7b52e29a6e55089696dd3513bc9d3d2048f5b11cfd396f97874010c54d53). The distributor was re-upgraded in the same operation ([`fb2144e1…`](https://testnet.cspr.live/transaction/fb2144e1573275029787123baee19cb326a7501e2989fd591a6b4a937243064f)) and the claim window set to 30 days ([`01882b76…`](https://testnet.cspr.live/transaction/01882b76c39320372e18e9916250a42a8323d6f021afd31ea5bf97bdb21949ca)).
- **Guard verified live (again):** an intentional `record_production` of 150,000 t — above the 100,000 t ceiling — was rejected on-chain, `User error: 7` (`TonsExceedsLimit`), and the epoch count stayed unchanged — [`c5c9debd…`](https://testnet.cspr.live/transaction/c5c9debde91e7a28ab886466e27a23d81ae8e625b66589da50bed7adc1e72d27)

- **Fourth in-place upgrade — recovering a wedged distribution epoch.** A later incident showed the same lifecycle end-to-end. Distribution epoch 4 had been created with a **5,000 CSPR pool taken from a stale config default** while the operator purse could only cover 100, so its `fund_epoch` failed and `is_funded` stayed false. Because that flag gates **both** `claim_yield` and `sweep_unclaimed`, the 100 CSPR later deposited and allocated to a KYC-verified holder was **unclaimable and un-sweepable** — and since the funding tool reuses the current epoch while it is unfunded, every future yield cycle would have poured into epoch 4 instead of opening epoch 5. A permanent wedge, found by reading live state rather than from a failing test. The fix adds an authority-only `resize_unfunded_epoch`: it refuses funded and swept epochs, and refuses to drop a pool below either the CSPR already allocated to holders or the amount already deposited, so it can never strand funds or recreate the over-allocation bug above. Resizing down to what was actually deposited completes the funding, flipping `is_funded` exactly as `fund_epoch` would — [upgrade `4ccb8c71…`](https://testnet.cspr.live/transaction/4ccb8c719c675759c06256107f20e605cfdb2db6301b79a62c6375ff6146e3fe), [resize `87495719…`](https://testnet.cspr.live/transaction/87495719082fed8d135d3e7a183abf45be3ef2c4c10d4de9271e04df5d2392a0). Epoch 4 is now a funded 100 CSPR pool with its claim window intact, and the funded-epoch total moved from 160 to **260 CSPR**.

This is the protocol lifecycle working as designed — **monitor → diagnose on-chain → patch → upgrade in place → verify with a real revert.** Casper's upgradable packages made every one of these four fixes a deploy, not a migration.

### Operator tooling

The repo ships read-only and operational bins for exactly this kind of live operation, alongside the existing `read_state` / `read_balance` bridges:

- `inspect_epoch` — dumps any distribution epoch, its claimables, and the new running `claimable_total`
- `topup` — a payable purse top-up via `fund_epoch` (requires explicit `TOPUP_EPOCH` / `TOPUP_AMOUNT_MOTES`, no silent defaults)
- `upgrade_dist` / `upgrade_vault` — the in-place package upgrade paths (distributor and vault)
- `resize_epoch` — corrects the declared pool of an epoch whose funding never completed (requires explicit `RESIZE_EPOCH` / `RESIZE_POOL_MOTES`)

`set_claimable` itself now **requires an explicit `CLAIM_AMOUNT_MOTES`** — the old silent 25-CSPR default is gone; it was the root cause of the over-allocation in the first place.

---

## Launch Plan

**Shipped today (Qualification Round, July 2026)** — the full economic loop live on Casper Testnet: 4 upgradable contracts, 3 autonomous agents writing on-chain, official-protocol x402 settlement, MCP server, and a working investor app at [sawitfinance.xyz](https://sawitfinance.xyz).

| Phase | Gate to start | Deliverables |
|-------|---------------|--------------|
| **1 — Mainnet readiness** | Buildathon feedback incorporated | External security review of the 4 Odra contracts → **mainnet deployment** (upgradable packages, same verified-build process) · production CSPR.click app ID · yield settlement migrated to [csprUSD](https://www.casper.network/news/sarson-funds-csprusd-stablecoin-live-on-casper-network-testnet) (drop-in CEP-18) to remove the USD/CSPR FX mismatch |
| **2 — Real production data** | Contracts live on mainnet | First **mill data partnership** (GAPKI/KPBN-affiliated estate or cooperative) feeding per-epoch tonnage into the existing oracle pipeline — the pipeline is feed-agnostic, so this swaps the input without touching contracts · pilot epoch with real production figures · **Merkle-based claims** for gas-efficient, operator-trustless distribution at holder scale |
| **3 — Trust decentralization** | Pilot epoch settled with real data | Licensed-operator + KYC-provider integration for a compliant public offering · multi-sig operator · DAO-governed GORR bounds · open the x402-gated CPO data endpoints to **third-party agents** (any x402 client can already pay them — the interoperable rails are live today) |

> Sequencing rationale: CSPR yield ships in v1 because the native-CSPR loop works today with zero external dependencies; csprUSD is a clean, well-scoped swap once mainnet-live. Real mill data is a partnership problem, not an architecture problem — the verification pipeline, CPI-locked minting, and oracle reputation scoring don't change.

### How it makes money

The protocol takes a **protocol fee on distributed yield** — a basis-point cut of each epoch's CSPR/csprUSD distribution, taken at `fund_epoch` time so it is visible on-chain rather than deducted off-ledger. That aligns revenue with the only thing holders care about: yield actually reaching them. Nothing accrues if nothing is distributed.

Two secondary lines, both already technically live rather than hypothetical:
- **x402-gated CPO data.** The verification pipeline's cleaned, cross-validated CPO price and production feed is already served behind x402 micropayments. Any third-party agent can pay per request today — the same rails our own oracle uses. This is a machine-to-machine data business that needs no additional trust from the buyer.
- **Estate onboarding.** Mills and cooperatives pay to have their production tokenized and financed against, replacing working-capital lending that in Indonesia is typically expensive or unavailable to smallholder-linked mills.

GORR (the mint rate the AI agent tunes) is the protocol's core economic dial and stays bounded — see the safety rails above and the DAO-governed bounds in Phase 3.

### Regulatory path

A revenue-sharing claim on a real Indonesian commodity is a regulated instrument, not a memecoin, and we plan for that rather than around it:

- **Crypto-asset regulation.** Oversight of crypto assets in Indonesia moved from Bappebti to **OJK** on 10 January 2025 — mandated by UU P2SK (Law 4/2023), effected by PP 49/2024, with **POJK 27/2024** as OJK's implementing regulation. Crypto is now classified as a *digital financial asset* rather than a commodity. Any public offering runs through that regime and a licensed local entity (PT PMA or PT), not an offshore wrapper.
- **Instrument classification.** A tokenized revenue claim will most likely be treated as a securities-like offering. Phase 3's "licensed-operator + KYC-provider integration" is exactly this: a legal opinion on classification, then either a private-placement structure for accredited participants or a licensed public offering — determined by counsel, not by us.
- **Commodity-side compliance.** Palm oil is subject to export levies (BPDPKS), DMO/DPO policy, and mandatory ISPO sustainability certification — now governed by **Perpres 16/2025**, which replaced Perpres 44/2020 and extended the certification duty downstream. Estate partners must be ISPO-certified; the oracle records the certification reference alongside production so that compliance is auditable on-chain.
- **KYC/AML.** Already enforced today — claims are cross-contract KYC-gated at the contract level, so the compliance boundary is in the protocol rather than bolted onto a frontend.

> Honest status: this is the **planned** path, validated against public regulation, not legal advice we have already obtained. No entity is incorporated and no licence has been applied for. Engaging Indonesian counsel is the Phase 1 gate, and we would rather state that plainly than imply approvals we don't have.

### Known risks

| Risk | Mitigation |
|------|-----------|
| **Single operator key** controls privileged entry points | Disclosed above; multi-sig in Phase 3. Today the mitigation is that mint amounts are CPI-locked to on-chain records and every action leaves a permanent receipt |
| **Tonnage is representative**, not yet a live feed | Stated plainly everywhere it appears, including in agent logs. Phase 2 gate |
| **Oracle centralization** — one agent posts production | On-chain rolling reputation score makes inaccuracy visible and permanent; multi-oracle in Phase 3 |
| **CSPR/USD FX mismatch** — revenue is USD, yield is CSPR | csprUSD migration is Phase 1 |
| **Regulatory classification** could restrict a public offering | Private placement is the fallback structure; contracts are upgradable and KYC is already enforced on-chain |

**Who's building this:** Sawit Finance is designed, built, and operated solo by [Wangsit Nursyahada](https://github.com/wngstnr-code) ([@wnsstt](https://x.com/wnsstt)) — the same operator who deployed the contracts, ran the agents, and shipped the four live in-place upgrades documented above, including the epoch-1 over-allocation and epoch-4 wedge incident responses. One person, but a protocol that's already been *operated*, not just demoed.

**Where to follow the build:** [X / Twitter @wnsstt](https://x.com/wnsstt) (active) · [GitHub](https://github.com/wngstnr-code/Sawit-Finance) · [DoraHacks BUIDL](https://dorahacks.io/buidl/46159) · live app [sawitfinance.xyz](https://sawitfinance.xyz)

---

## Buildathon Criteria

| Criterion | Implementation |
|-----------|---------------|
| Technical Execution | 4 Odra contracts, 68 tests (incl. full e2e + access-control guards on every privileged entry point), 3 real CPIs, full loop live on Testnet |
| Innovation | First Indonesian palm oil RWA on Casper |
| Agentic AI | Closed-loop autonomous agent (read→reason→write) + Gemini + **official-protocol x402 live settlement** (+ from-scratch reference impl) + **Casper MCP server** + 4 agents running **unattended from a CI scheduler** (live Agent Control Room) |
| Oracle Reputation | On-chain rolling accuracy score, readable via `get_oracle_reputation()` |
| Compliance | KYC-gated yield claims, enforced cross-contract |
| Real-World Applicability | $30B CPO market, live FRED/IMF price feed |
| Working Contracts | 68 tests green; upgradable, deployed + executed + UPGRADED IN PLACE (4x) on Casper Testnet |
| Long-Term Launch Plans | Milestone-gated [Launch Plan](#launch-plan) — security review → mainnet → real mill data → decentralized trust; active socials |

---

## License

Released under the [MIT License](LICENSE). Contributions are welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

---

*Casper Agentic Buildathon 2026 — RWA · DeFi · Agentic AI*
