'use client';

import Image from 'next/image';
import { Reveal, Stagger, StaggerItem } from '@/components/motion/Reveal';
import { useLocale } from '@/lib/i18n';

const stack = ['Casper', 'Odra', 'x402', 'Gemini 2.5', 'CSPR.cloud', 'CEP-18'];

export default function TechSection() {
  const { t } = useLocale();
  const agents = t.tech.agents;
  return (
    <section id="agents" className="relative isolate flex min-h-screen flex-col justify-center overflow-hidden bg-ink py-28 sm:py-36">
      <div className="absolute inset-0 -z-10 opacity-30">
        <Image
          src="/hero/plantation.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover [filter:saturate(0.4)]"
        />
        <div className="absolute inset-0 bg-ink/80" />
        <div className="absolute inset-0 bg-gradient-to-b from-ink via-ink/70 to-ink" />
      </div>

      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <Reveal>
          <div className="inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-brand-bright">
            <span className="h-px w-5 bg-brand-bright/50" />
            {t.tech.eyebrow}
          </div>
          <h2 className="mt-4 max-w-2xl font-display text-4xl font-semibold tracking-tighter2 text-bg text-balance sm:text-5xl">
            {t.tech.title}
          </h2>
          <p className="mt-5 max-w-xl font-serif text-lg leading-relaxed text-white/65 sm:text-xl">
            {t.tech.subcopy}
          </p>
        </Reveal>

        <Stagger className="mt-14 grid gap-5 md:grid-cols-3">
          {agents.map((a) => (
            <StaggerItem
              key={a.name}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm"
            >
              <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-brand-bright">
                {a.role}
              </div>
              <h3 className="mt-2 font-display text-xl font-semibold text-bg">
                {a.name}
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed text-white/55">
                {a.body}
              </p>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal delay={0.1}>
          <div className="mt-16 flex flex-wrap items-center gap-x-10 gap-y-4 border-t border-white/10 pt-8">
            <span className="text-[12px] uppercase tracking-[0.14em] text-white/40">
              {t.tech.builtWith}
            </span>
            {stack.map((s) => (
              <span
                key={s}
                className="font-display text-[15px] font-medium text-white/55"
              >
                {s}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
