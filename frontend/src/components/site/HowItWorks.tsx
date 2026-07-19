'use client';

import { useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Reveal } from '@/components/motion/Reveal';
import { useLocale } from '@/lib/i18n';

// Stable per-step metadata (number + contract tag); the title/body come from the
// active locale and are merged in by index.
const STEP_META = [
  { n: '01', tag: 'ProductionVault · record_epoch' },
  { n: '02', tag: 'TokenMinter · CPI' },
  { n: '03', tag: 'YieldDistributor · fund_epoch' },
  { n: '04', tag: 'claim_yield · KYC' },
];

export default function HowItWorks() {
  const { t } = useLocale();
  const [active, setActive] = useState(0);
  const steps = STEP_META.map((m, i) => ({ ...m, ...t.how.steps[i] }));

  return (
    <section
      id="how"
      className="relative isolate flex min-h-screen flex-col justify-center overflow-hidden bg-ink py-24 sm:py-32"
    >
      <div className="absolute inset-0 -z-10 opacity-[0.18]">
        <Image src="/hero/plantation.jpg" alt="" fill sizes="100vw" className="object-cover [filter:saturate(0.3)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-ink via-ink/80 to-ink" />
      </div>

      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <Reveal className="max-w-2xl">
          <div className="inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-brand-bright">
            <span className="h-px w-5 bg-brand-bright/50" />
            {t.how.eyebrow}
          </div>
          <h2 className="mt-4 font-display text-4xl font-semibold tracking-tighter2 text-bg text-balance sm:text-5xl">
            {t.how.title}
          </h2>
        </Reveal>

        <div className="mt-14 flex flex-col gap-3 sm:flex-row sm:gap-4">
          {steps.map((s, i) => {
            const isActive = i === active;
            return (
              <motion.button
                key={s.n}
                layout
                onClick={() => setActive(i)}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className={`group relative flex min-h-[300px] flex-col rounded-2xl border p-7 text-left ${
                  isActive
                    ? 'border-transparent bg-white sm:flex-[2.4]'
                    : 'border-white/12 bg-white/[0.04] backdrop-blur-sm hover:bg-white/[0.07] sm:flex-1'
                }`}
              >
                {!isActive && (
                  <img
                    src="/sawit-fi-icon-white.svg"
                    alt=""
                    aria-hidden
                    className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 opacity-[0.06]"
                  />
                )}
                <motion.span
                  layout
                  className={`grid h-9 w-9 place-items-center rounded-full border font-mono text-[13px] ${
                    isActive
                      ? 'border-line text-brand'
                      : 'border-white/25 text-white/70'
                  }`}
                >
                  {s.n}
                </motion.span>

                <div className="mt-auto">
                  <motion.h3
                    layout="position"
                    className={`font-display text-xl font-semibold ${
                      isActive ? 'text-ink' : 'text-bg'
                    }`}
                  >
                    {s.title}
                  </motion.h3>

                  {isActive && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.15 }}
                    >
                      <p className="mt-3 text-[14px] leading-relaxed text-muted">
                        {s.body}
                      </p>
                      <div className="mt-5 border-t border-line pt-4">
                        <span className="font-mono text-[12px] text-brand">
                          {s.tag}
                        </span>
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
