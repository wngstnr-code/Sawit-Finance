'use client';

import { motion } from 'framer-motion';
import { Section, Eyebrow } from '@/components/ui/primitives';
import { CountUp } from '@/components/motion/CountUp';
import { Reveal } from '@/components/motion/Reveal';
import { SAWIT_DECIMALS } from '@/lib/config';
import { fromBaseUnits, fmtAmount, fmtUsdFromCents, bpsToPct } from '@/lib/format';
import { useChainState } from '@/lib/useChainState';

export default function StandardSection() {
  const s = useChainState();
  const cpoValueUsd = s ? (s.total_tons_cpo * s.latest_cpo_price_cents) / 100 : 0;

  return (
    <Section className="py-24 text-center sm:py-32">
      <div className="mx-auto mb-14 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-mono text-[12px] uppercase tracking-[0.12em] text-faint">
        <span>Live on Casper Testnet</span>
        <span className="text-line-2">·</span>
        <span>4 contracts on-chain</span>
        <span className="text-line-2">·</span>
        <span>AI-verified oracle</span>
      </div>

      <Reveal>
        <Eyebrow className="justify-center">A new standard</Eyebrow>
        <h2 className="mx-auto mt-4 max-w-3xl font-display text-4xl font-semibold tracking-tighter2 text-ink text-balance sm:text-5xl">
          A new standard for tokenized commodities.
        </h2>
        <p className="mx-auto mt-5 max-w-xl font-serif text-lg leading-relaxed text-muted sm:text-xl">
          Real production, verified by AI and settled on-chain — opening a
          $30B+ market to anyone.
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
              <span className="text-faint">$0.00M</span>
            )}
          </div>
          <div className="mt-3 text-sm uppercase tracking-[0.16em] text-faint">
            in verified CPO value, recorded on-chain
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
            Protocol dashboard
          </span>
        </div>
        <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
          {[
            { l: 'SAWIT Supply', v: s ? fmtAmount(fromBaseUnits(s.total_sawit_supply, SAWIT_DECIMALS)) : '—', a: true },
            { l: 'Oracle Rep.', v: s ? `${s.oracle_reputation}/100` : '—' },
            { l: 'CPO Price', v: s ? fmtUsdFromCents(s.latest_cpo_price_cents) : '—' },
            { l: 'GORR', v: s ? bpsToPct(s.gorr_bps) : '—' },
          ].map((c) => (
            <div key={c.l} className="bg-card p-5">
              <div className="text-[11px] uppercase tracking-wider text-faint">
                {c.l}
              </div>
              <div
                className={`mt-2 font-display text-xl font-semibold tabular-nums ${
                  c.a ? 'text-brand' : 'text-ink'
                }`}
              >
                {c.v}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </Section>
  );
}
