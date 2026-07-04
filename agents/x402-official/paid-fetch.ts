/** Sawit Finance — one-shot paid fetch bridge: pays for a gated resource over the official x402 protocol and prints a single JSON result to stdout, so Python agents (oracle) can consume the official rails via subprocess — same bridge pattern as deploy/read_state. */
import { x402Client, x402HTTPClient, wrapFetchWithPayment } from "@x402/fetch";
import { createClientCasperSigner } from "@make-software/casper-x402";
import { ExactCasperScheme } from "@make-software/casper-x402/exact/client";
import casperSdk from "casper-js-sdk";

import { env } from "./env.js";

const { KeyAlgorithm } = casperSdk;

function emit(result: object, code: number): never {
  process.stdout.write(JSON.stringify(result) + "\n");
  process.exit(code);
}

async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url) emit({ ok: false, error: "usage: tsx paid-fetch.ts <url>" }, 1);

  const signer = await createClientCasperSigner(env.secretKeyPath, KeyAlgorithm.ED25519);
  const client = new x402Client().register("casper:*", new ExactCasperScheme(signer));
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  const response = await fetchWithPayment(url, { method: "GET" });
  if (!response.ok) {
    emit({ ok: false, error: `HTTP ${response.status}: ${await response.text()}` }, 1);
  }
  const data = await response.json();

  const settlement = new x402HTTPClient(client).getPaymentSettleResponse(name =>
    response.headers.get(name),
  );

  emit(
    {
      ok: true,
      data,
      settlement: settlement
        ? {
            success: settlement.success,
            transaction: (settlement as { transaction?: string }).transaction ?? null,
            network: settlement.network,
          }
        : null,
    },
    0,
  );
}

main().catch(error => {
  emit({ ok: false, error: error instanceof Error ? error.message : String(error) }, 1);
});
