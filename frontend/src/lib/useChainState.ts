'use client';

import { useEffect, useState } from 'react';
import type { ContractState } from './config';

let cache: ContractState | null = null;
let cacheIsSnapshot = false;
let inflight: Promise<{ state: ContractState | null; isSnapshot: boolean }> | null = null;

function fetchState(): Promise<{ state: ContractState | null; isSnapshot: boolean }> {
  if (cache) return Promise.resolve({ state: cache, isSnapshot: cacheIsSnapshot });
  if (inflight) return inflight;
  inflight = fetch('/api/state', { cache: 'no-store' })
    .then((r) => r.json())
    .then((j) => {
      cache = (j && j.state) || null;
      // `snapshot: true` = static fallback bundled in the app; `cached: true` on a
      // stale-served response can still be live data refreshing in the background,
      // so only the hard `snapshot` flag counts as "not live" for the UI badge.
      cacheIsSnapshot = Boolean(j && j.snapshot);
      return { state: cache, isSnapshot: cacheIsSnapshot };
    })
    .catch(() => ({ state: null, isSnapshot: false }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useChainState() {
  const [state, setState] = useState<ContractState | null>(cache);
  useEffect(() => {
    let alive = true;
    fetchState().then(({ state: s }) => {
      if (alive && s) setState(s);
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

// Exposes whether /api/state is serving the bundled static snapshot (no live
// chain read available), so the UI can show a small "not live" indicator.
export function useChainStateMeta() {
  const [isSnapshot, setIsSnapshot] = useState(cacheIsSnapshot);
  useEffect(() => {
    let alive = true;
    fetchState().then(({ isSnapshot: snap }) => {
      if (alive) setIsSnapshot(snap);
    });
    return () => {
      alive = false;
    };
  }, []);
  return { isSnapshot };
}
