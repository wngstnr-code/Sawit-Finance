import type { ContractState } from './config';

export type EpochEntry = {
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

export type ContractStateWithEpochs = ContractState & { epochs: EpochEntry[] };

export const STATE_SNAPSHOT: ContractStateWithEpochs = {
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
  // Mirror of live testnet state read via the read_state bridge on 2026-07-19.
  epochs: [
    {
      // Distribution-only re-fund epoch — no production record on the vault.
      epoch_number: 3,
      tons_cpo: 0,
      revenue_usd: 0,
      epoch_timestamp: 0,
      tokens_minted: null,
      funded: true,
      total_distribution_cspr: '30000000000',
      total_claimed_cspr: '25000000000',
      claim_deadline_ms: 1790549347003,
    },
    {
      epoch_number: 2,
      tons_cpo: 44800,
      revenue_usd: 37184000,
      epoch_timestamp: 1782773165,
      tokens_minted: null,
      funded: true,
      total_distribution_cspr: '30000000000',
      total_claimed_cspr: '0',
      claim_deadline_ms: 1790508192003,
    },
    {
      epoch_number: 1,
      tons_cpo: 45200,
      revenue_usd: 37290000,
      epoch_timestamp: 1782578742,
      tokens_minted: '2260000',
      funded: true,
      total_distribution_cspr: '100000000000',
      total_claimed_cspr: '125000000000',
      claim_deadline_ms: 1790356176274,
    },
  ],
};
