import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { readAccountState } from '@/lib/casperState';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

type Bal = { balance: number; claimable_motes: string; kyc_verified: boolean };

const BALANCE_SNAPSHOT: Record<string, Bal> = {
  e8134d5d5caf9ace626209d09365af48a867a18199b5139da8873733c6c14efe: {
    balance: 100,
    claimable_motes: '25000000000',
    kyc_verified: false,
  },
  '57895ec9532fba625e63d3f7a5e250b50f9c5e0fb5321f8fa5890dd05d4ae2ec': {
    balance: 2_259_900,
    claimable_motes: '0',
    kyc_verified: false,
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
    execFile(bin, { env, timeout: 170_000, maxBuffer: 1 << 20 }, (err, stdout) => {
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
          kyc_verified: Boolean(j.kyc_verified ?? false),
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const account = (url.searchParams.get('account') || '')
    .toLowerCase()
    .replace(/^account-hash-/, '');
  if (!/^[0-9a-f]{64}$/.test(account)) {
    return NextResponse.json({ error: 'invalid account' }, { status: 400 });
  }

  // fresh=1 bypasses the memory cache — used right after a KYC/claim/buy
  // transaction lands so the UI reflects the new on-chain state immediately.
  const fresh = url.searchParams.get('fresh') === '1';
  const cached = mem.get(account);
  if (!fresh && cached && Date.now() - cached.at < STALE_MS) {
    return NextResponse.json({ ...cached.val, cached: true });
  }

  try {
    // Pure-RPC reader first (serverless-safe, seconds); Rust bridge fallback.
    let val: Bal;
    try {
      val = await readAccountState(account);
    } catch {
      val = await runBridge(account);
    }
    mem.set(account, { val, at: Date.now() });
    return NextResponse.json(val);
  } catch {
    const snap = BALANCE_SNAPSHOT[account] ?? {
      balance: 0,
      claimable_motes: '0',
      kyc_verified: false,
    };
    return NextResponse.json({ ...snap, snapshot: true });
  }
}
