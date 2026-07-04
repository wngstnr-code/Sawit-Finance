/** Sawit Finance — x402-gated CPO data server (official protocol): gates the live FRED palm-oil price behind @x402/express paymentMiddleware; payments are verified and settled by an x402 facilitator (local or hosted CSPR.cloud) in SAWITX, the project's CEP-18 x402 token. */
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactCasperScheme } from "@make-software/casper-x402/exact/server";
import { HTTPFacilitatorClient, type FacilitatorConfig } from "@x402/core/server";
import type { AssetAmount, Network } from "@x402/core/types";

import { env } from "./env.js";

const FRED_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=PPOILUSDM";
const FEED_LABEL = "FRED PPOILUSDM (IMF Global price of Palm Oil, USD/ton)";

async function fetchPalmOilPrice(): Promise<{ cents: number; date: string } | null> {
  try {
    const resp = await fetch(FRED_CSV_URL, { signal: AbortSignal.timeout(20_000) });
    if (!resp.ok) return null;
    const text = await resp.text();
    let latest: { cents: number; date: string } | null = null;
    for (const line of text.split("\n").slice(1)) {
      const [date, raw] = line.split(",");
      const val = parseFloat((raw || "").trim());
      if (date && !Number.isNaN(val)) latest = { cents: Math.round(val * 100), date };
    }
    return latest;
  } catch {
    return null;
  }
}

const chainID = env.network as Network;

const facilitatorConfig: FacilitatorConfig = { url: env.facilitatorUrl };
if (env.facilitatorApiKey) {
  const auth = { Authorization: env.facilitatorApiKey };
  facilitatorConfig.createAuthHeaders = async () => ({
    verify: auth,
    settle: auth,
    supported: auth,
    bazaar: auth,
  });
}
const facilitatorClient = new HTTPFacilitatorClient(facilitatorConfig);

const assetAmount: AssetAmount = {
  asset: env.assetPackage,
  amount: env.priceUnits,
  extra: { name: env.assetName, symbol: env.assetSymbol, version: "1", decimals: "9" },
};

const casperScheme = new ExactCasperScheme()
  .registerAsset(chainID, env.assetPackage, 9)
  .registerMoneyParser(() => Promise.resolve(assetAmount));

const app = express();

app.use(
  paymentMiddleware(
    {
      "GET /api/kpbn/price": {
        accepts: [{ scheme: "exact", price: "$0.001", network: chainID, payTo: env.payeeAddress }],
        description: "KPBN daily CPO tender price (live FRED/IMF feed)",
        mimeType: "application/json",
      },
      "GET /api/mpob/benchmark": {
        accepts: [{ scheme: "exact", price: "$0.001", network: chainID, payTo: env.payeeAddress }],
        description: "MPOB SEA regional benchmark (live FRED/IMF feed)",
        mimeType: "application/json",
      },
    },
    new x402ResourceServer(facilitatorClient).register(chainID, casperScheme),
  ),
);

app.get("/api/kpbn/price", async (_req, res) => {
  const data: Record<string, unknown> = {
    source: "KPBN",
    instrument: "CPO daily tender",
    currency: "USD",
    settlement: "x402 official protocol (CEP-18 transfer_with_authorization)",
  };
  const feed = await fetchPalmOilPrice();
  if (feed) {
    data.price_cents_per_ton = feed.cents;
    data.price_usd_per_ton = Math.round(feed.cents) / 100;
    data.price_feed = FEED_LABEL;
    data.observation_date = feed.date;
    data.live = true;
  } else {
    data.price_usd_per_ton = 818.0;
    data.price_cents_per_ton = 81_800;
    data.live = false;
  }
  res.json(data);
});

app.get("/api/mpob/benchmark", async (_req, res) => {
  const data: Record<string, unknown> = {
    source: "MPOB",
    instrument: "SEA regional benchmark",
    production_tons: 44_800,
    settlement: "x402 official protocol (CEP-18 transfer_with_authorization)",
  };
  const feed = await fetchPalmOilPrice();
  if (feed) {
    data.price_cents_per_ton = feed.cents;
    data.price_usd_per_ton = Math.round(feed.cents) / 100;
    data.price_feed = FEED_LABEL;
    data.observation_date = feed.date;
    data.live = true;
  } else {
    data.price_usd_per_ton = 832.0;
    data.price_cents_per_ton = 83_200;
    data.live = false;
  }
  res.json(data);
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(env.serverPort, () => {
  console.log(`x402-gated CPO data server on http://localhost:${env.serverPort}`);
  console.log(`price: ${Number(env.priceUnits) / 1e9} ${env.assetSymbol} per request → payee ${env.payeeAddress}`);
  console.log(`facilitator: ${env.facilitatorUrl}${env.facilitatorApiKey ? " (authorized)" : ""}`);
});
