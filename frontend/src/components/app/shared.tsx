'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Card } from '@/components/ui/primitives';
import Button from '@/components/ui/Button';
import { AreaChart, type ChartPoint } from '@/components/ui/ChartArea';
import { CONTRACTS } from '@/lib/config';
import { LOOP_STEPS, txUrl, pkgUrl } from '@/lib/onchain';
import { fmtAmount, fmtUsdFromCents, fmtIdr, bpsToPct, shortHash, fromBaseUnits } from '@/lib/format';
import { CSPR_DECIMALS, SAWIT_DECIMALS, SALE } from '@/lib/config';
import { CountUp } from '@/components/motion/CountUp';
import { useLocale } from '@/lib/i18n';
import { useInvestor, type Phase } from './investor';

/* ── small atoms ─────────────────────────────────────────────────────── */

export function EstTag({ title }: { title?: string }) {
  return (
    <span
      title={title}
      className="ml-1.5 rounded bg-bg-2 px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-faint"
    >
      est.
    </span>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.1em] text-faint">{label}</div>
      <div className="mt-1 font-display text-xl tabular-nums text-ink">{value}</div>
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="font-display text-lg tracking-tightish text-ink">{children}</h2>
      {aside}
    </div>
  );
}

export function Chip({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'brand';
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
        tone === 'brand' ? 'bg-brand-tint text-brand' : 'bg-bg-2 text-muted'
      }`}
    >
      {children}
    </span>
  );
}

export function TokenBadge({ code }: { code: string }) {
  if (code === 'SAWIT') {
    return (
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bg-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/sawit-fi-icon-black.svg" alt="SAWIT" className="h-6 w-6" />
      </span>
    );
  }
  if (code === 'CSPR') {
    return (
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bg-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/casper-logo.svg" alt="CSPR" className="h-5 w-5" />
      </span>
    );
  }
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink font-display text-[13px] font-semibold text-white">
      {code.slice(0, 2)}
    </span>
  );
}

export function PhaseNote({ phase }: { phase: Phase }) {
  if (phase.phase === 'done') {
    return (
      <a
        className="font-mono text-[12px] text-brand hover:underline"
        href={txUrl(phase.hash)}
        target="_blank"
        rel="noopener noreferrer"
      >
        ✓ {shortHash(phase.hash, 6, 4)} ↗
      </a>
    );
  }
  if (phase.phase === 'error') {
    return <span className="text-[12px] text-orange">{phase.message}</span>;
  }
  return null;
}

/* ── Ondo-style balance hero ─────────────────────────────────────────── */

export function BalanceHero({
  label,
  value,
  sub,
  change,
  actions,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  change?: { pct: number; note?: string };
  actions?: ReactNode;
}) {
  return (
    <Card className="p-7 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-faint">
            {label}
          </div>
          <div className="mt-3 font-display text-5xl tracking-tighter2 tabular-nums text-ink sm:text-6xl">
            {value}
          </div>
          <div className="mt-2 flex items-center gap-3 text-[14px]">
            {change && (
              <span
                className={`inline-flex items-center gap-1 font-medium ${
                  change.pct >= 0 ? 'text-brand' : 'text-orange'
                }`}
              >
                {change.pct >= 0 ? '▲' : '▼'} {Math.abs(change.pct).toFixed(2)}%
                {change.note ? <span className="text-faint">· {change.note}</span> : null}
              </span>
            )}
            {sub && <span className="text-muted">{sub}</span>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </Card>
  );
}

/* ── Ondo-style value chart with range toggle ────────────────────────── */

// FRED PPOILUSDM is a monthly series (~60 points), so ranges are in months of
// observations rather than trading days.
const RANGES = [
  { key: '1Y', months: 12 },
  { key: '3Y', months: 36 },
  { key: '5Y', months: 60 },
] as const;

// Brand accent hexes (mirror tailwind.config.ts) for SVG/inline use.
const ACCENT_HEX = {
  steel: '#1E7A4F',
  ember: '#E2742E',
  violet: '#7C7FE8',
} as const;

export function ChartCard({
  id,
  title,
  points,
  footer,
  height = 'h-64',
  accent = 'steel',
  eyebrow,
  className = '',
  decimals,
  unit,
}: {
  id: string;
  title: string;
  points?: ChartPoint[];
  footer?: string;
  height?: string;
  accent?: 'steel' | 'ember';
  eyebrow?: string;
  className?: string;
  decimals?: number;
  unit?: string;
}) {
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('3Y');
  const series = useMemo(() => {
    if (!points?.length) return undefined;
    const months = RANGES.find((r) => r.key === range)!.months;
    return points.slice(Math.max(0, points.length - months));
  }, [points, range]);

  return (
    <Card className={`flex h-full flex-col p-6 ${className}`}>
      {eyebrow && (
        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">
          {eyebrow}
        </div>
      )}
      <div className={`flex items-center justify-between ${eyebrow ? 'mt-2' : ''}`}>
        <h3 className="font-display text-lg text-ink">{title}</h3>
        <div className="flex items-center gap-1 rounded-lg bg-bg-2 p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${
                range === r.key ? 'bg-card text-ink shadow-pill' : 'text-muted hover:text-ink'
              }`}
            >
              {r.key}
            </button>
          ))}
        </div>
      </div>
      <div className={`mt-4 min-h-0 grow ${height}`}>
        <AreaChart id={id} points={series} color={ACCENT_HEX[accent]} decimals={decimals} unit={unit} />
      </div>
      {footer && <div className="mt-3 text-[12px] text-faint">{footer}</div>}
    </Card>
  );
}

