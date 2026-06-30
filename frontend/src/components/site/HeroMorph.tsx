'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

const partners = ['Casper', 'GAPKI', 'KPBN', 'MPOB', 'FRED · IMF', 'Gemini', 'Odra'];

// Desktop splits the title left↔right to flank the shrunken card. Tablet/mobile
// don't have the horizontal room, so there both halves lift UP and stack as a
// two-line title above the card, with the subcopy appearing below it. We track
// viewport height so the lift scales with the screen (clears the card on any size).
function useViewport() {
  const [vp, setVp] = useState({ isDesktop: true, h: 900 });
  useEffect(() => {
    const update = () =>
      setVp({
        isDesktop: window.matchMedia('(min-width: 1024px)').matches,
        h: window.innerHeight,
      });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return vp;
}

export default function HeroMorph() {
  const ref = useRef<HTMLDivElement>(null);
  const { isDesktop, h: vh } = useViewport();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });

  // Section is 205vh → the sticky child is pinned for ~105vh.
  // The morph runs over [0, M] and COMPLETES well before the pin releases.
  const M = 0.33;
  const width = useTransform(scrollYProgress, [0, M], ['100vw', isDesktop ? '24vw' : '70vw']);
  const height = useTransform(scrollYProgress, [0, M], ['100vh', isDesktop ? '42vh' : '30vh']);
  const radius = useTransform(scrollYProgress, [0, M], ['0px', '26px']);
  const cardShadow = useTransform(
    scrollYProgress,
    [M * 0.6, M],
    ['0 0 0 rgba(0,0,0,0)', '0 50px 110px -36px rgba(11,11,12,0.5)']
  );
  const dark = useTransform(scrollYProgress, [0, M * 0.9], [0.66, 0.24]);

  // Desktop: horizontal flank. Mobile: lift the two-line title above the card
  // (offset scales with viewport height so it clears the card on any screen).
  const leftX = useTransform(scrollYProgress, [0, M], [0, -230]);
  const rightX = useTransform(scrollYProgress, [0, M], [0, 230]);
  const titleY = useTransform(scrollYProgress, [0, M], [0, -(vh * 0.26)]);
  const titleScale = useTransform(scrollYProgress, [0, M], [isDesktop ? 1.24 : 1.04, 1]);
  const titleColor = useTransform(scrollYProgress, [M * 0.25, M * 0.8], ['#ffffff', '#0b0b0c']);
  const titleShadow = useTransform(
    scrollYProgress,
    [0, M * 0.7],
    ['0 2px 30px rgba(0,0,0,0.6)', '0 2px 30px rgba(0,0,0,0)']
  );

  const subOpacity = useTransform(scrollYProgress, [M * 0.85, M], [0, 1]);
  const chromeOpacity = useTransform(scrollYProgress, [0, M * 0.25], [1, 0]);

  return (
    <section ref={ref} className="relative h-[205vh]">
      <div className="sticky top-0 grid h-screen place-items-center overflow-hidden bg-bg">
        {/* morphing video card (single layer, plays once then freezes) */}
        <motion.div
          style={{ width, height, borderRadius: radius, boxShadow: cardShadow }}
          className="relative z-10 overflow-hidden"
        >
          <video
            className="absolute inset-0 h-full w-full object-cover [filter:saturate(0.7)_brightness(0.78)]"
            src="/hero/hero.mp4"
            poster="/hero/hero-poster.jpg"
            autoPlay
            muted
            playsInline
            preload="auto"
          />
          <motion.div style={{ opacity: dark }} className="absolute inset-0 bg-ink" />
        </motion.div>

        {/* split title */}
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          {isDesktop ? (
            <div className="relative mx-auto flex w-full max-w-content items-center justify-center px-5">
              <motion.h1
                style={{ x: leftX, scale: titleScale, color: titleColor, textShadow: titleShadow }}
                className="absolute right-1/2 origin-right whitespace-nowrap pr-[0.14em] text-right font-display text-4xl font-semibold tracking-tighter2 lg:text-[54px]"
              >
                The open
              </motion.h1>
              <motion.h1
                style={{ x: rightX, scale: titleScale, color: titleColor, textShadow: titleShadow }}
                className="absolute left-1/2 origin-left whitespace-nowrap pl-[0.14em] text-left font-display text-4xl font-semibold tracking-tighter2 lg:text-[54px]"
              >
                palm economy.
              </motion.h1>
            </div>
          ) : (
            <motion.div
              style={{ y: titleY }}
              className="flex flex-col items-center gap-1 px-5 text-center"
            >
              <motion.h1
                style={{ scale: titleScale, color: titleColor, textShadow: titleShadow }}
                className="whitespace-nowrap font-display font-semibold leading-[1.04] tracking-tighter2 text-[clamp(1.9rem,9vw,3.25rem)]"
              >
                The open
              </motion.h1>
              <motion.h1
                style={{ scale: titleScale, color: titleColor, textShadow: titleShadow }}
                className="whitespace-nowrap font-display font-semibold leading-[1.04] tracking-tighter2 text-[clamp(1.9rem,9vw,3.25rem)]"
              >
                palm economy.
              </motion.h1>
            </motion.div>
          )}
        </div>

        {/* subcopy (appears below the card) */}
        <motion.p
          style={{ opacity: subOpacity }}
          className="absolute bottom-[16vh] left-1/2 z-20 w-full max-w-lg -translate-x-1/2 px-6 text-center font-serif text-[15px] leading-relaxed text-ink/85 sm:bottom-[9vh] sm:max-w-xl sm:text-xl"
        >
          Verified Indonesian palm oil, tokenized as SAWIT — yielding CSPR,
          on-chain, driven by autonomous AI agents.
        </motion.p>

        {/* scroll hint + static partner row (before scroll) */}
        <motion.div
          style={{ opacity: chromeOpacity }}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20"
        >
          <div className="mb-4 text-center text-[12px] uppercase tracking-[0.18em] text-white/80">
            Scroll to explore ↓
          </div>
          <div className="flex flex-nowrap items-center justify-center gap-x-2.5 overflow-x-auto border-t border-white/15 px-4 py-4 sm:flex-wrap sm:gap-x-10 sm:px-6 sm:py-5">
            {partners.map((p) => (
              <span key={p} className="whitespace-nowrap font-display text-[10px] font-medium text-white/70 sm:text-[15px]">
                {p}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
