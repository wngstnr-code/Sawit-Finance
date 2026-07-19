# Autonomous agents in CI — self-updating Agent Control Room

The agents (`agents/*.py`) are long-running daemons: they read on-chain state, reason
with Gemini, and **sign real Casper Testnet transactions** on a cadence. Their per-run
state (`agents/.market_state.json`, `.oracle_provenance.json`, …) is what
`sawitfinance.xyz` reads at request time via `/api/agents` to decide whether each agent
is **Active** and to show its latest tx.

Those state files are gitignored and written on whatever machine runs the agent — so
running an agent on a laptop only updates a *local* dev server. To make the **deployed**
site show Active, the fresh state has to reach the repo. That's what
[`.github/workflows/agents.yml`](../.github/workflows/agents.yml) does:

```
run one agent cycle → sign a real tx → commit agents/.*state.json → push
        → Vercel redeploys sawitfinance.xyz → Control Room flips to Active
```

`mcp.status` on the live `/api/agents` already returns `available`, which confirms the
deployment can read `../agents/*` at runtime — so a committed state file is picked up.

## One-time setup

Add three repository secrets (**Settings → Secrets and variables → Actions**):

| Secret | Contents |
|--------|----------|
| `CASPER_SECRET_KEY_PEM` | the full text of the operator `secret_key.pem` (**testnet** key) |
| `ROOT_ENV` | the full text of the repo-root `.env` (ODRA livenet config) |
| `AGENTS_ENV` | the full text of `agents/.env` (contract hashes, `GEMINI_API_KEY`, `CSPR_CLOUD_API_KEY`, …) |

The workflow materializes the pem to `~/.casper-keys/secret_key.pem` and overrides
`ODRA_CASPER_LIVENET_SECRET_KEY_PATH` to point at it, so the local path baked into your
`ROOT_ENV` doesn't matter.

> **Security note.** This puts a signing key in GitHub Actions. It's acceptable here
> **only because it's a testnet key** — worst case is faucet-recoverable testnet CSPR and
> testnet contract state. Never do this with a mainnet key; the Phase-1 multi-sig operator
> in the launch plan is what replaces this for production.

## Triggers

- **Scheduled** (`cron: 17 6 * * *`, daily): runs the **Market Analyst** with
  `AUTONOMY_MODE=on` and **no** demo forcing. It acts on-chain **only** when Gemini
  recommends a different GORR *and* the 24h cooldown has elapsed — otherwise it's a no-op
  and nothing is committed. This is honest, rail-protected autonomy.
- **Manual** (`workflow_dispatch`): pick the agent (`market-analyst` / `oracle` / `both`).
  `demo=true` (default) forces **one guaranteed on-chain GORR change** — it bypasses the
  cooldown and report-only gate and nudges GORR one clamp-step within
  `[MIN_GORR_BPS, MAX_GORR_BPS]` — so a manual run **always** produces a fresh, clickable
  tx. Use this right before recording.

Oracle is left off the daily schedule on purpose: each oracle cycle records a **new
epoch**, so running it daily would inflate epochs. Trigger it manually when you actually
want a new production epoch.

## Recording the demo against the live site

1. Trigger the workflow: **Actions → Autonomous agents → Run workflow** (leave
   `demo=true`), or `gh workflow run agents.yml`.
2. Wait for the run to finish **and** for the Vercel redeploy to complete (~2–4 min
   total). The run's summary prints the GORR tx link.
3. Refresh `sawitfinance.xyz` → the Market Analyst card is **Active** with the new tx
   (`isLastKnown: false`), clickable to cspr.live.
4. **Now** start recording. For the "it runs itself" beat, show the **Actions** tab —
   the scheduled green runs are the proof no human triggered them.

> The 2–4 min wait is dead time — trigger first, verify the live site flipped, *then* hit
> record. Don't film the wait.

## Running one cycle locally (pre-check only)

```bash
cd agents
../.venv/bin/python market_analyst_agent.py --once --demo   # forces a fresh GORR tx
../.venv/bin/python oracle_agent.py --once                  # records a new epoch
```

This writes state locally and updates a local `npm run dev`, but does **not** touch the
deployed site (the files stay on your machine). Use it to confirm your keys/env work
before relying on the CI path.
