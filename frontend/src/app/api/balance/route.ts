import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Bal = { balance: number; claimable_motes: string };

// Real on-chain SAWIT balance + per-account claimable, read via the `read_balance`
// bridge (Odra client). Served as a snapshot fallback when the native reader
// isn't available (e.g. Vercel serverless). Keyed by account-hash hex; values are
// genuine on-chain figures captured from the chain.
const BALANCE_SNAPSHOT: Record<string, Bal> = {
  // account 1 — holds 100 SAWIT, 25 CSPR claimable on epoch 2
  e8134d5d5caf9ace626209d09365af48a867a18199b5139da8873733c6c14efe: {
    balance: 100,
    claimable_motes: '25000000000',
  },
  // deployer — holds the rest of supply, no claimable allocation
  '57895ec9532fba625e63d3f7a5e250b50f9c5e0fb5321f8fa5890dd05d4ae2ec': {
    balance: 2_259_900,
    claimable_motes: '0',
  },
};

const STALE_MS = 60_000;
const mem = new Map<string, { val: Bal; at: number }>();

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

function runBridge(accountHashHex: string): Promise<Bal> {
  const bin = path.resolve(
    process.cwd(),
    process.env.READ_BALANCE_BIN || '../target/release/read_balance'
  );
  const envFile = path.resolve(
    process.cwd(),
    process.env.LIVENET_ENV_FILE || '../.env'
  );
  if (!existsSync(bin)) return Promise.reject(new Error('read_balance not found'));
  const env = {
    ...process.env,
    ...loadEnvFile(envFile),
    BALANCE_ACCOUNT: `account-hash-${accountHashHex}`,
  };
  return new Promise((resolve, reject) => {
    execFile(bin, { env, timeout: 110_000, maxBuffer: 1 << 20 }, (err, stdout) => {
      if (err) return reject(err);
      const line = stdout
        .split('\n')
        .find((l) => l.startsWith('SAWIT_BALANCE_JSON '));
      if (!line) return reject(new Error('no SAWIT_BALANCE_JSON'));
      try {
        const j = JSON.parse(line.slice('SAWIT_BALANCE_JSON '.length));
        resolve({
          balance: Number(j.balance),
          claimable_motes: String(j.claimable_motes ?? '0'),
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

export async function GET(req: Request) {
  const account = (new URL(req.url).searchParams.get('account') || '')
    .toLowerCase()
    .replace(/^account-hash-/, '');
  if (!/^[0-9a-f]{64}$/.test(account)) {
    return NextResponse.json({ error: 'invalid account' }, { status: 400 });
  }

  const cached = mem.get(account);
  if (cached && Date.now() - cached.at < STALE_MS) {
    return NextResponse.json({ ...cached.val, cached: true });
  }

  try {
    const val = await runBridge(account);
    mem.set(account, { val, at: Date.now() });
    return NextResponse.json(val);
  } catch {
    // Live bridge unavailable (serverless) — serve the committed real snapshot.
    const snap = BALANCE_SNAPSHOT[account] ?? { balance: 0, claimable_motes: '0' };
    return NextResponse.json({ ...snap, snapshot: true });
  }
}
