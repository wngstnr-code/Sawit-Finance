
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

export const ACCESS_EMAIL =
  process.env.NEXT_PUBLIC_ACCESS_EMAIL || 'wangsitsada1234@gmail.com';

export const CSPR_CLICK_APP_ID =
  process.env.NEXT_PUBLIC_CSPR_CLICK_APP_ID || 'csprclick-template';

export const SAWIT_DECIMALS = 0;
export const CSPR_DECIMALS = 9;

export const TREASURY = {
  publicKey: '016410a22de86e0de234120f29272d5b1096caa60b3cf8a3b396d49e5399ad5428',
  accountHash: 'e8134d5d5caf9ace626209d09365af48a867a18199b5139da8873733c6c14efe',
} as const;

export const SALE = {
  priceCspr: 10, // 1 SAWIT = 10 CSPR
  buyMemoId: 5417, // transfer id penanda pembelian
  minCspr: 10, // minimal beli = 1 SAWIT
} as const;

export type EpochInfo = {
  epoch_number: number;
  tons_cpo: number;
  revenue_usd: number;
  epoch_timestamp: number;
  tokens_minted: string | null;
  funded: boolean;
  total_distribution_cspr: string;
  total_claimed_cspr: string;
  claim_deadline_ms: number;
};

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
  epochs?: EpochInfo[];
};
