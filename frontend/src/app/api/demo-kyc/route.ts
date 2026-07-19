import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const inProgress = new Map<string, boolean>();

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

type KycResult = { verified: boolean; already: boolean };

function runBridge(accountHashHex: string): Promise<KycResult> {
  const bin = path.resolve(
    process.cwd(),
    process.env.KYC_BIN || '../target/release/kyc'
  );
  const envFile = path.resolve(
    process.cwd(),
    process.env.LIVENET_ENV_FILE || '../.env'
  );
  if (!existsSync(bin)) return Promise.reject(new Error('kyc binary not found'));
  const env = {
    ...process.env,
    ...loadEnvFile(envFile),
    KYC_ACCOUNT: accountHashHex,
  };
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      { env, timeout: 120_000, maxBuffer: 1 << 20 },
      (err, stdout, stderr) => {
        const combined = `${stdout}\n${stderr}`;
        const okLine = combined.split('\n').find((l) => l.startsWith('KYC_OK '));
        if (okLine) {
          try {
            const j = JSON.parse(okLine.slice('KYC_OK '.length));
            return resolve({
              verified: Boolean(j.verified),
              already: Boolean(j.already),
            });
          } catch (e) {
            return reject(e);
          }
        }
        const errLine = combined.split('\n').find((l) => l.startsWith('KYC_ERR '));
        if (errLine) {
          try {
            const j = JSON.parse(errLine.slice('KYC_ERR '.length));
            return reject(new Error(String(j.reason ?? 'kyc failed')));
          } catch {
            return reject(new Error('kyc failed'));
          }
        }
        if (err) return reject(err);
        reject(new Error('no KYC_OK or KYC_ERR in output'));
      }
    );
  });
}

export async function POST(req: Request) {
  let body: { account?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 });
  }

  const account = (body.account || '')
    .toLowerCase()
    .replace(/^account-hash-/, '');

  if (!/^[0-9a-f]{64}$/i.test(account)) {
    return NextResponse.json({ ok: false, error: 'invalid account' }, { status: 400 });
  }

  if (inProgress.get(account)) {
    return NextResponse.json({ ok: false, error: 'in_progress' }, { status: 429 });
  }

  inProgress.set(account, true);
  try {
    const result = await runBridge(account);
    return NextResponse.json({ ok: true, verified: result.verified, already: result.already });
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'kyc failed';
    return NextResponse.json({ ok: false, error: reason }, { status: 500 });
  } finally {
    inProgress.delete(account);
  }
}
