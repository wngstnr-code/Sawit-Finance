import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { readChainState } from '@/lib/casperState';
import { STATE_SNAPSHOT } from '@/lib/stateSnapshot';
import type { AgentInfo, AgentsPayload } from '@/lib/agentsTypes';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const REPO_ROOT = path.resolve(process.cwd(), '..');
const AGENTS_DIR = path.join(REPO_ROOT, 'agents');
const STATE_CACHE_FILE = path.resolve(process.cwd(), '.state-cache.json');

// Agents this MVP ships write real signed Casper transactions, but their local
// state files only persist a subset of run history (deploy hashes aren't kept
// everywhere — see each build*Agent() below for exactly what's read and what's
// a disclosed "last known" example from the README instead).
const LAST_KNOWN_TX = {
  oracleRecord: '2e6e00b168066072d960184fdee4300c46a946dbb3b6b6b141c8fcb8166e8ac6',
  marketAnalystGorr: '1b703ee1d289ebdcee96496b2ff0d0ecb8c9aad708c6ad29f31dd428467cc0d0',
  yieldRouterFund: '3cb6b496392c88b80e2ebe64820d2858b78e948072f963ac52b9f122438856b8',
} as const;

const MCP_TOOLS = [
  'get_protocol_state',
  'get_oracle_reputation',
  'get_palm_oil_price',
  'get_account_position',
  'get_contracts',
  'get_economic_loop',
  'refresh_protocol_state',
];

const X402_OFFICIAL_ASSET_PACKAGE =
  'ace00b4d5e5e1fb52be4260e0aba9cbf2595992eb599519d6b596b9ff0ea1f2b';

// Generic staleness window for "is this agent actively running" — these agents
// cycle monthly-to-hourly by design, so a wide window avoids false "idle" reads
// right after a slow demo period, while still catching genuinely dead agents.
const STALE_MS = 45 * 24 * 3600 * 1000;

function readJson<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function loadEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

const ENV_FILE = loadEnvFile(
  path.resolve(process.cwd(), process.env.LIVENET_ENV_FILE || '../.env')
);

