'use client';

import { useCallback, useEffect, useState } from 'react';
import { PublicKey } from 'casper-js-sdk';

export function accountHashFromPublicKey(publicKey: string): string {
  return PublicKey.fromHex(publicKey)
    .accountHash()
    .toHex()
    .replace(/^account-hash-/, '');
}

export function useSawitBalance(publicKey?: string) {
  const [balance, setBalance] = useState<number | null>(null);

  const [claimable, setClaimable] = useState<number | null>(null);
  const [kycVerified, setKycVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!publicKey) {
      setBalance(null);
      setClaimable(null);
      setKycVerified(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const accountHash = accountHashFromPublicKey(publicKey);
      const r = await fetch(`/api/balance?account=${accountHash}`, {
        cache: 'no-store',
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'balance read failed');
      setBalance(Number(j.balance ?? 0));
      setClaimable(Number(j.claimable_motes ?? 0) / 1e9);
      setKycVerified(Boolean(j.kyc_verified ?? false));
    } catch (e) {
      setErr(String(e));
      setBalance(null);
      setClaimable(null);
      setKycVerified(false);
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    load();
  }, [load]);

  return { balance, claimable, kycVerified, loading, err, reload: load };
}
