'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useScroll,
  useMotionValueEvent,
} from 'framer-motion';
import { Reveal } from '@/components/motion/Reveal';
import { CountUp } from '@/components/motion/CountUp';
import Button from '@/components/ui/Button';
import { AreaChart } from '@/components/ui/ChartArea';
import { fmtAmount, distributedCspr } from '@/lib/format';
import { CSPR_DECIMALS, SALE, SAWIT_DECIMALS } from '@/lib/config';
import { fromBaseUnits } from '@/lib/format';
import { useChainState } from '@/lib/useChainState';
import { useCpoHistory } from '@/lib/useCpoHistory';
import { useLocale } from '@/lib/i18n';

// Ondo-style product accordion: the selected product expands into a full card
// on the left while the right stats panel swaps to that product's data.
//   0ms  closing card collapses / opening card expands (mirrored tween)
//   0ms  right panel cross-fades to the selected product (fade + slight rise)
const TIMING = {
  height: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
  fade: 0.15,
  panel: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const },
} as const;

// Fixed expanded-body height so the section keeps the exact same size no
// matter which product is open (longer copy compresses the inner spacer).
const BODY_H = 340;

type ProductKey = 'protocol' | 'sawit' | 'cspr';

// Fixed scroll order for the scroll-linked accordion below (independent of
// how `products` is built, since that array is re-created every render).
const PRODUCT_ORDER: ProductKey[] = ['protocol', 'sawit', 'cspr'];

// Brand accent hexes (mirror tailwind.config.ts) for SVG/inline use.
const ACCENT = {
  green: '#1E7A4F',
  amber: '#C98A2B',
  moss: '#4E8C6A',
} as const;

