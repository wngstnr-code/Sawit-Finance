'use client';

import { motion } from 'framer-motion';
import { Reveal } from '@/components/motion/Reveal';

export default function BridgeSection() {
  return (
    <section className="relative overflow-hidden bg-ink py-28 text-center sm:py-36">
      <svg
        className="pointer-events-none absolute left-1/2 top-0 -z-0 h-[120%] w-[140%] -translate-x-1/2"
        viewBox="0 0 1000 600"
        fill="none"
      >
        {[0, 1, 2, 3].map((i) => (
          <motion.ellipse
            key={i}
            cx="500"
            cy="640"
            rx={260 + i * 130}
            ry={220 + i * 110}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: i * 0.15 }}
          />
        ))}
      </svg>

      <div className="relative mx-auto w-full max-w-content px-5 sm:px-8">
        <Reveal>
          <div className="inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-brand-bright">
            <span className="h-px w-5 bg-brand-bright/50" />
            The bridge
          </div>
          <h2 className="mx-auto mt-5 max-w-3xl font-display text-4xl font-semibold leading-[1.05] tracking-tighter2 text-bg text-balance sm:text-6xl">
            Building the bridge between
            <br />
            commodities & DeFi.
          </h2>
          <p className="mx-auto mt-6 max-w-xl font-serif text-lg leading-relaxed text-white/65 sm:text-xl">
            Indonesia’s commodity backbone, made programmable — production,
            minting, and yield, all on Casper.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
