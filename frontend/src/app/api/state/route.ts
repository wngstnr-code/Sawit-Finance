import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { STATE_SNAPSHOT } from '@/lib/stateSnapshot';
import { readChainState } from '@/lib/casperState';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const CACHE = path.resolve(process.cwd(), '.state-cache.json');
const STALE_MS = 60_000;

type Cache = { state: Record<string, unknown>; at: number };
let mem: Cache | null = null;

function loadCache(): Cache | null {
  if (mem) return mem;
  if (existsSync(CACHE)) {
    try {
      mem = JSON.parse(readFileSync(CACHE, 'utf8'));
      return mem;
    } catch {
    }
  }
  return null;
}

function saveCache(state: Record<string, unknown>) {
  mem = { state, at: Date.now() };
  try {
    writeFileSync(CACHE, JSON.stringify(mem));
  } catch {
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

function runBridge(): Promise<Record<string, unknown>> {
  const bin = path.resolve(
    process.cwd(),
    process.env.READ_STATE_BIN || '../target/release/read_state'
  );
  const envFile = path.resolve(
    process.cwd(),
    process.env.LIVENET_ENV_FILE || '../.env'
  );
  if (!existsSync(bin)) return Promise.reject(new Error('read_state binary not found'));
  const env = { ...process.env, ...loadEnvFile(envFile) };
  return new Promise((resolve, reject) => {
    execFile(bin, { env, timeout: 170_000, maxBuffer: 1 << 20 }, (err, stdout) => {
      if (err) return reject(err);
      const line = stdout.split('\n').find((l) => l.startsWith('SAWIT_STATE_JSON '));
      if (!line) return reject(new Error('no SAWIT_STATE_JSON'));
      try {
        const parsed = JSON.parse(line.slice('SAWIT_STATE_JSON '.length));
        resolve({ ...parsed, epochs: parsed.epochs ?? [] });
      } catch (e) {
        reject(e);
      }
    });
  });
}

// Primary reader: pure JSON-RPC against the public node (lib/casperState.ts)
// — serverless-safe and takes seconds, so production serves LIVE chain state.
// The Rust bridge stays as a cross-check fallback for local dev; the static
// snapshot is the last resort only.
async function readLive(): Promise<Record<string, unknown>> {
  try {
    return (await readChainState()) as unknown as Record<string, unknown>;
  } catch {
    return runBridge();
  }
}

let refreshing = false;
function refreshInBackground() {
  if (refreshing) return;
  refreshing = true;
  readLive()
    .then((s) => saveCache(s))
    .catch(() => {})
    .finally(() => {
      refreshing = false;
    });
}

export async function GET() {
  const cached = loadCache();

  if (cached) {
    if (Date.now() - cached.at > STALE_MS) refreshInBackground();
    return NextResponse.json({
      state: { ...cached.state, epochs: cached.state.epochs ?? [] },
      readAt: cached.at,
      cached: true,
    });
  }

  try {
    const state = await readLive();
    saveCache(state);
    return NextResponse.json({ state, readAt: Date.now() });
  } catch {
    return NextResponse.json({ state: STATE_SNAPSHOT, snapshot: true });
  }
}
