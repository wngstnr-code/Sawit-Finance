'use client';

import Image from 'next/image';
import { Section } from '@/components/ui/primitives';
import { Reveal } from '@/components/motion/Reveal';
import RequestAccess from '@/components/site/RequestAccess';
import { useLocale } from '@/lib/i18n';

export default function AccessSection() {
  const { t, locale } = useLocale();
  return (
    <Section id="access" className="py-24 sm:py-32">
      <Reveal>
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-white/10 px-6 py-14 text-center shadow-card-lg sm:px-12 sm:py-20">
          {/* darkened plantation backdrop — lighter than the How-it-works section */}
          <div className="absolute inset-0 -z-10">
            <Image
              src="/hero/plantation.jpg"
              alt=""
              fill
              sizes="100vw"
              className="object-cover [filter:saturate(0.6)]"
            />
            <div className="absolute inset-0 bg-ink/60" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/40 to-ink/45" />
          </div>

          <div className="inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-brand-bright">
            <span className="h-px w-5 bg-brand-bright/50" />
            {t.access.eyebrow}
          </div>
          <h2
            className={`mt-4 font-display font-semibold tracking-tighter2 text-bg text-balance lg:whitespace-nowrap ${
              // ID title is longer — scale the font down so the card footprint
              // stays consistent with EN instead of wrapping to another line.
              locale === 'id' ? 'text-3xl sm:text-[2.375rem]' : 'text-4xl sm:text-5xl'
            }`}
          >
            {t.access.title}
          </h2>
          <p className="mx-auto mt-5 max-w-xl font-serif text-lg leading-relaxed text-white/75 sm:text-xl">
            {t.access.subcopyBefore}
            <span className="font-mono text-[15px] text-white">ACCOUNT_HASH</span>
            {t.access.subcopyAfter}
          </p>

          <div className="mt-9 flex items-center justify-center">
            <RequestAccess
              context="landing"
              label={t.access.cta}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-[15px] font-medium text-ink transition-all duration-200 hover:-translate-y-0.5"
            />
          </div>
          <p className="mt-5 font-mono text-[12px] text-white/45">
            {t.access.note}
          </p>
        </div>
      </Reveal>
    </Section>
  );
}
