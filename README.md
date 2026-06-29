# Sawit Finance

**Tokenized Indonesian Palm Oil on Casper Network**

> Real CPO. Real revenue. On-chain yield — driven by autonomous AI agents.

Built for the **Casper Agentic Buildathon 2026**.

**🌐 Live app: [sawitfinance.xyz](https://sawitfinance.xyz)** · Live on Casper Testnet · [GitHub](https://github.com/wngstnr-code/Sawit-Finance)

> ### ✅ Verify it yourself in 30 seconds
> - **🟢 Use it:** [sawitfinance.xyz](https://sawitfinance.xyz) — connect a Casper wallet and claim real CSPR yield
> - **⛓️ See the loop on-chain:** KYC-gated yield claim [`23e6e9d7…`](https://testnet.cspr.live/transaction/23e6e9d7d665a3a94e58170ee2c70434cf6dc71f8c18a2998f97f8497f80f8f6) on cspr.live (record→mint→fund→claim — [full loop below](#live-on-casper-testnet--the-full-loop-executed-on-chain))
> - **🤖 Agentic AI:** [Casper MCP server](#the-agentic-layer) (7 live-state tools) + x402 **live settlement** [`8b25fb9e…`](https://testnet.cspr.live/deploy/8b25fb9e548b2f3cf639f5ca65e5c54581223f43bb3a647730b0d6fffb074856) — a real CSPR transfer for a paid agent request

---

## The Problem

Indonesia produces ~60% of the world's palm oil — a **$30B+/year** export market. Yet that revenue is completely off-chain and inaccessible to global investors:

- **No fractional access.** You can't buy a $100 stake in a palm oil estate's revenue.
- **Opaque pricing.** CPO prices clear in daily KPBN tender auctions most investors never see.
- **Trust gap.** Real-world-asset (RWA) tokenization usually means "trust the operator" — production figures, yield math, and compliance all happen in a black box.

## The Solution

Sawit Finance tokenizes **CPO production revenue** as **SAWIT** (a CEP-18 token). Each token is a fractional, yield-bearing claim on real palm oil output — not a synthetic, not a price tracker. Production is verified by an AI oracle, SAWIT is minted against verified tonnage, and revenue flows back to holders as on-chain CSPR yield.

The difference from a typical RWA: **every operator action is verifiable on-chain.** An AI oracle's accuracy is scored on-chain, mint amounts are read cross-contract (the operator can't fabricate them), and yield claims are KYC-gated and leave permanent receipts. A trusted operator that can't lie undetected.

---

## How It Works

<pre>
Palm Oil Mills (PKS)
       │
       ▼
AI Oracle Agent ──live──> FRED/IMF palm oil price   (real feed, every cycle)
       │        ──x402──> KPBN / MPOB / GAPKI        (Gemini cross-validation)
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

> Yield settles in **CSPR** in v1. Because CPO revenue is USD-denominated, v2 swaps yield to a USD stablecoin ([csprUSD](https://www.casper.network/news/sarson-funds-csprusd-stablecoin-live-on-casper-network-testnet)) — a drop-in CEP-18 change. See [Roadmap](#roadmap).

---

## The Agentic Layer

Three AI agents run the protocol autonomously — this is the heart of the Buildathon entry.

| Agent | Role | AI |
|-------|------|----|
| **Oracle Agent** | Anchors on the live FRED/IMF palm oil price, cross-validates GAPKI/KPBN/MPOB with Gemini, posts verified data on-chain | Gemini 2.5 Flash |
| **Yield Router** | Monitors CPO price, auto-triggers CSPR yield distribution when a threshold is met | Rule-based |
| **Market Analyst** | Reads all 4 contracts, runs Gemini strategy analysis, **autonomously adjusts GORR on-chain** | Gemini 2.5 Flash |

**Closed-loop autonomy.** The Market Analyst is the only agent that closes the loop: `READ chain → REASON with Gemini → WRITE back to chain`. With `AUTONOMY_MODE=on` it calls `TokenMinter.update_config()` to tune GORR from its own analysis. **Safety rails** cap any single change to ±100 bps and lock GORR to a [1%, 10%] band — a hallucinated recommendation can never harm holders.

**Gemini reasoning gate.** Before data hits the chain, the Oracle Agent passes all 3 source readings to Gemini, which flags seasonal anomalies / suspicious spikes and can veto a submission (`"recommendation": "REJECT"` blocks the epoch regardless of the statistical score).

**x402 micropayments — live on-chain settlement.** Agents pay per-request for gated CPO data using a real **x402 handshake** (ed25519, amount/recipient/resource/nonce binding, replay-protected). Settlement is **live**: `agents/x402_settle.py` runs the handshake and then **broadcasts a real native CSPR transfer on Casper Testnet** for the payment, verifying it executed before serving the data. Example settlement: [`8b25fb9e…`](https://testnet.cspr.live/deploy/8b25fb9e548b2f3cf639f5ca65e5c54581223f43bb3a647730b0d6fffb074856).

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
| Agents | Python (asyncio/aiohttp) · Gemini 2.5 Flash · x402 (ed25519) · MCP SDK |
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

# 3. x402 — verify the protocol, then settle real CSPR on-chain
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
agents/      oracle · yield_router · market_analyst · x402 · x402_settle · mcp_server
e2e/         full_flow.rs — production → mint → KYC → claim across all 4 contracts
deploy/      livenet deploy + record/mint/fund/claim bins + read_state/read_balance bridges
frontend/    Next.js 14 app — landing + investor dashboard (CSPR.click, live reads & claims)
```

Live app: **[sawitfinance.xyz](https://sawitfinance.xyz)** · GitHub: **[wngstnr-code/Sawit-Finance](https://github.com/wngstnr-code/Sawit-Finance)**

---

## Roadmap

| Status | Item |
|--------|------|
| 🔜 | **Stablecoin yield** — settle in [csprUSD](https://www.casper.network/news/sarson-funds-csprusd-stablecoin-live-on-casper-network-testnet) (drop-in CEP-18) to remove the USD/CSPR FX mismatch |
| 🔜 | **Merkle-based claims** — gas-efficient, operator-trustless distribution at holder scale |
| 🔜 | **Mainnet + real mill data partnerships** (GAPKI/KPBN production feeds) |

> CSPR yield ships in v1 because the native-CSPR loop is fully working today with zero external dependencies; the stablecoin swap is a clean, well-scoped v2.

---

## Buildathon Criteria

| Criterion | Implementation |
|-----------|---------------|
| Technical Execution | 4 Odra contracts, 15 tests (incl. full e2e), 3 real CPIs, full loop live on Testnet |
| Innovation | First Indonesian palm oil RWA on Casper |
| Agentic AI | Closed-loop autonomous agent (read→reason→write) + Gemini + **x402 live settlement** + **Casper MCP server** |
| Oracle Reputation | On-chain rolling accuracy score, readable via `get_oracle_reputation()` |
| Compliance | KYC-gated yield claims, enforced cross-contract |
| Real-World Applicability | $30B CPO market, live FRED/IMF price feed |
| Working Contracts | 15 tests green; upgradable, deployed + executed on Casper Testnet |

---

*Casper Agentic Buildathon 2026 — RWA · DeFi · Agentic AI*
