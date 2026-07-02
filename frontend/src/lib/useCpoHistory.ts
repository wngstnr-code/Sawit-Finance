'use client';

import { useEffect, useState } from 'react';

export type CpoHistory = {
  series: { date: string; price: number }[];
  latest: number;
  change_pct: number;
  source: string;
};

let cache: CpoHistory | null = null;
let inflight: Promise<CpoHistory | null> | null = null;

function load(): Promise<CpoHistory | null> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch('/api/cpo-history')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      cache = j && j.series ? (j as CpoHistory) : null;
      return cache;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useCpoHistory() {
  const [data, setData] = useState<CpoHistory | null>(cache);
  useEffect(() => {
    let alive = true;
    load().then((d) => alive && d && setData(d));
    return () => {
      alive = false;
    };
  }, []);
  return data;
}
