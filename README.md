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
AI Yield Router      AI Market Analyst
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
| 3. Fund | Distribution epoch funded with **100 CSPR** (90-day claim window) | [`6fb18931…`](https://testnet.cspr.live/transaction/6fb1893145d969bad32e0f6ba26810a81f532be5b5b288af3977a142e489772f) |
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

Three AI agents run the protocol autonomously — this is the heart of the Buildathon entry.

| Agent | Role | AI |
|-------|------|----|
| **Oracle Agent** | Anchors on the live FRED/IMF palm oil price, cross-validates GAPKI/KPBN/MPOB with Gemini, posts verified data on-chain | Gemini 2.5 Flash |
| **Yield Router** | Monitors CPO price, auto-triggers CSPR yield distribution when a threshold is met | Rule-based |
| **Market Analyst** | Reads all 4 contracts, runs Gemini strategy analysis, **autonomously adjusts GORR on-chain** | Gemini 2.5 Flash |

**Every agent writes on-chain — for real (no simulated hashes).** Each agent signs and broadcasts its decision as a live Casper transaction: the Oracle records verified production ([`2e6e00b1…`](https://testnet.cspr.live/transaction/2e6e00b168066072d960184fdee4300c46a946dbb3b6b6b141c8fcb8166e8ac6)), the Yield Router funds a distribution epoch ([`3cb6b496…`](https://testnet.cspr.live/transaction/3cb6b496392c88b80e2ebe64820d2858b78e948072f963ac52b9f122438856b8)), and the Market Analyst tunes GORR ([`1b703ee1…`](https://testnet.cspr.live/transaction/1b703ee1d289ebdcee96496b2ff0d0ecb8c9aad708c6ad29f31dd428467cc0d0)). Two agents are **LLM-driven** (Oracle, Market Analyst — Gemini 2.5 Flash); the Yield Router is a **rule-based trigger**. All three act through the same signed-livenet path.

**Closed-loop autonomy — a real on-chain decision.** The Market Analyst is the only agent that closes the loop: `READ chain → REASON with Gemini → WRITE back to chain`. With `AUTONOMY_MODE=on` it signs and **broadcasts a real `TokenMinter.update_config()` transaction** to tune GORR from its own analysis. This isn't scaffolded — here's an actual agent-driven GORR change on Testnet: [`1b703ee1…`](https://testnet.cspr.live/transaction/1b703ee1d289ebdcee96496b2ff0d0ecb8c9aad708c6ad29f31dd428467cc0d0) (the agent moved GORR 510→500 bps). **Safety rails** cap any single change to ±100 bps and lock GORR to a [1%, 10%] band — a hallucinated recommendation can never harm holders.

**Gemini reasoning gate.** Before data hits the chain, the Oracle Agent passes all 3 source readings to Gemini, which flags seasonal anomalies / suspicious spikes and can veto a submission (`"recommendation": "REJECT"` blocks the epoch regardless of the statistical score).

### Data provenance — what's live vs. representative

Stated plainly, because it matters: the **palm-oil price is a genuinely live feed** (FRED `PPOILUSDM`, IMF — pulled every cycle, no key), and the **entire verification pipeline runs for real on it** — 3-source cross-check, divergence scoring, the Gemini anomaly veto, and the on-chain reputation score. The one piece **not** yet wired to a real-time source is **production tonnage**: GAPKI / KPBN / MPOB publish monthly *aggregate* figures as PDFs, not per-estate APIs, so the tonnage the pipeline ingests is a **representative figure** (clearly labelled as such in `agents/oracle_agent.py`), not scraped live.

This is a **data-source** limitation, not an architectural one. The pipeline is feed-agnostic — connecting a live mill-data partnership (a scoped [mainnet step](#launch-plan)) swaps the input without touching the contracts or the agent logic. And nothing downstream is faked: once an epoch is recorded on-chain, `TokenMinter` reads the tonnage **via CPI** (`token_minter.rs`), so the minted amount is cryptographically locked to the on-chain record — the operator can't substitute a different number after the fact, live feed or not.

**x402 micropayments — official protocol, live on-chain settlement.** Agents pay per-request for gated CPO data over the **official Casper x402 protocol** (`agents/x402-official/`, built on [`@make-software/casper-x402`](https://github.com/make-software/casper-x402) — the same stack behind the hosted CSPR.cloud Facilitator): the agent receives `402` + PaymentRequirements, signs an **EIP-712 transfer authorization**, and the facilitator settles it via the CEP-18 `transfer_with_authorization` entry point — **gasless for the agent**, spec-interoperable with any x402 client. Payments are made in **SAWITX**, our own CEP-18 x402 token deployed for this ([`ace00b4d…`](https://testnet.cspr.live/contract-package/ace00b4d5e5e1fb52be4260e0aba9cbf2595992eb599519d6b596b9ff0ea1f2b)). Live settlement: [`1ea0a5f2…`](https://testnet.cspr.live/deploy/1ea0a5f2c4a03a282055ecb9e826108bb4ad3d04e8e5530d9baf856f27e490f3) — 402 → EIP-712 → on-chain in ~15s. This isn't a standalone demo: the **Oracle Agent pays for its KPBN/MPOB data through this path** in its pipeline (`fetch_via_x402_official` → the `paid-fetch.ts` bridge, the same subprocess-bridge pattern as `read_state`), falling back to the reference client if the official rail is down.

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

The one documented trade-off: per-holder shares are computed off-chain (CEP-18 has no on-chain holder enumeration), then posted — amounts and claims stay fully visible on-chain. **Roadmap:** Merkle-proof claims remove even this, multi-sig operator, DAO-governed GORR bounds.

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

---

## Run It Yourself

```bash
# 1. Contracts — run all tests incl. the full e2e pipeline (no node needed)
cargo +nightly-2026-01-01 test            # 15 tests, incl. record→mint→KYC→claim

# 2. Agents
python3 -m venv .venv && ./.venv/bin/pip install -r agents/requirements.txt
cp agents/.env.example agents/.env        # fill GEMINI_API_KEY (free) + contract addresses

./.venv/bin/python agents/oracle_agent.py         # AI oracle (live price + Gemini)
./.venv/bin/python agents/market_analyst_agent.py # closed-loop GORR autonomy

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
```

Deploy to Testnet (Odra livenet backend) and reproducible-build verification are documented inline in `deploy/src/` and `build-wasm.sh`. Contracts deploy as **upgradable** packages; the build is verifiable by rebuilding from source and matching the on-chain wasm hash.

---

## Repository

```
contracts/   production-vault · sawit-token · token-minter · yield-distributor  (Odra/Rust)
agents/      oracle · yield_router · market_analyst · x402 (reference) · x402_settle · mcp_server
agents/x402-official/  official-protocol x402: facilitator · gated server · paying agent (TS)
e2e/         full_flow.rs — production → mint → KYC → claim across all 4 contracts
deploy/      livenet deploy + agent-driven bins (record/fund/set_gorr/mint/claim/set_claimable) + read_state/read_balance bridges
frontend/    Next.js 14 app — landing + investor dashboard (CSPR.click, live reads & claims)
```

Demo: **[youtu.be/jT4uH5fRL8E](https://youtu.be/jT4uH5fRL8E)** · Live app: **[sawitfinance.xyz](https://sawitfinance.xyz)** · GitHub: **[wngstnr-code/Sawit-Finance](https://github.com/wngstnr-code/Sawit-Finance)** · X: **[@wnsstt](https://x.com/wnsstt)**

---

## Launch Plan

**Shipped today (Qualification Round, July 2026)** — the full economic loop live on Casper Testnet: 4 upgradable contracts, 3 autonomous agents writing on-chain, official-protocol x402 settlement, MCP server, and a working investor app at [sawitfinance.xyz](https://sawitfinance.xyz).

| Phase | Gate to start | Deliverables |
|-------|---------------|--------------|
| **1 — Mainnet readiness** | Buildathon feedback incorporated | External security review of the 4 Odra contracts → **mainnet deployment** (upgradable packages, same verified-build process) · production CSPR.click app ID · yield settlement migrated to [csprUSD](https://www.casper.network/news/sarson-funds-csprusd-stablecoin-live-on-casper-network-testnet) (drop-in CEP-18) to remove the USD/CSPR FX mismatch |
| **2 — Real production data** | Contracts live on mainnet | First **mill data partnership** (GAPKI/KPBN-affiliated estate or cooperative) feeding per-epoch tonnage into the existing oracle pipeline — the pipeline is feed-agnostic, so this swaps the input without touching contracts · pilot epoch with real production figures · **Merkle-based claims** for gas-efficient, operator-trustless distribution at holder scale |
| **3 — Trust decentralization** | Pilot epoch settled with real data | Licensed-operator + KYC-provider integration for a compliant public offering · multi-sig operator · DAO-governed GORR bounds · open the x402-gated CPO data endpoints to **third-party agents** (any x402 client can already pay them — the interoperable rails are live today) |

> Sequencing rationale: CSPR yield ships in v1 because the native-CSPR loop works today with zero external dependencies; csprUSD is a clean, well-scoped swap once mainnet-live. Real mill data is a partnership problem, not an architecture problem — the verification pipeline, CPI-locked minting, and oracle reputation scoring don't change.

**Where to follow the build:** [X / Twitter @wnsstt](https://x.com/wnsstt) (active) · [GitHub](https://github.com/wngstnr-code/Sawit-Finance) · [DoraHacks BUIDL](https://dorahacks.io/buidl/46159) · live app [sawitfinance.xyz](https://sawitfinance.xyz)

---

## Buildathon Criteria

| Criterion | Implementation |
|-----------|---------------|
| Technical Execution | 4 Odra contracts, 15 tests (incl. full e2e), 3 real CPIs, full loop live on Testnet |
| Innovation | First Indonesian palm oil RWA on Casper |
| Agentic AI | Closed-loop autonomous agent (read→reason→write) + Gemini + **official-protocol x402 live settlement** (+ from-scratch reference impl) + **Casper MCP server** |
| Oracle Reputation | On-chain rolling accuracy score, readable via `get_oracle_reputation()` |
| Compliance | KYC-gated yield claims, enforced cross-contract |
| Real-World Applicability | $30B CPO market, live FRED/IMF price feed |
| Working Contracts | 15 tests green; upgradable, deployed + executed on Casper Testnet |
| Long-Term Launch Plans | Milestone-gated [Launch Plan](#launch-plan) — security review → mainnet → real mill data → decentralized trust; active socials |

---

## License

Released under the [MIT License](LICENSE). Contributions are welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

---

*Casper Agentic Buildathon 2026 — RWA · DeFi · Agentic AI*
