'use client';

import { useChainState } from './useChainState';
import { useCpoHistory } from './useCpoHistory';
import type { ContractState } from './config';

/** fairValueUsd = cpoUsdPerTon * 10_000 / (token_rate * gorr_bps) */
function computeFairValueUsd(
  state: ContractState | null,
  cpoUsdPerTon: number | null | undefined
): number | null {
  if (!state || !cpoUsdPerTon || !state.token_rate || !state.gorr_bps) return null;
  const denom = state.token_rate * state.gorr_bps;
  if (!denom) return null;
  return (cpoUsdPerTon * 10_000) / denom;
}

// Fair value per SAWIT, derived on-chain from the live CPO price feed and the
// current mint/royalty parameters (same formula used across the dashboard).
export function useFairValue(): number | null {
  const state = useChainState();
  const hist = useCpoHistory();
  return computeFairValueUsd(state, hist?.latest);
}
