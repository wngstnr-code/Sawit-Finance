'use client';

import { useCallback, useEffect, useState } from 'react';
import { useClickRef } from '@make-software/csprclick-ui';
import { CONTRACTS } from './config';

type FtOwnership = {
  balance?: string;
  contract_package_hash?: string;
};

/**
 * Reads the connected account's live SAWIT (CEP-18) balance through CSPR.click's
 * built-in CSPR.cloud proxy — no separate API key needed. Returns the on-chain
 * integer balance (SAWIT uses 0 display decimals, see config), or 0 if the
 * account holds none.
 */
export function useSawitBalance(publicKey?: string) {
  const clickRef = useClickRef();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clickRef || !publicKey) {
      setBalance(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const proxy = clickRef.getCsprCloudProxy?.();
      if (!proxy) throw new Error('CSPR.cloud proxy unavailable');
      const resp = await proxy.fetch(
        `/accounts/${publicKey}/ft-token-ownership?page_size=100`
      );
      if (resp.error) throw new Error(resp.error.message);
      const rows = (Array.isArray(resp.data) ? resp.data : []) as FtOwnership[];
      const row = rows.find(
        (r) =>
          (r.contract_package_hash || '').toLowerCase() ===
          CONTRACTS.sawitToken.toLowerCase()
      );
      setBalance(row ? Number(row.balance ?? 0) : 0);
    } catch (e) {
      setErr(String(e));
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, [clickRef, publicKey]);

  useEffect(() => {
    load();
  }, [load]);

  return { balance, loading, err, reload: load };
}
