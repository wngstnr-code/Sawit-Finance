'use client';

import { Fragment } from 'react';
import { motion } from 'framer-motion';
import { Section, Eyebrow } from '@/components/ui/primitives';
import { CountUp } from '@/components/motion/CountUp';
import { Reveal } from '@/components/motion/Reveal';
import { SAWIT_DECIMALS, CSPR_DECIMALS, SALE } from '@/lib/config';
import { fromBaseUnits, distributedCspr, fmtAmount, fmtUsdFromCents } from '@/lib/format';
import { useChainState } from '@/lib/useChainState';
import { useLocale } from '@/lib/i18n';

export default function StandardSection() {
  const { t } = useLocale();
  const s = useChainState();
  const cpoValueUsd = s ? (s.total_tons_cpo * s.latest_cpo_price_cents) / 100 : 0;

  // Distribution yield: total CSPR distributed to date per *circulating* SAWIT
  // (issuer float and sale treasury excluded — yield accrues to holders, not to
  // unsold inventory), as a percentage of the fixed treasury price. Same proxy
  // and denominator as ExploreView/RwaSection; falls back to total supply when
  // the snapshot predates the circulating_sawit field.
  const supply = s ? fromBaseUnits(s.total_sawit_supply, SAWIT_DECIMALS) : 0;
  const circulating = s?.circulating_sawit ? fromBaseUnits(s.circulating_sawit, SAWIT_DECIMALS) : 0;
  const yieldBase = circulating > 0 ? circulating : supply;
  const distributed = distributedCspr(s, CSPR_DECIMALS);
  const distYieldPct =
    s && yieldBase > 0 && distributed > 0 ? (distributed / yieldBase / SALE.priceCspr) * 100 : null;

  return (
    <Section className="py-24 text-center sm:py-32">
      <div className="mx-auto mb-14 flex flex-col items-center justify-center gap-y-1.5 text-center font-mono text-[12px] uppercase tracking-[0.12em] text-faint sm:flex-row sm:gap-x-5 sm:gap-y-2">
        {t.standard.pills.map((pill, i) => (
          <Fragment key={pill}>
            {i > 0 && <span className="hidden text-line-2 sm:inline">·</span>}
            <span>{pill}</span>
          </Fragment>
        ))}
      </div>

      <Reveal>
        <Eyebrow className="justify-center">{t.standard.eyebrow}</Eyebrow>
        <h2 className="mx-auto mt-4 max-w-3xl font-display text-4xl font-semibold tracking-tighter2 text-ink text-balance sm:text-5xl">
          {t.standard.title}
        </h2>
        <p className="mx-auto mt-5 max-w-xl font-serif text-lg leading-relaxed text-muted sm:text-xl">
          {t.standard.subcopy}
        </p>
      </Reveal>

      {/* big animated value */}
      <Reveal delay={0.1}>
        <div className="mt-16">
          <div className="font-display text-6xl font-semibold tracking-tighter2 text-ink sm:text-8xl">
            {s ? (
              <CountUp
                to={cpoValueUsd}
                duration={2}
                format={(v) =>
                  `$${(v / 1_000_000).toFixed(2)}M`
                }
              />
            ) : (
              <span className="inline-block h-14 w-72 animate-pulse rounded-2xl bg-bg-2 align-middle sm:h-20 sm:w-[28rem]" />
            )}
          </div>
          <div className="mx-auto mt-3 max-w-xs text-balance text-xs uppercase tracking-[0.14em] text-faint sm:max-w-none sm:text-sm sm:tracking-[0.16em]">
            {t.standard.valueCaption}
          </div>
        </div>
      </Reveal>

      {/* product preview card */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto mt-16 max-w-3xl overflow-hidden rounded-3xl border border-line bg-card text-left shadow-card-lg"
      >
        <div className="flex items-center gap-2 border-b border-line px-5 py-3">
          <span className="font-mono text-[12px] text-faint">
            {t.standard.dashboard}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
          {[
            { l: t.standard.stats.supply, v: s ? fmtAmount(supply) : '—' },
            { l: t.standard.stats.oracleRep, v: s ? `${s.oracle_reputation}/100` : '—' },
            {
              l: t.standard.stats.cpoPrice,
              v: s ? fmtUsdFromCents(s.latest_cpo_price_cents) : '—',
              unit: '/t',
            },
            {
              l: t.standard.stats.distYield,
              v: distYieldPct != null ? `~${distYieldPct.toFixed(1)}%` : '—',
              tip: t.rwa.distYieldNote,
            },
          ].map((c) => (
            <div key={c.l} className="bg-card p-5" title={'tip' in c ? c.tip : undefined}>
              <div className="text-[11px] uppercase tracking-wider text-faint">
                {c.l}
              </div>
              <div className="mt-2 font-display text-xl font-semibold tabular-nums text-ink">
                {c.v}
                {'unit' in c && c.unit && (
                  <span className="ml-1 text-[12px] font-normal text-faint">{c.unit}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </Section>
  );
}
