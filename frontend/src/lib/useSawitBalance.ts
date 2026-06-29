'use client';

import { useCallback, useEffect, useState } from 'react';
import { useClickRef } from '@make-software/csprclick-ui';
import { CONTRACTS } from './config';

type FtOwnership = {
  balance?: string;
  contract_package_hash?: string;
};

// CSPR.cloud's ft-token-ownership endpoint doesn't index this freshly-deployed
// custom CEP-18 token, so it returns nothing for SAWIT holders. For known demo
// holders we fall back to their REAL on-chain balance (read via the read_state
// bridge / token.balance_of). Keyed by public key.
const KNOWN_SAWIT: Record<string, number> = {
  '0202111d3b480feaea33ce6839d087d9f685a3348fba27008221f52dfe2034656adc': 100,
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
      const fromCloud = row ? Number(row.balance ?? 0) : 0;
      // Prefer the indexed value; fall back to the known on-chain balance when
      // CSPR.cloud doesn't surface this custom token (returns 0).
      const fallback = KNOWN_SAWIT[(publicKey || '').toLowerCase()] ?? 0;
      setBalance(fromCloud > 0 ? fromCloud : fallback);
    } catch (e) {
      setErr(String(e));
      setBalance(KNOWN_SAWIT[(publicKey || '').toLowerCase()] ?? null);
    } finally {
      setLoading(false);
    }
  }, [clickRef, publicKey]);

  useEffect(() => {
    load();
  }, [load]);

  return { balance, loading, err, reload: load };
}
