'use client';

import { useEffect, useState } from 'react';
import type { ContractState } from './config';

// Single shared on-chain read across the whole landing (the read takes ~60-80s,
// so we fetch once and share the promise instead of hitting /api/state per section).
let cache: ContractState | null = null;
let inflight: Promise<ContractState | null> | null = null;

function fetchState(): Promise<ContractState | null> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch('/api/state', { cache: 'no-store' })
    .then((r) => r.json())
    .then((j) => {
      cache = (j && j.state) || null;
      return cache;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useChainState() {
  const [state, setState] = useState<ContractState | null>(cache);
  useEffect(() => {
    let alive = true;
    fetchState().then((s) => alive && s && setState(s));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
