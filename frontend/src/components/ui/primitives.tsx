import type { ReactNode } from 'react';

export function Section({
  children,
  className = '',
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`px-5 sm:px-8 ${className}`}>
      <div className="mx-auto w-full max-w-content">{children}</div>
    </section>
  );
}

export function Eyebrow({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-brand ${className}`}
    >
      <span className="h-px w-5 bg-brand/40" />
      {children}
    </div>
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-card shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-card p-6 shadow-card transition-shadow hover:shadow-card-lg">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">
        {label}
      </div>
      <div
        className={`mt-2.5 font-display text-3xl tracking-tightish tabular-nums ${
          accent ? 'text-brand' : 'text-ink'
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[13px] text-muted">{sub}</div>}
    </div>
  );
}
