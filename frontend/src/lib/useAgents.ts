'use client';

import { useEffect, useState } from 'react';
import type { AgentsPayload } from './agentsTypes';

const REFRESH_MS = 45_000;

export function useAgents() {
  const [data, setData] = useState<AgentsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const r = await fetch('/api/agents', { cache: 'no-store' });
        const j = (await r.json()) as AgentsPayload;
        if (alive) {
          setData(j);
          setLoading(false);
        }
      } catch {
        if (alive) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return { data, loading };
}
