# Contributing to Sawit Finance

Thanks for your interest in Sawit Finance — tokenized Indonesian palm oil (CPO) revenue on
Casper Network. This guide covers how to build, test, and propose changes.

## Repository layout

| Path | What lives here |
|------|-----------------|
| `contracts/` | Rust/Odra smart contracts: `production-vault`, `sawit-token` (CEP-18), `token-minter`, `yield-distributor` |
| `wasm/` | Built contract WASM artifacts |
| `deploy/` | Casper deploy scripts |
| `e2e/` | End-to-end on-chain integration tests |
| `agents/` | Python AI agents (oracle, yield router, market analyst), Casper MCP server, and x402 integration |
| `frontend/` | Next.js 14 dApp (CSPR.click wallet integration) |

## Prerequisites

- Rust (see `rust-toolchain`) with the `wasm32-unknown-unknown` target
- Node.js 20+ (frontend)
- Python 3.10+ (agents)
- The [`casper-client`](https://docs.casper.network/) for deploys

## Build & test

### Contracts (Rust / Odra)
```bash
cargo build --release     # workspace build
cargo test                # unit + e2e tests
./build-wasm.sh           # produce optimized contract WASM
```

### Frontend
```bash
cd frontend
npm ci
npm run build
npm run dev               # local dev server
```

### Agents
```bash
pip install -r agents/requirements.txt
python -m compileall agents
npm run agent:oracle      # or agent:router / agent:analyst (see package.json scripts)
```

Copy `.env.example` to `.env` and fill in your own keys. **Never commit secrets** — `.env`
files are gitignored.

## Making changes

1. Fork the repo and create a feature branch: `git checkout -b feat/your-change`.
2. Keep changes focused; match the style of the surrounding code.
3. Run the relevant build/test commands above before opening a PR.
4. Open a pull request against `main` using the PR template. Describe **what** changed, **why**,
   and **how you tested it** (include Casper Testnet transaction hashes where relevant).

## Reporting issues

Use the issue templates (bug report / feature request). For questions, join the Casper
community: [Telegram](https://t.me/CSPRDevelopers) · [Discord](https://discord.com/invite/caspernetwork).

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE)
and that you will follow the [Code of Conduct](CODE_OF_CONDUCT.md).
