import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { STATE_SNAPSHOT } from '@/lib/stateSnapshot';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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
      /* ignore */
    }
  }
  return null;
}

function saveCache(state: Record<string, unknown>) {
  mem = { state, at: Date.now() };
  try {
    writeFileSync(CACHE, JSON.stringify(mem));
  } catch {
    /* ignore */
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
    execFile(bin, { env, timeout: 110_000, maxBuffer: 1 << 20 }, (err, stdout) => {
      if (err) return reject(err);
      const line = stdout.split('\n').find((l) => l.startsWith('SAWIT_STATE_JSON '));
      if (!line) return reject(new Error('no SAWIT_STATE_JSON'));
      try {
        resolve(JSON.parse(line.slice('SAWIT_STATE_JSON '.length)));
      } catch (e) {
        reject(e);
      }
    });
  });
}

let refreshing = false;
function refreshInBackground() {
  if (refreshing) return;
  refreshing = true;
  runBridge()
    .then((s) => saveCache(s))
    .catch(() => {})
    .finally(() => {
      refreshing = false;
    });
}

export async function GET() {
  const cached = loadCache();

  // Serve cached instantly; refresh in the background if stale.
  if (cached) {
    if (Date.now() - cached.at > STALE_MS) refreshInBackground();
    return NextResponse.json({
      state: cached.state,
      readAt: cached.at,
      cached: true,
    });
  }

  // No cache yet — do the (slow) first live read.
  try {
    const state = await runBridge();
    saveCache(state);
    return NextResponse.json({ state, readAt: Date.now() });
  } catch {
    // Live bridge unavailable (e.g. serverless/Vercel can't run the native
    // read_state binary) — serve the committed real on-chain snapshot so the
    // genuine numbers still render instead of failing.
    return NextResponse.json({ state: STATE_SNAPSHOT, snapshot: true });
  }
}
