import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { CONTRACTS, SALE } from '@/lib/config';

export const dynamic = 'force-dynamic';

// Per-account deploy history via CSPR.cloud (testnet). The API key lives in
// agents/.env (CSPR_CLOUD_API_KEY) and never reaches the client — this route
// proxies and reduces the raw deploys to the app's ActivityEntry shape.
const CLOUD_API = 'https://api.testnet.cspr.cloud';
const STALE_MS = 60_000;

type Entry = {
  type: 'buy' | 'claim' | 'kyc' | 'transfer' | 'contract';
  hash: string;
  at: number;
  note?: string;
};

const mem = new Map<string, { entries: Entry[]; at: number }>();

function loadCloudKey(): string | null {
  if (process.env.CSPR_CLOUD_API_KEY) return process.env.CSPR_CLOUD_API_KEY;
  const file = path.resolve(process.cwd(), process.env.AGENTS_ENV_FILE || '../agents/.env');
  if (!existsSync(file)) return null;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('CSPR_CLOUD_API_KEY=')) {
      const v = line.slice('CSPR_CLOUD_API_KEY='.length).trim();
      if (v) return v;
    }
  }
  return null;
}

const CONTRACT_NAMES: Record<string, string> = {
  [CONTRACTS.sawitToken]: 'SAWIT token',
  [CONTRACTS.productionVault]: 'Production vault',
  [CONTRACTS.tokenMinter]: 'Token minter',
  [CONTRACTS.yieldDistributor]: 'Yield distributor',
};

type CloudDeploy = {
  deploy_hash: string;
  timestamp: string;
  error_message: string | null;
  contract_package_hash?: string | null;
  args?: Record<string, { parsed?: unknown }> | null;
};

function classify(d: CloudDeploy): Entry | null {
  if (d.error_message) return null; // keep the feed to what actually executed
  const at = Date.parse(d.timestamp);
  if (Number.isNaN(at)) return null;
  const args = d.args ?? {};
  const pkg = d.contract_package_hash ?? null;

  if (!pkg && args.target && args.amount) {
    // Native CSPR transfer; the buy flow tags transfers with the sale memo id.
    const isBuy = String(args.id?.parsed ?? '') === String(SALE.buyMemoId);
    return { type: isBuy ? 'buy' : 'transfer', hash: d.deploy_hash, at };
  }
  if (pkg === CONTRACTS.yieldDistributor && args.epoch_number && !args.holder && !args.holders) {
    return { type: 'claim', hash: d.deploy_hash, at };
  }
  if (pkg === CONTRACTS.productionVault && args.holder && Object.keys(args).length === 1) {
    return { type: 'kyc', hash: d.deploy_hash, at };
  }
  return {
    type: 'contract',
    hash: d.deploy_hash,
    at,
    note: (pkg && CONTRACT_NAMES[pkg]) || 'Contract call',
  };
}

export async function GET(req: Request) {
  const publicKey = new URL(req.url).searchParams.get('publicKey')?.toLowerCase() ?? '';
  if (!/^0[12][0-9a-f]{64,66}$/.test(publicKey)) {
    return NextResponse.json({ entries: [], error: 'bad publicKey' }, { status: 400 });
  }

  const cached = mem.get(publicKey);
  if (cached && Date.now() - cached.at < STALE_MS) {
    return NextResponse.json({ entries: cached.entries, cached: true });
  }

  const key = loadCloudKey();
  if (!key) return NextResponse.json({ entries: [], error: 'no CSPR.cloud key' });

  try {
    const r = await fetch(`${CLOUD_API}/accounts/${publicKey}/deploys?page=1&limit=50`, {
      headers: { Authorization: key },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`cloud ${r.status}`);
    const j = (await r.json()) as { data?: CloudDeploy[] };
    const entries = (j.data ?? [])
      .map(classify)
      .filter((e): e is Entry => e !== null)
      .sort((a, b) => b.at - a.at);
    mem.set(publicKey, { entries, at: Date.now() });
    return NextResponse.json({ entries });
  } catch {
    // Cloud unreachable — the client still has its local log to show.
    return NextResponse.json({ entries: stale(cached), degraded: true });
  }
}

function stale(c?: { entries: Entry[] }): Entry[] {
  return c?.entries ?? [];
}
