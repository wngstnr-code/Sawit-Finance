'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAccount } from '@/lib/useAccount';
import { useChainState } from '@/lib/useChainState';
import { useSawitBalance, accountHashFromPublicKey } from '@/lib/useSawitBalance';
import { useFx } from '@/lib/useFx';
import { useFairValue } from '@/lib/useFairValue';
import { useCpoHistory } from '@/lib/useCpoHistory';
import { buildClaimTransaction } from '@/lib/claim';
import { buildBuyTransferTransaction } from '@/lib/buy';
import { humanError } from '@/lib/errors';
import { CSPR_DECIMALS, type ContractState } from '@/lib/config';
import { distributedCspr } from '@/lib/format';
import { useLocale } from '@/lib/i18n';
import { recordActivity } from '@/lib/activity';

export type Phase =
  | { phase: 'idle' }
  | { phase: 'working'; note: string }
  | { phase: 'done'; hash: string }
  | { phase: 'error'; message: string };

export type KycPhase =
  | { phase: 'idle' }
  | { phase: 'working' }
  | { phase: 'submitted' } // demo-kyc terkirim, menunggu flag on-chain (polling)
  | { phase: 'error'; message: string };

type InvestorValue = {
  // wallet (CSPR.click via useAccount)
  publicKey?: string;
  connected: boolean;
  ready: boolean;
  connect: () => void;
  disconnect: () => void;
  // data
  state: ContractState | null;
  balance: number | null;
  claimable: number | null;
  kycVerified: boolean;
  balLoading: boolean;
  reload: () => void;
  idr: number;
  fairValueUsd: number | null;
  cpoHistory: ReturnType<typeof useCpoHistory>;
  // derived
  supply: number;
  share: number;
  distributed: number;
  estYield: number;
  cpoValueM: number;
  revenueToHolders: number;
  projPerSawit: number;
  daysLeft: number | null;
  // actions
  claim: Phase;
  buy: Phase;
  kyc: KycPhase;
  handleClaim: () => Promise<void>;
  handleBuy: (csprAmount: number) => Promise<void>;
  handleVerifyKyc: () => Promise<void>;
};

const Ctx = createContext<InvestorValue | null>(null);

function useDerived(
  state: ContractState | null,
  balance: number | null,
  claimable: number | null
) {
  return useMemo(() => {
    const supply = state ? Number(state.total_sawit_supply) : 0;
    const share = balance && supply ? balance / supply : 0;
    const distributed = distributedCspr(state, CSPR_DECIMALS);
    const estYield = claimable && claimable > 0 ? claimable : share * distributed;
    const cpoValueM = state
      ? (state.total_tons_cpo * state.latest_cpo_price_cents) / 100 / 1_000_000
      : 0;
    const revenueToHolders = state
      ? cpoValueM * 1_000_000 * (state.gorr_bps / 10000)
      : 0;
    const projPerSawit = supply ? revenueToHolders / supply : 0;
    const daysLeft = state?.latest_epoch_claim_deadline_ms
      ? Math.max(0, Math.ceil((state.latest_epoch_claim_deadline_ms - Date.now()) / 86_400_000))
      : null;
    return { supply, share, distributed, estYield, cpoValueM, revenueToHolders, projPerSawit, daysLeft };
  }, [state, balance, claimable]);
}

