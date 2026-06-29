import type { ContractState } from './config';

// Real on-chain snapshot, read from the four Sawit Finance contracts on Casper
// Testnet via the `read_state` bridge (2026-06-30). Served by /api/state as a
// fallback when the live bridge binary isn't available (e.g. serverless deploys
// like Vercel, which can't run the native Rust reader). Values are genuine —
// they reflect live agent activity (Oracle recorded Jul-2026; Yield Router funded
// distribution epoch 3; Market Analyst tuned GORR — all on-chain).
export const STATE_SNAPSHOT: ContractState = {
  epoch_count: 2,
  oracle_reputation: 91,
  oracle_submission_count: 2,
  total_tons_cpo: 90000,
  latest_epoch_label: 'Jul-2026',
  latest_cpo_price_cents: 83000,
  latest_validation_score: 91,
  latest_tons_cpo: 44800,
  current_distribution_epoch: 3,
  latest_epoch_funded: true,
  latest_epoch_claim_deadline_ms: 1790549347003,
  total_distributed_cspr: '0',
  total_tokens_minted: '2260000',
  gorr_bps: 500,
  token_rate: 1000,
  total_sawit_supply: '2260000',
};