function envStr(key: string, fallback: string): string {
  return ENV_FILE[key] ?? process.env[key] ?? fallback;
}
function envNum(key: string, fallback: number): number {
  const v = ENV_FILE[key] ?? process.env[key];
  const n = v != null ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
function envBool(key: string, fallback: boolean): boolean {
  const v = ENV_FILE[key] ?? process.env[key];
  if (v == null) return fallback;
  return v.toLowerCase() === 'on' || v === '1' || v.toLowerCase() === 'true';
}

// Read-only reuse of the same on-chain snapshot /api/state maintains — this
// route never writes the cache (avoids racing the state route's own refresh
// cycle) and falls back to a fresh live read, then the bundled snapshot.
async function readOnchain(): Promise<{ state: Record<string, unknown>; isSnapshot: boolean }> {
  const cached = readJson<{ state: Record<string, unknown>; at: number }>(STATE_CACHE_FILE);
  if (cached && Date.now() - cached.at < 120_000) {
    return { state: cached.state, isSnapshot: false };
  }
  try {
    return { state: (await readChainState()) as unknown as Record<string, unknown>, isSnapshot: false };
  } catch {
    if (cached) return { state: cached.state, isSnapshot: false };
    return { state: STATE_SNAPSHOT as unknown as Record<string, unknown>, isSnapshot: true };
  }
}

/* ── Oracle Agent (agents/oracle_agent.py) ────────────────────────────── */

type OracleProvenanceRecord = {
  resource_path: string;
  x402_provenance: 'official' | 'reference' | 'unpaid_fallback';
  paid_via_x402: boolean;
  timestamp: string;
};
type OracleProvenanceFile = {
  latest?: OracleProvenanceRecord;
  by_resource?: Record<string, OracleProvenanceRecord>;
};

function buildOracleAgent(state: Record<string, unknown>): AgentInfo {
  const provFile = readJson<OracleProvenanceFile>(path.join(AGENTS_DIR, '.oracle_provenance.json'));
  const latest = provFile?.latest;
  const latestTs = latest ? Date.parse(latest.timestamp) : NaN;
  const fresh = Number.isFinite(latestTs) && Date.now() - latestTs < STALE_MS;

  const epochs = (state.epochs as Array<Record<string, unknown>> | undefined) ?? [];
  const lastEpoch = epochs.length > 0 ? epochs[epochs.length - 1] : undefined;
  const epochLabel = (state.latest_epoch_label as string) || null;
  const priceCents = (state.latest_cpo_price_cents as number) ?? null;
  const epochTsMs = lastEpoch ? Number(lastEpoch.epoch_timestamp) * 1000 : undefined;

  const config: AgentInfo['config'] = {
    sources: 'GAPKI + KPBN + MPOB',
    priceFeed: 'FRED/IMF (live)',
    minValidationScore: 60,
    maxSourceDivergencePct: 10,
    x402Official: envBool('X402_OFFICIAL', true),
  };

  const agent: AgentInfo = {
    id: 'oracle',
    name: 'Oracle Agent',
    kind: 'llm',
    status: fresh ? 'active' : 'idle',
    idleHint: 'python agents/oracle_agent.py',
    config,
  };

  if (epochLabel && priceCents != null) {
    agent.decision = {
      summary: `Latest verified epoch ${epochLabel}: $${(priceCents / 100).toFixed(2)}/ton, cross-validated across GAPKI, KPBN, and MPOB against the live FRED/IMF feed.`,
      engine: 'Gemini 2.5 Flash cross-validation',
    };
    agent.lastAction = {
      type: 'record_production',
      timestamp: epochTsMs ?? Date.now(),
      txHash: LAST_KNOWN_TX.oracleRecord,
      isLastKnown: true,
      detail: `Recorded epoch ${epochLabel} on SawitProductionVault`,
    };
  }

  if (latest) {
    agent.provenance = {
      method: latest.x402_provenance,
      paidViaX402: latest.paid_via_x402,
      resourcePath: latest.resource_path,
      timestamp: Number.isFinite(latestTs) ? latestTs : Date.now(),
    };
  }

  return agent;
}

/* ── Market Analyst Agent (agents/market_analyst_agent.py) ───────────────── */

type MarketState = {
  last_gorr_change_ts?: number;
  last_gorr_change_deploy?: string | null;
};

function buildMarketAnalystAgent(state: Record<string, unknown>): AgentInfo {
  const marketState = readJson<MarketState>(path.join(AGENTS_DIR, '.market_state.json'));
  const gorrBps = (state.gorr_bps as number) ?? null;

  const config: AgentInfo['config'] = {
    maxChangeBpsPerCycle: envNum('MAX_GORR_CHANGE_BPS', 100),
    minGorrBps: envNum('MIN_GORR_BPS', 100),
    maxGorrBps: envNum('MAX_GORR_BPS', 1000),
    cooldownHours: envNum('GORR_CHANGE_COOLDOWN_SECONDS', 86400) / 3600,
    autonomyMode: envBool('AUTONOMY_MODE', false),
  };

  const changeTs = marketState?.last_gorr_change_ts;
  const fresh = changeTs != null && Date.now() - changeTs * 1000 < STALE_MS;

  const agent: AgentInfo = {
    id: 'market-analyst',
    name: 'Market Analyst',
    kind: 'llm',
    status: fresh ? 'active' : 'idle',
    idleHint: 'python agents/market_analyst_agent.py',
    config,
  };

  if (gorrBps != null) {
    agent.decision = {
      summary: `GORR is currently ${(gorrBps / 100).toFixed(2)}% (${gorrBps} bps). Every recommendation is clamped to ±${config.maxChangeBpsPerCycle} bps per cycle and a [${(Number(config.minGorrBps) / 100).toFixed(0)}%, ${(Number(config.maxGorrBps) / 100).toFixed(0)}%] band before it ever reaches the chain.`,
      engine: 'Gemini 2.5 Flash, closed-loop (read → reason → write)',
    };
  }

  if (changeTs) {
    agent.lastAction = {
      type: 'set_gorr',
      timestamp: changeTs * 1000,
      txHash: marketState?.last_gorr_change_deploy || LAST_KNOWN_TX.marketAnalystGorr,
      isLastKnown: !marketState?.last_gorr_change_deploy,
      detail: 'Updated GORR on TokenMinter.update_config()',
    };
  } else {
    agent.lastAction = {
      type: 'set_gorr',
      timestamp: Date.now(),
      txHash: LAST_KNOWN_TX.marketAnalystGorr,
      isLastKnown: true,
      detail: 'Last known autonomous GORR change (example run, not from this machine)',
    };
  }

  return agent;
}

/* ── Allocation Agent (agents/allocation_agent.py) ────────────────────── */

type AllocationEntry = {
  status: 'allocated' | 'flagged' | 'failed' | 'too_small';
  timestamp: number;
  investor?: string;
  deposit_cspr?: number;
  epoch?: number;
  reason?: string;
  allocation?: { allocation?: number } | number;
};
type AllocationStateFile = Record<string, AllocationEntry>;

function buildAllocationAgent(): AgentInfo {
  const allocState = readJson<AllocationStateFile>(path.join(AGENTS_DIR, '.allocation_state.json'));
  const entries = allocState ? Object.entries(allocState) : [];

  const config: AgentInfo['config'] = {
    priceCsprPerSawit: envNum('SAWIT_PRICE_CSPR', 10),
    buyMemoId: envNum('BUY_MEMO_ID', 5417),
    maxAutoAllocateCspr: envNum('ALLOC_MAX_AUTO_CSPR', 5000),
    rapidRepeatWindowSeconds: envNum('ALLOC_RAPID_REPEAT_WINDOW_SECONDS', 600),
    rapidRepeatCount: envNum('ALLOC_RAPID_REPEAT_COUNT', 3),
  };

  let latest: (AllocationEntry & { hash: string }) | null = null;
  for (const [hash, entry] of entries) {
    if (!latest || entry.timestamp > latest.timestamp) latest = { ...entry, hash };
  }

  const fresh = latest ? Date.now() - latest.timestamp * 1000 < STALE_MS : false;

  const agent: AgentInfo = {
    id: 'allocation',
    name: 'Allocation Agent',
    kind: 'llm-advisory',
    status: fresh ? 'active' : 'idle',
    idleHint: 'python agents/allocation_agent.py',
    config,
  };

  agent.decision = {
    summary: `Deposits above ${config.maxAutoAllocateCspr} CSPR, or ${config.rapidRepeatCount}+ rapid repeats from the same sender, are screened by an advisory Gemini pass and flagged for manual review instead of auto-allocated — allocation math itself stays fully deterministic.`,
    engine: 'Gemini 2.5 Flash (advisory anomaly screen, not in the settlement hot path)',
  };

  if (latest) {
    const label =
      latest.status === 'allocated'
        ? 'Allocated SAWIT'
        : latest.status === 'flagged'
        ? 'Flagged for manual review'
        : latest.status === 'failed'
        ? 'Allocation failed'
        : 'Deposit below minimum';
    const investorShort = latest.investor ? `${latest.investor.slice(0, 8)}…` : 'investor';
    agent.lastAction = {
      type: latest.status,
      timestamp: latest.timestamp * 1000,
      txHash: latest.hash,
      detail: `${label} — ${latest.deposit_cspr ?? '?'} CSPR from ${investorShort}${latest.reason ? ` (${latest.reason})` : ''}`,
    };
  }

  return agent;
}

/* ── Yield Router / Settlement Keeper (agents/yield_router.py) ───────────── */

type YieldHolderEntry = { status: 'done' | 'failed'; motes: string; ts: string };
type YieldStateFile = {
  epochs?: Record<string, { holders?: Record<string, YieldHolderEntry> }>;
  expired?: Record<string, unknown>;
};

function buildYieldRouterAgent(state: Record<string, unknown>): AgentInfo {
  const yieldState = readJson<YieldStateFile>(path.join(AGENTS_DIR, '.yield_state.json'));

  const config: AgentInfo['config'] = {
    triggerMode: envStr('TRIGGER_MODE', 'monthly'),
    priceTriggerUsdPerTon: envNum('PRICE_TRIGGER_CENTS', 85_000) / 100,
    monthlyDistributionCspr: envNum('MONTHLY_DISTRIBUTION_CSPR', 5000),
    autoSweep: envBool('AUTO_SWEEP', false),
  };

  let bestEpoch: number | null = null;
  let bestTs = -Infinity;
  let holderCount = 0;
  if (yieldState?.epochs) {
    for (const [epochKey, epochState] of Object.entries(yieldState.epochs)) {
      const holders = epochState.holders ?? {};
      const doneCount = Object.values(holders).filter((h) => h.status === 'done').length;
      for (const h of Object.values(holders)) {
        const ts = Date.parse(h.ts);
        if (Number.isFinite(ts) && ts > bestTs) {
          bestTs = ts;
          bestEpoch = Number(epochKey);
          holderCount = doneCount;
        }
      }
    }
  }

  const fresh = bestTs > -Infinity && Date.now() - bestTs < STALE_MS;

  const agent: AgentInfo = {
    id: 'yield-router',
    name: 'Yield Router',
    kind: 'rule-based',
    status: fresh ? 'active' : 'idle',
    idleHint: 'python agents/yield_router.py',
    config,
  };

  agent.decision = {
    summary: `No LLM in the settlement hot path — this is a deterministic keeper. Trigger mode: ${config.triggerMode === 'price' ? `CPO price ≥ $${config.priceTriggerUsdPerTon}/ton` : 'first day of month'}. Apportionment is a largest-remainder split of ${config.monthlyDistributionCspr} CSPR across real SAWIT holder balances.`,
    engine: 'Rule-based (no LLM)',
  };

  if (bestEpoch != null) {
    agent.lastAction = {
      type: 'settle_epoch',
      timestamp: bestTs,
      txHash: LAST_KNOWN_TX.yieldRouterFund,
      isLastKnown: true,
      detail: `Settled ${holderCount} holder(s) claimable for epoch #${bestEpoch} (fund tx shown is a last-known example — per-holder set_claimable hashes aren't persisted locally)`,
    };
  } else if (state.current_distribution_epoch) {
    agent.lastAction = {
      type: 'fund_epoch',
      timestamp: Date.now(),
      txHash: LAST_KNOWN_TX.yieldRouterFund,
      isLastKnown: true,
      detail: `Last known funded epoch #${state.current_distribution_epoch} (example run, not from this machine)`,
    };
  }

  return agent;
}

export async function GET() {
  const { state, isSnapshot } = await readOnchain();

  const agents: AgentInfo[] = [
    buildOracleAgent(state),
    buildMarketAnalystAgent(state),
    buildAllocationAgent(),
    buildYieldRouterAgent(state),
  ];

  const oracleProv = agents[0].provenance;

  const payload: AgentsPayload = {
    generatedAt: Date.now(),
    onchain: {
      gorrBps: (state.gorr_bps as number) ?? null,
      oracleReputation: (state.oracle_reputation as number) ?? null,
      epochCount: (state.epoch_count as number) ?? null,
      latestCpoPriceCents: (state.latest_cpo_price_cents as number) ?? null,
      latestEpochLabel: (state.latest_epoch_label as string) ?? null,
      currentDistributionEpoch: (state.current_distribution_epoch as number) ?? null,
      latestEpochFunded: (state.latest_epoch_funded as boolean) ?? null,
    },
    agents,
    mcp: {
      tools: MCP_TOOLS,
      status: existsSync(path.join(AGENTS_DIR, 'mcp_server.py')) ? 'available' : 'unavailable',
    },
    x402: {
      assetSymbol: 'SAWITX',
      assetPackage: X402_OFFICIAL_ASSET_PACKAGE,
      status: oracleProv?.method ?? 'unknown',
    },
    isSnapshot,
  };

  return NextResponse.json(payload);
}
