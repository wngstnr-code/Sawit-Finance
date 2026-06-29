'use client';

import { useCallback, useEffect, useState } from 'react';
import { PublicKey } from 'casper-js-sdk';

/**
 * Reads the connected account's live SAWIT (CEP-18) balance from the chain via
 * the `/api/balance` route (backed by the `read_balance` Odra bridge). CSPR.cloud
 * can't surface Odra's internal token state, so we read it directly. Returns the
 * on-chain integer balance (SAWIT uses 0 display decimals), or 0 if none.
 */
export function useSawitBalance(publicKey?: string) {
  const [balance, setBalance] = useState<number | null>(null);
  // per-account claimable CSPR for the current epoch (whole CSPR), or null
  const [claimable, setClaimable] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!publicKey) {
      setBalance(null);
      setClaimable(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const accountHash = PublicKey.fromHex(publicKey)
        .accountHash()
        .toHex()
        .replace(/^account-hash-/, '');
      const r = await fetch(`/api/balance?account=${accountHash}`, {
        cache: 'no-store',
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'balance read failed');
      setBalance(Number(j.balance ?? 0));
      setClaimable(Number(j.claimable_motes ?? 0) / 1e9);
    } catch (e) {
      setErr(String(e));
      setBalance(null);
      setClaimable(null);
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    load();
  }, [load]);

  return { balance, claimable, loading, err, reload: load };
}
