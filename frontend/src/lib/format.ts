// Display formatters for Sawit Finance on-chain values.

export function fromBaseUnits(raw: string, decimals: number): number {
  // values are small enough here to use Number safely for display
  if (!raw) return 0;
  return Number(raw) / 10 ** decimals;
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
