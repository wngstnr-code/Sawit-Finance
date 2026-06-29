import type { ContractState } from './config';

// Real on-chain snapshot, read from the four Sawit Finance contracts on Casper
// Testnet via the `read_state` bridge (2026-06-29). Served by /api/state as a
// fallback when the live bridge binary isn't available (e.g. serverless deploys
// like Vercel, which can't run the native Rust reader). Values are genuine —
// they reflect the executed economic loop (epoch 1, 2,260,000 SAWIT, etc.).
export const STATE_SNAPSHOT: ContractState = {
  epoch_count: 1,
  oracle_reputation: 92,
  oracle_submission_count: 1,
  total_tons_cpo: 45200,
  latest_epoch_label: 'Jun-2026',
  latest_cpo_price_cents: 82500,
  latest_validation_score: 92,
  latest_tons_cpo: 45200,
  current_distribution_epoch: 1,
  latest_epoch_funded: true,
  latest_epoch_claim_deadline_ms: 1790356176274,
  total_distributed_cspr: '0',
  total_tokens_minted: '2260000',
  gorr_bps: 500,
  token_rate: 1000,
  total_sawit_supply: '2260000',
};