export function InvestorProvider({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const tx = t.app.tx;
  const { clickRef, publicKey, connected, ready, connect, disconnect } = useAccount();
  const state = useChainState();
  const { balance, claimable, kycVerified, loading: balLoading, reload } = useSawitBalance(publicKey);
  const idr = useFx();
  const fairValueUsd = useFairValue();
  const cpoHistory = useCpoHistory();
  const derived = useDerived(state, balance, claimable);

  const [claim, setClaim] = useState<Phase>({ phase: 'idle' });
  const [buy, setBuy] = useState<Phase>({ phase: 'idle' });
  const [kyc, setKyc] = useState<KycPhase>({ phase: 'idle' });

  const handleVerifyKyc = useCallback(async () => {
    if (!publicKey) return;
    try {
      setKyc({ phase: 'working' });
      const accountHash = accountHashFromPublicKey(publicKey);
      const r = await fetch('/api/demo-kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: accountHash }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'KYC verification failed');
      setKyc({ phase: 'submitted' });
      recordActivity(publicKey, { type: 'kyc', at: Date.now() });
      // refresh now, then poll a few times while the on-chain tx lands (demo takes ~1min).
      reload();
      setTimeout(reload, 10_000);
      setTimeout(reload, 20_000);
      setTimeout(reload, 30_000);
    } catch (e) {
      setKyc({ phase: 'error', message: humanError(e) });
    }
  }, [publicKey, reload]);

  const handleClaim = useCallback(async () => {
    if (!clickRef || !publicKey || !state) return;
    try {
      setClaim({ phase: 'working', note: tx.sign });
      const tsx = buildClaimTransaction(publicKey, state.current_distribution_epoch);
      const json = tsx.toJSON();
      console.log('[claim] epoch', state.current_distribution_epoch, 'tx.toJSON →', json);
      const res = await clickRef.send(json as unknown as object, publicKey);
      console.log('[claim] send() result →', res);
      const r = res as { transactionHash?: string; deployHash?: string } | undefined;
      const hash = r?.transactionHash || r?.deployHash;
      if (hash) {
        setClaim({ phase: 'done', hash });
        recordActivity(publicKey, { type: 'claim', hash, at: Date.now() });
        setTimeout(reload, 4000);
      } else {
        const detail = res
          ? JSON.stringify(res).slice(0, 240)
          : 'send() returned undefined (no response from wallet/proxy)';
        setClaim({ phase: 'error', message: `Not submitted — ${detail}` });
      }
    } catch (e) {
      console.error('[claim] send() threw →', e);
      setClaim({ phase: 'error', message: humanError(e) });
    }
  }, [clickRef, publicKey, state, reload, tx]);

  const handleBuy = useCallback(
    async (csprAmount: number) => {
      if (!clickRef || !publicKey) return;
      try {
        setBuy({ phase: 'working', note: tx.sign });
        const tsx = buildBuyTransferTransaction(publicKey, csprAmount);
        const json = tsx.toJSON();
        console.log('[buy] amount', csprAmount, 'tx.toJSON →', json);
        const res = await clickRef.send(json as unknown as object, publicKey);
        console.log('[buy] send() result →', res);
        const r = res as { transactionHash?: string; deployHash?: string } | undefined;
        const hash = r?.transactionHash || r?.deployHash;
        if (hash) {
          setBuy({ phase: 'done', hash });
          recordActivity(publicKey, { type: 'buy', hash, at: Date.now() });
          setTimeout(reload, 15_000);
          setTimeout(reload, 45_000);
          setTimeout(reload, 90_000);
        } else {
          const detail = res
            ? JSON.stringify(res).slice(0, 240)
            : 'send() returned undefined (no response from wallet/proxy)';
          setBuy({ phase: 'error', message: `Not submitted — ${detail}` });
        }
      } catch (e) {
        console.error('[buy] send() threw →', e);
        setBuy({ phase: 'error', message: humanError(e) });
      }
    },
    [clickRef, publicKey, reload, tx]
  );

  const value: InvestorValue = {
    publicKey,
    connected,
    ready,
    connect,
    disconnect,
    state,
    balance,
    claimable,
    kycVerified,
    balLoading,
    reload,
    idr,
    fairValueUsd,
    cpoHistory,
    ...derived,
    claim,
    buy,
    kyc,
    handleClaim,
    handleBuy,
    handleVerifyKyc,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInvestor(): InvestorValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useInvestor must be used within <InvestorProvider>');
  return v;
}