function AssetDot({ src, dark = false }: { src: string; dark?: boolean }) {
  return (
    <span
      className={`-ml-2 grid h-8 w-8 place-items-center rounded-full ring-2 ring-card first:ml-0 ${
        dark ? 'bg-ink' : ''
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className={dark ? 'h-[18px] w-[18px]' : 'h-8 w-8 rounded-full'}
      />
    </span>
  );
}

// CSPR has no brand SVG in this repo — a plain text badge stands in for it.
function CsprDot() {
  return (
    <span className="-ml-2 grid h-8 w-8 place-items-center rounded-full bg-brand text-[9px] font-semibold text-white ring-2 ring-card first:ml-0">
      CSPR
    </span>
  );
}

// Ascending mini bar chart (Ondo "Unique Holders" style) — pure divs.
function MiniBars({ values, color }: { values: number[]; color: string }) {
  if (!values.length) {
    return <div className="h-full w-full animate-pulse rounded-lg bg-bg-2" />;
  }
  const max = Math.max(...values);
  return (
    <div className="flex h-full w-full items-end gap-2">
      {values.map((v, i) => (
        <div
          key={i}
          className="min-h-1.5 flex-1 rounded-md"
          style={{
            height: `${max > 0 ? Math.max(6, (v / max) * 100) : 6}%`,
            backgroundColor: color,
            opacity:
              0.3 + 0.7 * (values.length > 1 ? i / (values.length - 1) : 1),
          }}
        />
      ))}
    </div>
  );
}

export default function RwaSection() {
  const { t } = useLocale();
  const s = useChainState();
  const hist = useCpoHistory();
  const [product, setProduct] = useState<ProductKey>('protocol');
  const reduceMotion = useReducedMotion();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: wrapperRef,
    offset: ['start start', 'end end'],
  });

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    // Reserve a dwell zone at the start/end of the scroll range so the
    // first and last product each get a beat before the section unpins.
    const DWELL = 0.12;
    const usable = 1 - DWELL * 2;
    const raw = (v - DWELL) / usable;
    const clamped = Math.min(1, Math.max(0, raw));
    const idx = Math.min(
      PRODUCT_ORDER.length - 1,
      Math.floor(clamped * PRODUCT_ORDER.length),
    );
    const key = PRODUCT_ORDER[idx];
    if (key !== product) setProduct(key);
  });

  const cpoValueM = s ? (s.total_tons_cpo * s.latest_cpo_price_cents) / 100 / 1_000_000 : 0;
  const rep = s?.oracle_reputation ?? 0;
  const sawitSupply = s ? fromBaseUnits(s.total_sawit_supply, SAWIT_DECIMALS) : 0;

  // Fair value per SAWIT, derived from the current mint/royalty parameters
  // pushed through the live CPO price history (same formula as useFairValue,
  // extended across the historical series for the sparkline).
  const fairValueSeries = useMemo(() => {
    if (!s?.token_rate || !s?.gorr_bps || !hist) return undefined;
    const denom = s.token_rate * s.gorr_bps;
    if (!denom) return undefined;
    return hist.series.map((p) => ({ date: p.date, price: (p.price * 10_000) / denom }));
  }, [s, hist]);
  const fvCurrent =
    s?.token_rate && s?.gorr_bps && hist?.latest
      ? (hist.latest * 10_000) / (s.token_rate * s.gorr_bps)
      : null;

  // Funded epochs — CSPR actually distributed on-chain, epoch by epoch.
  const fundedEpochs = useMemo(
    () => (s?.epochs ?? []).filter((e) => e.funded),
    [s],
  );
  const fundedSeries = fundedEpochs.map((e) => fromBaseUnits(e.total_distribution_cspr, CSPR_DECIMALS));
  const totalFundedCspr = fundedSeries.reduce((a, b) => a + b, 0);

  // Distribution yield: total CSPR distributed to date per circulating SAWIT
  // (issuer float and sale treasury excluded — yield accrues to holders, not
  // to unsold inventory), as a percentage of the fixed treasury price. Same
  // proxy used in ExploreView. Falls back to total supply when the snapshot
  // predates the circulating_sawit field.
  const distributed = distributedCspr(s, CSPR_DECIMALS);
  const circulating = s?.circulating_sawit
    ? fromBaseUnits(s.circulating_sawit, SAWIT_DECIMALS)
    : 0;
  const yieldBase = circulating > 0 ? circulating : sawitSupply;
  const distYieldPct =
    s && yieldBase > 0 && distributed > 0 ? (distributed / yieldBase / SALE.priceCspr) * 100 : null;

  const products: {
    key: ProductKey;
    name: string;
    desc: string;
    badge: string;
    icon: ReactNode;
    assets: ReactNode;
    cta: { label: string; href: string };
  }[] = [
    {
      key: 'protocol',
      name: 'Sawit Finance Protocol',
      desc: t.rwa.cardDesc,
      badge: t.rwa.live,
      icon: (
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sawit-fi-icon-white.svg" alt="" className="h-7 w-7" />
        </div>
      ),
      assets: (
        <>
          <CsprDot />
          <AssetDot src="/sawit-fi-icon-white.svg" dark />
        </>
      ),
      cta: { label: t.rwa.launch, href: '/app' },
    },
    {
      key: 'sawit',
      name: 'SAWIT',
      desc: t.rwa.sawitDesc,
      badge: `${s ? fmtAmount(sawitSupply) : '—'} ${t.rwa.mintedLabel}`,
      icon: (
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sawit-fi-icon-white.svg" alt="" className="h-7 w-7" />
        </div>
      ),
      assets: (
        <>
          <AssetDot src="/sawit-fi-icon-white.svg" dark />
          <CsprDot />
        </>
      ),
      cta: { label: t.rwa.sawitCta, href: '/app' },
    },
    {
      key: 'cspr',
      name: 'CSPR',
      desc: t.rwa.csprDesc,
      badge: t.rwa.claimWindowNote,
      icon: (
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand text-[11px] font-semibold text-white">
          CSPR
        </div>
      ),
      assets: (
        <>
          <CsprDot />
          <AssetDot src="/sawit-fi-icon-white.svg" dark />
        </>
      ),
      cta: { label: t.rwa.csprCta, href: '/app/tools/claim' },
    },
  ];

  return (
    <div ref={wrapperRef} className="relative h-[340vh]">
      <section
        id="rwa"
        className="sticky top-0 flex h-screen flex-col justify-start overflow-hidden px-5 pb-10 pt-28 sm:px-8 sm:pb-14 sm:pt-32"
      >
        <div className="mx-auto w-full max-w-content">
          <Reveal className="mx-auto mb-12 max-w-3xl text-center">
            <div className="inline-flex items-center justify-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-brand">
              <span className="h-px w-5 bg-brand/40" />
              {t.rwa.eyebrow}
            </div>
            <h2 className="mt-4 font-display text-4xl font-semibold tracking-tighter2 text-ink text-balance sm:text-5xl">
              {t.rwa.title}
            </h2>
          </Reveal>

          <Reveal>
            <div className="rounded-3xl border border-line bg-bg-2/60 p-3 sm:p-4">
              <div className="grid gap-3 lg:grid-cols-3">
                {/* left: product accordion (Ondo-style, one open at a time) */}
                <div className="flex flex-col gap-3">
                  {products.map((p) => {
                    const isOpen = product === p.key;
                    return (
                      <div
                        key={p.key}
                        className={`overflow-hidden rounded-2xl border border-line bg-card shadow-card ${
                          isOpen ? 'grow' : ''
                        }`}
                      >
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          onClick={() => setProduct(p.key)}
                          className={`group flex w-full items-start text-left ${
                            isOpen
                              ? 'cursor-default px-7 pt-7'
                              : 'px-7 py-6 transition-colors duration-200 hover:bg-ink'
                          }`}
                        >
                          {isOpen ? (
                            p.icon
                          ) : (
                            <span className="font-display text-2xl font-semibold tracking-tightish text-ink transition-colors duration-200 group-hover:text-white">
                              {p.name}
                            </span>
                          )}
                        </button>
                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div
                              key="body"
                              initial={
                                reduceMotion
                                  ? { opacity: 0 }
                                  : { height: 0, opacity: 0 }
                              }
                              animate={
                                reduceMotion
                                  ? { opacity: 1 }
                                  : { height: BODY_H, opacity: 1 }
                              }
                              exit={
                                reduceMotion
                                  ? { opacity: 0 }
                                  : { height: 0, opacity: 0 }
                              }
                              transition={
                                reduceMotion
                                  ? { duration: TIMING.fade }
                                  : {
                                      height: TIMING.height,
                                      opacity: { duration: TIMING.fade },
                                    }
                              }
                              className="overflow-hidden"
                            >
                              <div
                                style={{ height: BODY_H }}
                                className="flex flex-col px-7 pb-7"
                              >
                                <div className="min-h-6 flex-1" />
                                <h3 className="font-display text-3xl font-semibold tracking-tightish text-ink">
                                  {p.name}
                                </h3>
                                <p className="mt-3 text-[14px] leading-relaxed text-muted">
                                  {p.desc}
                                </p>
                                <span className="mt-4 w-fit rounded-full bg-bg-2 px-3 py-1 text-[12px] text-muted">
                                  {p.badge}
                                </span>
                                <div className="mt-8 flex items-center justify-between gap-3">
                                  <div className="flex items-center">
                                    {p.assets}
                                  </div>
                                  <Button
                                    href={p.cta.href}
                                    variant="primary"
                                    size="md"
                                  >
                                    {p.cta.label}
                                  </Button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>

                {/* right: stats panel, swaps per selected product */}
                <div className="h-full lg:col-span-2">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={product}
                      initial={
                        reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      exit={
                        reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }
                      }
                      transition={TIMING.panel}
                      className="grid h-full gap-3 lg:grid-rows-[1fr_auto]"
                    >
                      {product === 'protocol' && (
                        <>
                          <StatTop
                            label={t.rwa.verifiedValue}
                            value={
                              s ? (
                                <CountUp
                                  to={cpoValueM}
                                  format={(v) => `$${v.toFixed(2)}M`}
                                />
                              ) : (
                                '—'
                              )
                            }
                            chip={t.rwa.recordedOnchain}
                            chartLabel={t.rwa.cpoPriceLabel}
                            chartBadge={
                              hist
                                ? `${hist.change_pct >= 0 ? '+' : ''}${hist.change_pct}% · 5y`
                                : undefined
                            }
                            chart={
                              <AreaChart
                                id="rwa-cpo"
                                points={hist?.series}
                                color={ACCENT.green}
                              />
                            }
                          />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <StatCard
                              label={t.rwa.cpoRecorded}
                              value={
                                s ? (
                                  <CountUp
                                    to={s.total_tons_cpo}
                                    format={(v) =>
                                      `${Math.round(v).toLocaleString()} t`
                                    }
                                  />
                                ) : (
                                  '—'
                                )
                              }
                              note={t.rwa.epochsNote.replace(
                                '{count}',
                                String(s?.epoch_count ?? 0),
                              )}
                            />
                            <StatCard
                              label={t.rwa.oracleReputation}
                              value={
                                s ? (
                                  <CountUp
                                    to={rep}
                                    format={(v) => `${Math.round(v)}/100`}
                                  />
                                ) : (
                                  '—'
                                )
                              }
                              body={
                                <div className="mt-5">
                                  <div className="h-2 w-full overflow-hidden rounded-md bg-bg-2">
                                    <div
                                      className="h-full rounded-md bg-brand transition-[width] duration-700"
                                      style={{ width: `${rep}%` }}
                                    />
                                  </div>
                                  <div className="mt-2.5 flex justify-between font-mono text-[11px] text-faint">
                                    <span>
                                      {t.rwa.submissions.replace(
                                        '{count}',
                                        String(s?.oracle_submission_count ?? 0),
                                      )}
                                    </span>
                                    <span>
                                      {rep >= 90
                                        ? t.rwa.ratings.excellent
                                        : rep >= 75
                                          ? t.rwa.ratings.good
                                          : t.rwa.ratings.review}
                                    </span>
                                  </div>
                                </div>
                              }
                            />
                          </div>
                        </>
                      )}

                      {product === 'sawit' && (
                        <>
                          <StatTop
                            label={t.rwa.fvLabel}
                            value={
                              fvCurrent != null ? (
                                <CountUp
                                  to={fvCurrent}
                                  format={(v) => `$${fmtAmount(v, 4)}`}
                                />
                              ) : (
                                '—'
                              )
                            }
                            chip={t.rwa.fvUnit}
                            chartLabel={t.app.explore.fvEyebrow}
                            chart={
                              <AreaChart
                                id="rwa-fv"
                                points={fairValueSeries}
                                color={ACCENT.amber}
                                decimals={4}
                                unit=" /SAWIT"
                              />
                            }
                          />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <StatCard
                              label={t.rwa.mintedTitle}
                              value={
                                s ? (
                                  <CountUp
                                    to={sawitSupply}
                                    format={(v) => fmtAmount(v)}
                                  />
                                ) : (
                                  '—'
                                )
                              }
                              note={t.rwa.mintedLabel}
                            />
                            <StatCard
                              label={t.rwa.distYieldLabel}
                              value={
                                distYieldPct != null ? `~${distYieldPct.toFixed(1)}%` : '—'
                              }
                              note={t.rwa.distYieldNote}
                            />
                          </div>
                        </>
                      )}

                      {product === 'cspr' && (
                        <>
                          <StatTop
                            label={t.rwa.csprDistributed}
                            value={
                              s ? (
                                <CountUp
                                  to={totalFundedCspr}
                                  format={(v) => `${fmtAmount(v, 2)} CSPR`}
                                />
                              ) : (
                                '—'
                              )
                            }
                            chip={
                              <span className="inline-flex items-center gap-1">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src="/casper-logo.svg"
                                  alt=""
                                  className="h-3.5 w-3.5"
                                />
                                CSPR
                              </span>
                            }
                            chartLabel={t.rwa.fundedPerEpoch}
                            chart={
                              <MiniBars
                                values={fundedSeries}
                                color={ACCENT.moss}
                              />
                            }
                          />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <StatCard
                              label={t.rwa.epochsFunded}
                              value={s ? String(fundedEpochs.length) : '—'}
                              note={t.rwa.claimWindowNote}
                            />
                            <StatCard
                              label={t.rwa.avgPerEpoch}
                              value={
                                fundedEpochs.length
                                  ? `${fmtAmount(totalFundedCspr / fundedEpochs.length, 2)} CSPR`
                                  : '—'
                              }
                              note={t.rwa.merkleNote}
                            />
                          </div>
                        </>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

/* ── right-panel building blocks ─────────────────────────────────────── */

function StatTop({
  label,
  value,
  chip,
  chartLabel,
  chartBadge,
  chart,
}: {
  label: string;
  value: ReactNode;
  chip?: ReactNode;
  chartLabel?: string;
  chartBadge?: string;
  chart: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-card p-7 shadow-card">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[12px] text-faint">{label}</div>
          <div className="mt-1 font-display text-4xl font-semibold tracking-tighter2 text-ink">
            {value}
          </div>
        </div>
        {chip && (
          <span className="rounded-md border border-line px-2 py-1 font-mono text-[11px] text-brand">
            {chip}
          </span>
        )}
      </div>
      {/* always rendered (fixed height) so the card is identical across products */}
      <div className="mt-5 flex h-5 items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-faint">
          {chartLabel}
        </span>
        {chartBadge && (
          <span className="rounded-md bg-brand px-2 py-0.5 font-mono text-[11px] text-white">
            {chartBadge}
          </span>
        )}
      </div>
      {/* chart is absolutely positioned so its intrinsic SVG ratio can't stretch the card */}
      <div className="relative mt-2 min-h-32 flex-1">
        <div className="absolute inset-0">{chart}</div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
  body,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  body?: ReactNode;
}) {
  return (
    <div className="h-48 overflow-hidden rounded-2xl border border-line bg-card p-7 shadow-card sm:h-44">
      <div className="text-[12px] text-faint">{label}</div>
      <div className="mt-1 font-display text-4xl font-semibold tracking-tighter2 text-ink">
        {value}
      </div>
      {note && (
        <p className="mt-3 text-[13px] leading-relaxed text-muted">{note}</p>
      )}
      {body}
    </div>
  );
}
