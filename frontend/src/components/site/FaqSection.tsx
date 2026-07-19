'use client';

import { useState } from 'react';
import { Section, Eyebrow } from '@/components/ui/primitives';
import { Reveal, Stagger, StaggerItem } from '@/components/motion/Reveal';
import { useLocale } from '@/lib/i18n';

function FaqItem({
  index,
  question,
  answer,
  open,
  onToggle,
}: {
  index: number;
  question: string;
  answer: string;
  open: boolean;
  onToggle: () => void;
}) {
  const panelId = `faq-panel-${index}`;
  const buttonId = `faq-button-${index}`;
  return (
    <div className="border-b border-line">
      <h3>
        <button
          id={buttonId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex w-full items-center justify-between gap-6 rounded-lg py-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <span className="font-display text-[17px] font-medium tracking-tightish text-ink sm:text-lg">
            {question}
          </span>
          <span
            aria-hidden
            className={`relative h-5 w-5 shrink-0 text-faint transition-transform duration-300 motion-reduce:transition-none ${
              open ? 'rotate-45 text-brand' : ''
            }`}
          >
            <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-current" />
            <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-current" />
          </span>
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <p className="max-w-2xl pb-6 text-[15px] leading-relaxed text-muted">
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function FaqSection() {
  const { t } = useLocale();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <Section id="faq" className="py-24 sm:py-32">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
        <Reveal>
          <div className="lg:sticky lg:top-32">
            <Eyebrow>{t.faq.eyebrow}</Eyebrow>
            <h2 className="mt-4 font-display text-4xl font-semibold tracking-tighter2 text-ink text-balance sm:text-5xl">
              {t.faq.title}
            </h2>
            <p className="mt-5 max-w-md font-serif text-lg leading-relaxed text-muted sm:text-xl">
              {t.faq.subcopy}
            </p>
          </div>
        </Reveal>

        <Stagger className="border-t border-line">
          {t.faq.items.map((item, i) => (
            <StaggerItem key={item.q}>
              <FaqItem
                index={i}
                question={item.q}
                answer={item.a}
                open={open === i}
                onToggle={() => setOpen(open === i ? null : i)}
              />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </Section>
  );
}
