'use client';

import { useEffect, useState } from 'react';

// USD→IDR display rate via a public FX API (open.er-api.com). Display-only — no
// settlement risk. Falls back to a representative rate.
const FALLBACK_IDR = 16_300;

let cache: number | null = null;

export function useFx() {
  const [idr, setIdr] = useState<number>(cache ?? FALLBACK_IDR);
  useEffect(() => {
    if (cache) return;
    fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        const rate = j?.rates?.IDR;
        if (typeof rate === 'number' && rate > 0) {
          cache = rate;
          setIdr(rate);
        }
      })
      .catch(() => {});
  }, []);
  return idr;
}
