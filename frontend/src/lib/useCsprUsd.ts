'use client';

import { useEffect, useState } from 'react';

// Live CSPR→USD spot price via CoinGecko's public API (no key, CORS-open).
// Display-only — used to mark liquid CSPR and claimable yield in USD, the same
// number the Casper Wallet shows. Falls back to a representative rate.
const FALLBACK_CSPR_USD = 0.00186;

let cache: number | null = null;

export function useCsprUsd() {
  const [usd, setUsd] = useState<number>(cache ?? FALLBACK_CSPR_USD);
  useEffect(() => {
    if (cache) return;
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=casper-network&vs_currencies=usd', {
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((j) => {
        const rate = j?.['casper-network']?.usd;
        if (typeof rate === 'number' && rate > 0) {
          cache = rate;
          setUsd(rate);
        }
      })
      .catch(() => {});
  }, []);
  return usd;
}
