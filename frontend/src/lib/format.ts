
export function fmtIdr(usd: number, idrRate: number): string {
  return (usd * idrRate).toLocaleString('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  });
}

export function fromBaseUnits(raw: string, decimals: number): number {
  if (!raw) return 0;
  return Number(raw) / 10 ** decimals;
}

// CSPR distributed to holders = sum of funded epochs' distributions.
// The contract's `total_distributed_cspr` counter only moves when an expired
// epoch is swept, so it reads 0 while claim windows are still open — the
// funded-epoch sum is the number the UI should show. Falls back to the
// counter when epoch detail is unavailable (old cache/snapshot).
export function distributedCspr(
  state: {
    total_distributed_cspr: string;
    epochs?: { funded: boolean; total_distribution_cspr: string }[];
  } | null,
  csprDecimals: number
): number {
  if (!state) return 0;
  const funded = (state.epochs ?? []).filter((e) => e.funded);
  if (funded.length > 0) {
    return funded.reduce(
      (sum, e) => sum + fromBaseUnits(e.total_distribution_cspr, csprDecimals),
      0
    );
  }
  return fromBaseUnits(state.total_distributed_cspr, csprDecimals);
}

export function fmtAmount(n: number, maxFrac = 2): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFrac,
  });
}

export function fmtUsdFromCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

export function shortHash(h?: string, lead = 6, tail = 4): string {
  if (!h) return '—';
  return h.length <= lead + tail ? h : `${h.slice(0, lead)}…${h.slice(-tail)}`;
}

export function bpsToPct(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}
