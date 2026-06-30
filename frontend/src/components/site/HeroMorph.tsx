'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

const partners = ['Casper', 'GAPKI', 'KPBN', 'MPOB', 'FRED · IMF', 'Gemini', 'Odra'];

// Desktop splits the title left↔right to flank the shrunken card; tablet/mobile
// don't have the horizontal room, so there the title splits top↕bottom instead.
// We also track viewport height so the vertical split scales with the screen
// (a fixed px offset wouldn't clear the card on a tall iPad).
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

  // Section is 205vh → the sticky child is pinned for ~105vh (≈945px).
  // The morph runs over [0, M] and COMPLETES well before the pin releases.
  // Keep one unit per transform — framer-motion can't mix vh↔px.
  const M = 0.33; // morph end (zoom-out complete); pin still holds after this

  // The card shrinks to a small thumbnail on desktop; on tablet/mobile it stays
  // a comfortable size (the title clears it vertically instead).
  const width = useTransform(scrollYProgress, [0, M], ['100vw', isDesktop ? '24vw' : '66vw']);
  const height = useTransform(scrollYProgress, [0, M], ['100vh', isDesktop ? '42vh' : '30vh']);
  const radius = useTransform(scrollYProgress, [0, M], ['0px', '26px']);
  const cardShadow = useTransform(
    scrollYProgress,
    [M * 0.6, M],
    ['0 0 0 rgba(0,0,0,0)', '0 50px 110px -36px rgba(11,11,12,0.5)']
  );
  // darker video: heavier black overlay that only partly lifts as it shrinks
  const dark = useTransform(scrollYProgress, [0, M * 0.9], [0.66, 0.24]);

  // Title halves. Desktop → horizontal split (x); tablet/mobile → vertical (y).
  // Vertical offset is a fraction of viewport height so it clears the card on
  // any screen size (short phone or tall iPad alike).
  const vSplit = vh * 0.26;
  const leftX = useTransform(scrollYProgress, [0, M], [0, -230]);
  const rightX = useTransform(scrollYProgress, [0, M], [0, 230]);
  const upY = useTransform(scrollYProgress, [0, M], [0, -vSplit]);
  const downY = useTransform(scrollYProgress, [0, M], [0, vSplit]);
  const titleScale = useTransform(scrollYProgress, [0, M], [isDesktop ? 1.24 : 1.1, 1]);
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
                className="absolute right-1/2 origin-right whitespace-nowrap pr-[0.14em] text-right font-display text-3xl font-semibold tracking-tighter2 sm:text-4xl lg:text-[54px]"
              >
                The open
              </motion.h1>
              <motion.h1
                style={{ x: rightX, scale: titleScale, color: titleColor, textShadow: titleShadow }}
                className="absolute left-1/2 origin-left whitespace-nowrap pl-[0.14em] text-left font-display text-3xl font-semibold tracking-tighter2 sm:text-4xl lg:text-[54px]"
              >
                palm economy.
              </motion.h1>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 px-5 text-center">
              <motion.h1
                style={{ y: upY, scale: titleScale, color: titleColor, textShadow: titleShadow }}
                className="whitespace-nowrap font-display text-3xl font-semibold tracking-tighter2 sm:text-4xl md:text-5xl"
              >
                The open
              </motion.h1>
              <motion.h1
                style={{ y: downY, scale: titleScale, color: titleColor, textShadow: titleShadow }}
                className="whitespace-nowrap font-display text-3xl font-semibold tracking-tighter2 sm:text-4xl md:text-5xl"
              >
                palm economy.
              </motion.h1>
            </div>
          )}
        </div>

        {/* subcopy (serif, dark, below the card with a clear gap) */}
        <motion.p
          style={{ opacity: subOpacity }}
          className="absolute bottom-[9vh] left-1/2 z-20 max-w-xl -translate-x-1/2 px-5 text-center font-serif text-base leading-relaxed text-ink/85 sm:text-xl"
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
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-white/15 px-6 py-5 sm:gap-x-10">
            {partners.map((p) => (
              <span key={p} className="font-display text-[13px] font-medium text-white/70 sm:text-[15px]">
                {p}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
