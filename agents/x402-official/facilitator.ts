/** Sawit Finance — official-protocol x402 facilitator: verifies EIP-712 payment payloads and settles them on Casper Testnet via the CEP-18 transfer_with_authorization entry point, using MAKE's @make-software/casper-x402 mechanism (same protocol as the hosted x402-facilitator.cspr.cloud). */
import { x402Facilitator } from "@x402/core/facilitator";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { ExactCasperScheme } from "@make-software/casper-x402/exact/facilitator";
import { toFacilitatorCasperSigner } from "@make-software/casper-x402";
import casperSdk from "casper-js-sdk";
import express from "express";
import rateLimit from "express-rate-limit";
import { readFileSync } from "node:fs";

import { env } from "./env.js";

const { KeyAlgorithm, PrivateKey } = casperSdk;

const pem = readFileSync(env.secretKeyPath, "utf-8");
const privateKey = PrivateKey.fromPem(pem, KeyAlgorithm.ED25519);
const signer = await toFacilitatorCasperSigner(privateKey, env.rpcUrl);

const facilitator = new x402Facilitator().register(
  env.network,
  new ExactCasperScheme(signer, { limitedPaymentMotes: 7_000_000_000 }),
);

const app = express();
app.use(express.json());
// Settlement submits on-chain deploys; cap request rate so a client can't spam the signer.
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.post("/verify", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body as {
      paymentPayload: PaymentPayload;
      paymentRequirements: PaymentRequirements;
    };
    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({ error: "Missing paymentPayload or paymentRequirements" });
    }
    const response: VerifyResponse = await facilitator.verify(paymentPayload, paymentRequirements);
    console.log(`verify → isValid=${response.isValid}${response.isValid ? "" : ` (${response.invalidReason})`}`);
    res.json(response);
  } catch (error) {
    console.error("verify error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/settle", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body as {
      paymentPayload: PaymentPayload;
      paymentRequirements: PaymentRequirements;
    };
    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({ error: "Missing paymentPayload or paymentRequirements" });
    }
    const response: SettleResponse = await facilitator.settle(paymentPayload, paymentRequirements);
    console.log(
      `settle → success=${response.success} tx=${response.transaction}` +
        (response.success ? "" : ` (${response.errorReason ?? "no errorReason"})`),
    );
    res.json(response);
  } catch (error) {
    console.error("settle error:", error);
    if (error instanceof Error && error.message.includes("Settlement aborted:")) {
      return res.json({
        success: false,
        errorReason: error.message.replace("Settlement aborted: ", ""),
        network: req.body?.paymentPayload?.network || "unknown",
      } as SettleResponse);
    }
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.get("/supported", (_req, res) => {
  res.json(facilitator.getSupported());
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(env.facilitatorPort, () => {
  console.log(`x402 facilitator (official protocol) on http://localhost:${env.facilitatorPort}`);
  console.log(`network ${env.network}, gas payer ${privateKey.publicKey.toHex()}`);
});