/* ── accordion chart card: FAQ-style stacked charts, one open at a time ─ */

// Storyboard (per section toggle, times from click):
//   0ms  closing body collapses (height → 0, fade out)
//   0ms  opening body expands (height 0 → BODY_H, fade in)
// Both use the same tween so expansion and collapse mirror each other and the
// column's total height stays constant — nothing below the accordion shifts.
const ACCORDION = {
  height: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
  fade: 0.15,
  spring: { type: 'spring' as const, stiffness: 350, damping: 32 },
} as const;

export type ChartAccordionSection = {
  key: string;
  eyebrow: string;
  title: string;
  /** current value shown on the right of the header when open */
  value?: ReactNode;
  points?: ChartPoint[];
  accent?: keyof typeof ACCENT_HEX;
  decimals?: number;
  unit?: string;
  footer?: string;
  /** show the 1Y/3Y/5Y range pills inside the body */
  ranged?: boolean;
};

export function ChartAccordionCard({
  sections,
  defaultOpen,
  bodyHeight = 348,
  matchHeightOf,
  className = '',
}: {
  sections: ChartAccordionSection[];
  defaultOpen: string;
  /** fixed pixel height of every open body, so the column height never changes */
  bodyHeight?: number;
  /** at lg+ widths, resize the open body so the whole column matches this element's height */
  matchHeightOf?: RefObject<HTMLElement | null>;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const [bodyH, setBodyH] = useState(bodyHeight);
  // true while a body height animation runs — measuring mid-animation would
  // feed transient heights back into the correction and make it oscillate
  const animating = useRef(false);
  const syncRef = useRef<() => void>(() => {});

  useEffect(() => {
    const target = matchHeightOf?.current;
    const container = containerRef.current;
    if (!target || !container) return;
    const lg = window.matchMedia('(min-width: 1024px)');
    const sync = () => {
      if (animating.current) return;
      if (!lg.matches) {
        setBodyH(bodyHeight);
        return;
      }
      // measure the sections' natural height (children + gaps), not the container:
      // the grid row can stretch the container and justify-between pins children
      // to its edges, so container/child positions hide any height deficit.
      // content height is linear in bodyH, so one correction lands exactly
      const kids = Array.from(container.children) as HTMLElement[];
      if (!kids.length) return;
      const gap = parseFloat(getComputedStyle(container).rowGap) || 0;
      const contentH =
        kids.reduce((sum, k) => sum + k.offsetHeight, 0) + gap * (kids.length - 1);
      setBodyH((prev) => {
        const next = Math.max(220, Math.round(prev + target.offsetHeight - contentH));
        if (Math.abs(next - prev) <= 1) return prev;
        animating.current = true;
        return next;
      });
    };
    syncRef.current = sync;
    const ro = new ResizeObserver(sync);
    ro.observe(target);
    ro.observe(container);
    lg.addEventListener('change', sync);
    return () => {
      ro.disconnect();
      lg.removeEventListener('change', sync);
    };
  }, [matchHeightOf, bodyHeight]);

  return (
    // justify-between pins the last section to the column's bottom edge, so the
    // accordion's bottom always lines up with the neighbouring card even before
    // the ResizeObserver correction has landed
    <div ref={containerRef} className={`flex flex-col justify-between gap-3 ${className}`}>
      {sections.map((s) => {
        const isOpen = open === s.key;
        return (
          <div
            key={s.key}
            className={`group rounded-2xl border transition-colors duration-300 ${
              isOpen
                ? 'border-line bg-card shadow-card'
                : 'border-line bg-card shadow-pill hover:border-ink hover:bg-ink'
            }`}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => {
                if (open !== s.key) animating.current = true;
                setOpen(s.key);
              }}
              className={`group flex w-full items-center justify-between gap-3 px-6 text-left ${
                isOpen ? 'cursor-default pt-6' : 'py-5'
              }`}
            >
              {isOpen ? (
                <>
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">
                      {s.eyebrow}
                    </div>
                    <h3 className="mt-1 font-display text-lg text-ink">{s.title}</h3>
                  </div>
                  <div className="flex shrink-0 items-center">{s.value}</div>
                </>
              ) : (
                <>
                  <h3 className="font-display text-lg text-ink transition-colors duration-300 group-hover:text-white">
                    {s.title}
                  </h3>
                  <div className="flex shrink-0 items-center">
                    <motion.span
                      className="text-ink transition-colors duration-300 group-hover:text-white"
                      whileHover={reduceMotion ? undefined : { x: 3 }}
                      transition={ACCORDION.spring}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                    </motion.span>
                  </div>
                </>
              )}
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key="body"
                  initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  animate={reduceMotion ? { opacity: 1 } : { height: bodyH, opacity: 1 }}
                  exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={
                    reduceMotion
                      ? { duration: ACCORDION.fade }
                      : { height: ACCORDION.height, opacity: { duration: ACCORDION.fade } }
                  }
                  onAnimationComplete={() => {
                    animating.current = false;
                    syncRef.current();
                  }}
                  className="overflow-hidden"
                >
                  <div style={{ height: bodyH }} className="flex flex-col px-6 pb-6 pt-4">
                    <AccordionChartBody section={s} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

// Fills its fixed-height parent: the chart flexes to absorb the space the
// range pills / footer don't use, keeping both sections' bodies equal-height.
function AccordionChartBody({ section }: { section: ChartAccordionSection }) {
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('3Y');
  const series = useMemo(() => {
    if (!section.points?.length) return undefined;
    if (!section.ranged) return section.points;
    const months = RANGES.find((r) => r.key === range)!.months;
    return section.points.slice(Math.max(0, section.points.length - months));
  }, [section.points, section.ranged, range]);

  return (
    <>
      {section.ranged && (
        <div className="mb-3 flex w-fit items-center gap-1 rounded-lg bg-bg-2 p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${
                range === r.key ? 'bg-card text-ink shadow-pill' : 'text-muted hover:text-ink'
              }`}
            >
              {r.key}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <AreaChart
          id={`accordion-${section.key}`}
          points={series}
          color={ACCENT_HEX[section.accent ?? 'steel']}
          decimals={section.decimals}
          unit={section.unit}
        />
      </div>
      {section.footer && <div className="mt-3 text-[12px] text-faint">{section.footer}</div>}
    </>
  );
}

/* ── KYC banner ───────────────────────────────────────────────────────── */

export function KycBanner() {
  const { kycVerified, kyc } = useInvestor();
  const { t } = useLocale();
  const pending = kyc.phase === 'submitted' || kyc.phase === 'working';
  return (
    <Card
      className={`flex flex-wrap items-center justify-between gap-3 p-5 ${
        kycVerified ? 'border-brand/30 bg-brand-tint' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${kycVerified ? 'bg-brand' : 'bg-orange'}`} />
        <div>
          <div className="text-[14px] font-medium text-ink">
            {kycVerified
              ? t.app.shared.kycAuthorized
              : pending
              ? t.app.shared.kycPending
              : t.app.shared.noKyc}
          </div>
          <div className="text-[12px] text-muted">{t.app.shared.authRequiredNote}</div>
        </div>
      </div>
      {!kycVerified && (
        <Button href="/app/tools/kyc" variant="secondary">
          {t.app.shared.requestAccess}
        </Button>
      )}
    </Card>
  );
}

/* ── Ondo-style holdings rows ────────────────────────────────────────── */

export function HoldingsList({ showApy = true }: { showApy?: boolean }) {
  const { t } = useLocale();
  const { balance, liquid, claimable, idr, fairValueUsd, csprUsd, state, distributed } = useInvestor();

  // Distribution yield to date per *circulating* SAWIT, as a % of the fixed
  // treasury price — identical denominator/proxy to ExploreView & the landing.
  const circulating = state?.circulating_sawit
    ? fromBaseUnits(state.circulating_sawit, SAWIT_DECIMALS)
    : 0;
  const yieldBase = circulating > 0 ? circulating : (state ? Number(state.total_sawit_supply) : 0);
  const sawitYieldPct =
    yieldBase > 0 && distributed > 0
      ? `~${((distributed / yieldBase / SALE.priceCspr) * 100).toFixed(1)}%`
      : null;

  const rows = [
    {
      code: 'SAWIT',
      name: t.app.shared.assetSawit,
      apy: sawitYieldPct,
      balance: balance ?? 0,
      valueUsd: fairValueUsd != null && balance != null ? balance * fairValueUsd : null,
      unauthorized: false,
    },
    {
      // Native CSPR the connected wallet actually holds (liquid, live on-chain),
      // marked in USD at the live CoinGecko spot price.
      code: 'CSPR',
      name: t.app.shared.assetCspr,
      apy: null as string | null,
      balance: liquid ?? 0,
      valueUsd: liquid != null ? liquid * csprUsd : null,
      unauthorized: false,
    },
    // Claimable revenue yield — only listed once there is something to claim.
    ...(claimable && claimable > 0
      ? [
          {
            code: 'YIELD',
            name: t.app.shared.assetYield,
            apy: null as string | null,
            balance: claimable,
            valueUsd: claimable * csprUsd,
            unauthorized: false,
          },
        ]
      : []),
  ];

  return (
    <Card className="divide-y divide-line overflow-hidden">
      {/* header row */}
      <div className="hidden grid-cols-[1.6fr_1fr_1fr_1fr] gap-4 px-6 py-3 text-[11px] uppercase tracking-[0.1em] text-faint sm:grid">
        <div>{t.app.shared.asset}</div>
        {showApy && <div className="text-right">{t.app.shared.distYield}</div>}
        <div className="text-right">{t.app.shared.balance}</div>
        <div className="text-right">{t.app.shared.value}</div>
      </div>

      {balance == null && liquid == null ? (
        <div className="px-6 py-8 text-center text-[13px] text-muted">{t.app.shared.loadingHoldings}</div>
      ) : (
        rows.map((r) => (
          <div
            key={r.code}
            className="grid grid-cols-2 items-center gap-4 px-6 py-4 sm:grid-cols-[1.6fr_1fr_1fr_1fr]"
          >
            <div className="flex items-center gap-3">
              <TokenBadge code={r.code} />
              <div>
                <div className="flex items-center gap-2 font-medium text-ink">
                  {r.code}
                  {r.unauthorized && (
                    <span className="rounded bg-orange/10 px-1.5 py-0.5 text-[10px] font-medium text-orange">
                      {t.app.shared.unauthorized}
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-muted">{r.name}</div>
              </div>
            </div>
            {showApy && (
              <div className="hidden text-right sm:block">
                {r.apy ? (
                  <span className="text-[13px] font-bold text-brand">{r.apy}</span>
                ) : (
                  <span className="text-faint">—</span>
                )}
              </div>
            )}
            <div className="text-right tabular-nums text-ink">
              {fmtAmount(r.balance, r.code === 'SAWIT' ? 0 : 4)}
              <div className="text-[11px] text-faint sm:hidden">{r.code}</div>
            </div>
            <div className="text-right tabular-nums text-ink">
              {r.valueUsd == null ? (
                <span className="text-faint">—</span>
              ) : (
                <>
                  ${fmtAmount(r.valueUsd, 2)}
                  <div className="text-[11px] text-faint">{fmtIdr(r.valueUsd, idr)}</div>
                </>
              )}
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

/* ── verified epochs (track record, one table) ───────────────────────── */

export function EpochList() {
  const { t } = useLocale();
  const { state } = useInvestor();
  const epochs = state?.epochs;

  if (!state || state.epoch_count <= 0) return null;

  return (
    <Card className="divide-y divide-line overflow-hidden">
      {/* header — GORR is a global rate, shown once for the whole table */}
      <div className="hidden grid-cols-[1.4fr_1fr_1fr_1.2fr] gap-4 px-6 py-3 text-[11px] uppercase tracking-[0.1em] text-faint sm:grid">
        <div>{t.app.shared.epoch}</div>
        <div className="text-right">{t.app.shared.production}</div>
        <div className="text-right">{t.app.shared.fredPrice}</div>
        <div className="text-right">{t.app.shared.value}</div>
      </div>

      {epochs == null ? (
        <div className="px-6 py-8 text-center text-[13px] text-muted">
          {t.app.shared.loadingEpochs}
        </div>
      ) : (
        epochs.map((e) => {
          const isLatest = e.epoch_number === state.current_distribution_epoch;
          const pricePerTon = e.tons_cpo ? e.revenue_usd / e.tons_cpo : 0;
          const distributed = fromBaseUnits(e.total_distribution_cspr, CSPR_DECIMALS);
          return (
            <div
              key={e.epoch_number}
              className={`grid grid-cols-2 items-center gap-4 px-6 py-4 sm:grid-cols-[1.4fr_1fr_1fr_1.2fr] ${
                isLatest ? 'bg-brand-tint/40' : ''
              }`}
            >
              <div>
                <div className="flex items-center gap-2 font-medium text-ink">
                  #{e.epoch_number}
                  {isLatest && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-brand">
                      {t.app.shared.latestTag}
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-faint">
                  {e.funded ? 'Funded' : 'Unfunded'}
                </div>
              </div>
              {/* distribution-only epochs (re-funds) have no production record */}
              <div className="hidden text-right tabular-nums text-ink sm:block">
                {e.tons_cpo ? `${fmtAmount(e.tons_cpo)} t` : '—'}
              </div>
              <div className="hidden text-right tabular-nums text-ink sm:block">
                {e.tons_cpo ? `$${fmtAmount(pricePerTon, 2)}` : '—'}
              </div>
              <div className="text-right text-[13px] font-medium text-ink">
                {fmtAmount(distributed, 2)} CSPR
              </div>
            </div>
          );
        })
      )}

      {/* GORR footer — applies across every epoch */}
      <div className="px-6 py-3 text-right text-[12px] text-faint">
        {t.app.shared.gorr} {bpsToPct(state.gorr_bps)}
      </div>
    </Card>
  );
}

/* ── on-chain proof ──────────────────────────────────────────────────── */

export function OnChainProof() {
  const { t } = useLocale();
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        {LOOP_STEPS.map((s) => {
          const stepKey =
            s.entrypoint === 'claim_yield'
              ? 'claim'
              : s.entrypoint === 'fund_epoch'
              ? 'fund_epoch'
              : 'record_epoch';
          const step = t.proof.steps[stepKey as keyof typeof t.proof.steps];
          return (
            <Card key={s.n} className="p-5">
              <div className="font-mono text-[12px] text-faint">
                {t.proof.step} {s.n}
              </div>
              <div className="mt-1 font-display text-lg text-ink">{step.title}</div>
              <p className="mt-1 text-[13px] text-muted">{step.desc}</p>
              {s.tx ? (
                <a
                  className="mt-3 inline-block font-mono text-[12px] text-brand hover:underline"
                  href={txUrl(s.tx)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {shortHash(s.tx, 8, 6)} ↗
                </a>
              ) : (
                <div className="mt-3 font-mono text-[12px] text-faint">{t.proof.pending}</div>
              )}
            </Card>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-[12px] text-muted">
        <a className="hover:text-ink" href={pkgUrl(CONTRACTS.productionVault)} target="_blank" rel="noopener noreferrer">
          SawitVault ↗
        </a>
        <a className="hover:text-ink" href={pkgUrl(CONTRACTS.yieldDistributor)} target="_blank" rel="noopener noreferrer">
          SawitYield ↗
        </a>
        <a className="hover:text-ink" href={pkgUrl(CONTRACTS.sawitToken)} target="_blank" rel="noopener noreferrer">
          SAWIT (CEP-18) ↗
        </a>
      </div>
    </div>
  );
}

/* ── inline connect prompt (browse-before-connect) ───────────────────── */

export function ConnectPrompt({ title, body }: { title?: string; body?: string }) {
  const { t } = useLocale();
  const { connect, ready } = useInvestor();
  return (
    <Card className="mx-auto flex max-w-lg flex-col items-center px-6 py-14 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/sawit-fi-icon-black.svg" alt="" className="h-16 w-16" />
      <h2 className="mt-4 font-display text-2xl tracking-tighter2 text-ink">
        {title ?? t.app.connect.title}
      </h2>
      <p className="mt-2 max-w-md text-[15px] leading-relaxed text-muted">
        {body ?? t.app.connect.body}
      </p>
      <button
        onClick={connect}
        disabled={!ready}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-ink px-7 py-3 text-sm font-medium text-bg shadow-pill transition-transform hover:-translate-y-0.5 disabled:opacity-50"
      >
        {ready ? t.app.connect.connect : t.app.connect.loading}
      </button>
    </Card>
  );
}

/* ── page heading ────────────────────────────────────────────────────── */

export function PageHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div>
      <h1 className="font-display text-3xl tracking-tighter2 text-ink sm:text-4xl">{title}</h1>
      {sub && <p className="mt-2 max-w-2xl text-[15px] text-muted">{sub}</p>}
    </div>
  );
}

/* ── Ondo "Converter"-style tool layout (left intro · middle action · right history) ── */

export function ToolColumns({
  left,
  middle,
  right,
}: {
  left: ReactNode;
  middle: ReactNode;
  right: ReactNode;
}) {
  return (
    <div className="grid gap-10 lg:grid-cols-[0.9fr_1.15fr_0.8fr]">
      <div>{left}</div>
      <div>{middle}</div>
      <div>{right}</div>
    </div>
  );
}

export function ToolIntro({
  title,
  paragraphs,
  readMoreHref,
  divided = false,
}: {
  title: string;
  paragraphs: string[];
  readMoreHref?: string;
  divided?: boolean;
}) {
  const { t } = useLocale();
  return (
    <div>
      <h1 className="font-display text-4xl tracking-tighter2 text-ink">{title}</h1>
      <div
        className={`mt-5 text-[14px] leading-relaxed text-muted ${
          divided ? 'divide-y divide-line' : 'space-y-4'
        }`}
      >
        {paragraphs.map((p, i) => (
          <p key={i} className={divided ? 'py-4 first:pt-0 last:pb-0' : ''}>
            {p}
          </p>
        ))}
      </div>
      {readMoreHref && (
        <div className="mt-6">
          <Button href={readMoreHref} variant="secondary">
            {t.app.shared.readMore}
          </Button>
        </div>
      )}
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="text-faint transition-colors hover:text-ink"
      aria-label="Copy"
    >
      {copied ? (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 8.5 6.5 11.5 12.5 5" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
          <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H3.5A1.5 1.5 0 0 0 2 4v5.5A1.5 1.5 0 0 0 3.5 11H5" />
        </svg>
      )}
    </button>
  );
}

export function ContractRow({ label, id }: { label: string; id: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="text-[13px] text-muted">{label}</span>
      <div className="flex items-center gap-3">
        <span className="font-mono text-[13px] text-ink">{shortHash(id, 6, 5)}</span>
        <CopyButton text={id} />
        <a
          href={pkgUrl(id)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-faint transition-colors hover:text-ink"
          aria-label="Open in explorer"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V10" />
            <path d="M9.5 2.5H13.5V6.5M13 3l-6 6" />
          </svg>
        </a>
      </div>
    </div>
  );
}

export function HistoryPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="font-display text-lg text-ink">{title}</h3>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-bg-2/50 text-faint">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="7" width="18" height="12" rx="2" />
          <path d="M3 11h18M7 15h4" />
        </svg>
      </div>
      <div className="mt-4 text-[14px] font-medium text-ink">{title}</div>
      <div className="mt-1 max-w-[220px] text-[12px] text-muted">{text}</div>
    </div>
  );
}

export { CountUp };
