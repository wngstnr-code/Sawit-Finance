'use client';

// Interactive area chart — smooth line + soft fill, hover crosshair + tooltip.
// id/points/color/decimals/unit API consumed by ChartCard/ChartAccordionCard.
import { useState } from 'react';
import { fmtAmount } from '@/lib/format';

export type ChartPoint = { date: string; price: number };

// Brand green (Sawit) — default accent for this chart.
const STEEL = '#1E7A4F';

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const cx = (p0.x + p1.x) / 2;
    d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

function fmtMonth(date: string): string {
  // Only parse ISO-like dates; labels such as "Epoch 9" must pass through
  // verbatim (V8's lenient Date parser reads them as "Sep 2001").
  if (!/^\d{4}-\d{2}/.test(date)) return date;
  const d = new Date(date);
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function AreaChart({
  id,
  points,
  color = STEEL,
  decimals = 0,
  unit = '/t',
}: {
  id: string;
  points?: ChartPoint[];
  color?: string;
  decimals?: number;
  unit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 100;
  const H = 80;
  const pad = 8;

  if (!points || points.length < 2) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none">
        {[20, 40, 60].map((y) => (
          <line key={y} x1="0" y1={y} x2={W} y2={y} className="stroke-line" strokeWidth="0.5" />
        ))}
        <line
          x1="0"
          y1={H - 12}
          x2={W}
          y2={H - 12}
          stroke="#E6EFEA"
          strokeWidth="1.4"
          className="animate-pulse"
        />
      </svg>
    );
  }

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const n = points.length;

  const xfrac = (i: number) => (3 + (i / (n - 1)) * (W - 6)) / W; // 0..1
  const yfrac = (v: number) => (pad + (1 - (v - min) / span) * (H - pad * 2)) / H; // 0..1

  const pts = points.map((p, i) => ({ x: xfrac(i) * W, y: yfrac(p.price) * H }));
  const line = smoothPath(pts);
  const area = `${line} L ${pts[n - 1].x} ${H} L ${pts[0].x} ${H} Z`;

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))));
  };

  const hp = hover != null ? points[hover] : null;
  const hx = hover != null ? xfrac(hover) * 100 : 0;
  const hy = hover != null ? yfrac(points[hover].price) * 100 : 0;
  const tipLeft = Math.max(10, Math.min(90, hx));

  return (
    <div className="relative h-full w-full" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.16" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[20, 40, 60].map((y) => (
          <line key={y} x1="0" y1={y} x2={W} y2={y} className="stroke-line" strokeWidth="0.5" />
        ))}
        <path d={area} fill={`url(#${id}-fill)`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {hp && (
        <>
          <div
            className="pointer-events-none absolute bottom-0 top-0 w-px bg-line-2"
            style={{ left: `${hx}%` }}
          />
          <div
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-pill"
            style={{ left: `${hx}%`, top: `${hy}%`, backgroundColor: color }}
          />
          <div
            className="pointer-events-none absolute top-1 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-card px-2.5 py-1.5 shadow-card"
            style={{ left: `${tipLeft}%` }}
          >
            <div className="font-display text-[13px] tabular-nums text-ink">
              ${fmtAmount(hp.price, decimals)}
              <span className="text-[11px] text-faint">{unit}</span>
            </div>
            <div className="text-[11px] text-muted">{fmtMonth(hp.date)}</div>
          </div>
        </>
      )}
    </div>
  );
}
