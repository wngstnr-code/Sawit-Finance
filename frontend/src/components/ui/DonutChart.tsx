'use client';

import { useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export type DonutSegment = {
  label: string;
  value: number;
  color: string;
};

export function DonutChart({
  segments,
  size = 160,
  thickness = 20,
  children,
  className = '',
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  children?: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);

  let cumulative = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const fraction = total > 0 ? s.value / total : 0;
      const dash = fraction * circumference;
      const offset = circumference - cumulative * circumference;
      cumulative += fraction;
      return { ...s, fraction, dash, offset };
    });

  const active = hover != null ? arcs[hover] : null;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#EAEAEC"
          strokeWidth={thickness}
        />
        {total > 0 ? (
          arcs.map((a, i) => (
            <motion.circle
              key={a.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={a.color}
              // On hover the active slice keeps full opacity and thickens a
              // touch; the others dim so the focused share reads clearly.
              strokeWidth={hover === i ? thickness + 4 : thickness}
              strokeLinecap="butt"
              strokeDasharray={`${a.dash} ${circumference - a.dash}`}
              strokeDashoffset={a.offset}
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, strokeDasharray: `0 ${circumference}` }}
              animate={{
                opacity: hover != null && hover !== i ? 0.3 : 1,
                strokeDasharray: `${a.dash} ${circumference - a.dash}`,
              }}
              transition={{ duration: reduceMotion ? 0 : 0.35, delay: hover != null ? 0 : i * 0.1, ease: [0.22, 1, 0.36, 1] }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            />
          ))
        ) : null}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {active ? (
          <>
            <div className="font-display text-xl font-semibold tabular-nums text-ink">
              {(active.fraction * 100).toFixed(1)}%
            </div>
            <div className="text-[10px] uppercase tracking-[0.1em] text-faint">{active.label}</div>
          </>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export function DonutLegend({ segments }: { segments: DonutSegment[] }) {
  return (
    <ul className="space-y-2">
      {segments.map((s) => (
        <li key={s.label} className="flex items-center justify-between gap-3 text-[13px]">
          <span className="flex items-center gap-2 text-muted">
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
          <span className="font-mono tabular-nums text-ink">{s.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
        </li>
      ))}
    </ul>
  );
}

export default DonutChart;
