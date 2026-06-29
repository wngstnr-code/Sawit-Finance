// Sawit Finance — deployed Casper Testnet contracts (ContractPackageHash) + network.
// These are public; safe to expose to the browser.

export const NETWORK = {
  name: 'casper-test',
  nodeRpc: 'https://node.testnet.casper.network/rpc',
  explorer: 'https://testnet.cspr.live',
};

export const CONTRACTS = {
  sawitToken: '579f3197493048529a56ea3887721c4bd027e3fad6755644f19446b4c9205a47',
  productionVault: '0b860c574e7b7cd6969a33dd57992fc6efedd503473b44e1c9309f1c8455e365',
  tokenMinter: 'cb3b96b8cdb987178db0353ef6a713a7d888a4256f59702243187982358d8e06',
  yieldDistributor: '1a04935782cbd60b7a4cfddea6ab18a6efd0348b862171c6a4fe25c111ccf1e9',
} as const;

// Investor onboarding contact. SAWIT is a permissioned RWA — access is via the
// licensed operator (KYC), not an open swap. Replace with the real inbox before
// launch. Override with NEXT_PUBLIC_ACCESS_EMAIL.
export const ACCESS_EMAIL =
  process.env.NEXT_PUBLIC_ACCESS_EMAIL || 'wangsitsada1234@gmail.com';

// CSPR.click app id — 'csprclick-template' works for local dev; register a real
// one before deploying to a server.
export const CSPR_CLICK_APP_ID =
  process.env.NEXT_PUBLIC_CSPR_CLICK_APP_ID || 'csprclick-template';

// NOTE: SawitToken metadata decimals = 9, but TokenMinter's mint formula
// (tons × rate × gorr_bps / 10_000) does NOT scale by 10^9, so the on-chain
// integer is the protocol's whole-token accounting unit (matches the mint output
// and README tokenomics). We display it as-is (decimals 0). Proper fix: scale the
// mint by 10^decimals in the contract + redeploy. CSPR is genuine motes (9).
export const SAWIT_DECIMALS = 0;
export const CSPR_DECIMALS = 9;

export type ContractState = {
  epoch_count: number;
  oracle_reputation: number;
  oracle_submission_count: number;
  total_tons_cpo: number;
  latest_epoch_label: string;
  latest_cpo_price_cents: number;
  latest_validation_score: number;
  latest_tons_cpo: number;
  current_distribution_epoch: number;
  latest_epoch_funded: boolean;
  latest_epoch_claim_deadline_ms: number;
  total_distributed_cspr: string;
  total_tokens_minted: string;
  gorr_bps: number;
  token_rate: number;
  total_sawit_supply: string;
};
