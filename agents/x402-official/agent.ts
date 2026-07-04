/** Sawit Finance — autonomous paying agent (official x402 protocol): hits the gated CPO endpoint, receives 402 + PaymentRequirements, signs an EIP-712 transfer authorization for SAWITX, and retries with PAYMENT-SIGNATURE; settlement lands on Casper Testnet via the facilitator. */
import { x402Client, x402HTTPClient, wrapFetchWithPayment } from "@x402/fetch";
import { createClientCasperSigner } from "@make-software/casper-x402";
import { ExactCasperScheme } from "@make-software/casper-x402/exact/client";
import casperSdk from "casper-js-sdk";

import { env, EXPLORER } from "./env.js";

const { KeyAlgorithm } = casperSdk;

const url = `http://localhost:${env.serverPort}/api/kpbn/price`;

async function main(): Promise<void> {
  console.log("SAWIT.FI agent — paid CPO data fetch via official x402 protocol");
  console.log("=".repeat(64));

  const signer = await createClientCasperSigner(env.secretKeyPath, KeyAlgorithm.ED25519);
  console.log(`payer  : ${signer.publicKey()} (account ${signer.accountAddress().slice(0, 18)}…)`);
  console.log(`asset  : ${env.assetSymbol} (CEP-18 ${env.assetPackage.slice(0, 16)}…)`);
  console.log(`target : ${url}\n`);

  const client = new x402Client().register("casper:*", new ExactCasperScheme(signer));
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  const t0 = Date.now();
  const response = await fetchWithPayment(url, { method: "GET" });
  const body = await response.json();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`[1] 402 challenge received, EIP-712 authorization signed, request retried`);
  console.log(`[2] response ${response.status} in ${elapsed}s\n`);
  console.log("CPO data:", JSON.stringify(body, null, 2));

  const settlement = new x402HTTPClient(client).getPaymentSettleResponse(name =>
    response.headers.get(name),
  );
  if (settlement?.success) {
    console.log(`\n[3] settled on-chain (${settlement.network})`);
    console.log(`    tx       : ${settlement.transaction}`);
    console.log(`    explorer : ${EXPLORER}/deploy/${settlement.transaction}`);
  } else if (settlement) {
    console.log(`\n[3] settlement failed: ${JSON.stringify(settlement)}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});
