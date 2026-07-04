import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, ".env") });
config({ path: join(here, "..", "..", ".env") });

function required(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`missing required env var ${key}`);
    process.exit(1);
  }
  return v;
}

export const env = {
  network: process.env.X402_NETWORK || "casper:casper-test",
  rpcUrl: process.env.X402_RPC_URL || "https://node.testnet.casper.network/rpc",
  facilitatorUrl: process.env.FACILITATOR_URL || "http://localhost:4022",
  facilitatorApiKey: process.env.FACILITATOR_API_KEY || "",
  facilitatorPort: parseInt(process.env.FACILITATOR_PORT || "4022", 10),
  serverPort: parseInt(process.env.SERVER_PORT || "4021", 10),
  payeeAddress: process.env.PAYEE_ADDRESS || "00e8134d5d5caf9ace626209d09365af48a867a18199b5139da8873733c6c14efe",
  assetPackage: (process.env.ASSET_PACKAGE || "ace00b4d5e5e1fb52be4260e0aba9cbf2595992eb599519d6b596b9ff0ea1f2b").replace(/^hash-/, ""),
  assetName: process.env.ASSET_NAME || "SAWIT X402 Token",
  assetSymbol: process.env.ASSET_SYMBOL || "SAWITX",
  priceUnits: process.env.X402_PRICE_UNITS || "1000000000",
  get secretKeyPath(): string {
    return process.env.X402_SECRET_KEY_PATH || required("ODRA_CASPER_LIVENET_SECRET_KEY_PATH");
  },
};

export const EXPLORER = "https://testnet.cspr.live";
