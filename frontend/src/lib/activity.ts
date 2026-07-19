'use client';

import { useCallback, useEffect, useState } from 'react';

export type ActivityEntry = {
  // buy/claim/kyc are recorded by the app; transfer/contract come from the
  // wallet's full CSPR.cloud deploy history (anything done outside this app).
  type: 'buy' | 'claim' | 'kyc' | 'transfer' | 'contract';
  hash?: string;
  at: number;
  note?: string;
};

const MAX_ENTRIES = 50;
const EVENT_NAME = 'sawit-activity';

function storageKey(publicKey: string): string {
  return `sawit.activity.${publicKey}`;
}

function readEntries(publicKey: string): ActivityEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(publicKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordActivity(publicKey: string, entry: ActivityEntry): void {
  if (typeof window === 'undefined' || !publicKey) return;
  try {
    const existing = readEntries(publicKey);
    const next = [entry, ...existing].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(storageKey(publicKey), JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { publicKey } }));
  } catch {
    // localStorage unavailable (private mode, quota, etc) — ignore, non-critical.
  }
}

// Merge the wallet's full on-chain history (CSPR.cloud via /api/activity)
// with the local log. Local entries win on hash collision (they carry the
// app-level type, e.g. 'buy'); local-only entries (no hash yet, or history
// lag) are kept.
function merge(local: ActivityEntry[], remote: ActivityEntry[]): ActivityEntry[] {
  const seen = new Set(local.map((e) => e.hash).filter(Boolean));
  return [...local, ...remote.filter((e) => !e.hash || !seen.has(e.hash))]
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_ENTRIES);
}

export function useActivity(publicKey: string | null): ActivityEntry[] {
  const [entries, setEntries] = useState<ActivityEntry[]>(() =>
    publicKey ? readEntries(publicKey) : []
  );
  const [remote, setRemote] = useState<ActivityEntry[]>([]);

  const refresh = useCallback(() => {
    setEntries(publicKey ? readEntries(publicKey) : []);
  }, [publicKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    setRemote([]);
    if (!publicKey) return;
    let alive = true;
    fetch(`/api/activity?publicKey=${publicKey}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (alive && Array.isArray(j?.entries)) setRemote(j.entries);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [publicKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onActivity = () => refresh();
    window.addEventListener(EVENT_NAME, onActivity);
    window.addEventListener('storage', onActivity);
    return () => {
      window.removeEventListener(EVENT_NAME, onActivity);
      window.removeEventListener('storage', onActivity);
    };
  }, [refresh]);

  return merge(entries, remote);
}
