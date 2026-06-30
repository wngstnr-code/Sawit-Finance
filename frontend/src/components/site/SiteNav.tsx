'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const links = [
  { label: 'How it works', href: '#how' },
  { label: 'Real-world asset', href: '#rwa' },
  { label: 'AI agents', href: '#agents' },
  { label: 'On-chain', href: '#proof' },
];

export default function SiteNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4 sm:pt-5">
      <nav
        className={`flex w-full max-w-content items-center justify-between gap-4 rounded-2xl px-4 py-3 transition-all duration-300 sm:px-6 sm:py-4 ${
          scrolled ? 'bg-ink/95 shadow-nav backdrop-blur-md' : 'bg-transparent'
        }`}
      >
        <Link href="/" className="flex items-center gap-2.5 pl-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sawit-fi-icon-white.svg" alt="" className="h-10 w-10 sm:h-11 sm:w-11" />
          <span className="whitespace-nowrap font-display text-[18px] tracking-tightish text-white sm:text-[19px]">
            <span className="font-semibold">Sawit</span>
            <span className="font-light text-white/55 max-[360px]:hidden"> Finance</span>
          </span>
        </Link>

        {/* desktop links */}
        <div className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[14px] text-white/75 transition-colors hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </div>

        <Link
          href="/app"
          className="whitespace-nowrap rounded-lg bg-white px-4 py-2.5 text-[14px] font-medium text-ink transition-transform hover:-translate-y-0.5 sm:px-5"
        >
          Launch<span className="hidden sm:inline"> App</span>
        </Link>
      </nav>
    </header>
  );
}
