'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { shortHash } from '@/lib/format';
import { useLocale } from '@/lib/i18n';
import LangToggle from '@/components/site/LangToggle';
import { InvestorProvider, useInvestor } from './investor';
import { CopyButton } from './shared';

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <InvestorProvider>
      <Shell>{children}</Shell>
    </InvestorProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <TopNav />
      <main className="flex-1 px-5 pb-20 pt-8 sm:px-8">
        <div className="mx-auto w-full max-w-content">{children}</div>
      </main>
      <AppFooter />
    </div>
  );
}

function TopNav() {
  const { t } = useLocale();
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === '/app' ? pathname === '/app' : pathname.startsWith(href);
  const toolsActive = pathname.startsWith('/app/tools');

  const NAV = [
    { label: t.app.nav.explore, href: '/app' },
    { label: t.app.nav.portfolio, href: '/app/portfolio' },
  ];
  const TOOLS = [
    { label: t.app.nav.claimYield, href: '/app/tools/claim', desc: t.app.nav.claimYieldDesc },
    { label: t.app.nav.verifyKyc, href: '/app/tools/kyc', desc: t.app.nav.verifyKycDesc },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-20 w-full max-w-content items-center justify-between px-5 sm:px-8">
        {/* left — logo (landing size/font) */}
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sawit-fi-icon-black.svg" alt="" className="h-10 w-10 sm:h-11 sm:w-11" />
          <span className="whitespace-nowrap font-display text-[18px] tracking-tightish text-ink sm:text-[19px]">
            <span className="font-semibold">Sawit</span>
            <span className="font-light text-muted"> Finance</span>
          </span>
        </Link>

        {/* center — menu */}
        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`pb-1 text-[14px] transition-colors ${
                isActive(n.href)
                  ? 'border-b-2 border-brand font-medium text-ink'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {n.label}
            </Link>
          ))}

          {/* Tools dropdown */}
          <div className="group relative">
            <button
              className={`flex items-center gap-1 pb-1 text-[14px] transition-colors ${
                toolsActive
                  ? 'border-b-2 border-brand font-medium text-ink'
                  : 'text-muted group-hover:text-ink'
              }`}
            >
              {t.app.nav.tools}
              <span className="text-[9px] transition-transform group-hover:rotate-180">▾</span>
            </button>
            <div className="invisible absolute left-1/2 top-full z-40 -translate-x-1/2 pt-3 opacity-0 transition-all group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              <div className="w-64 overflow-hidden rounded-xl border border-line bg-card shadow-card-lg">
                {TOOLS.map((tool) => (
                  <Link
                    key={tool.href}
                    href={tool.href}
                    className={`block px-4 py-3 transition-colors hover:bg-bg-2 ${
                      pathname.startsWith(tool.href) ? 'bg-bg-2' : ''
                    }`}
                  >
                    <div className="text-[13px] font-medium text-ink">{tool.label}</div>
                    <div className="mt-0.5 text-[12px] text-muted">{tool.desc}</div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </nav>

        {/* right — snapshot badge + language + wallet */}
        <div className="flex items-stretch gap-2.5">
          <SnapshotBadge />
          <LangToggle variant="footer" />
          <WalletMenu />
        </div>
      </div>

      {/* mobile menu row */}
      <nav className="flex items-center justify-center gap-6 overflow-x-auto border-t border-line px-5 py-3 md:hidden">
        {[...NAV, ...TOOLS].map((n) => {
          const active = n.href === '/app' ? pathname === '/app' : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`whitespace-nowrap pb-0.5 text-[14px] ${
                active ? 'border-b-2 border-brand font-medium text-ink' : 'text-muted'
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

function SnapshotBadge() {
  const { t } = useLocale();
  const { isSnapshot } = useInvestor();
  if (!isSnapshot) return null;
  return (
    <div
      title={t.app.nav.snapshotBadge}
      className="hidden items-center rounded-lg border border-line bg-bg-2 px-3 py-2.5 text-[11px] font-medium text-faint sm:flex"
    >
      {t.app.nav.snapshotBadge}
    </div>
  );
}

function WalletMenu() {
  const { t } = useLocale();
  const { publicKey, connected, ready, connect, disconnect } = useInvestor();
  const [open, setOpen] = useState(false);

  if (!connected) {
    return (
      <button
        onClick={connect}
        disabled={!ready}
        className="flex items-center rounded-lg bg-ink px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-ink/90 disabled:opacity-50"
      >
        {ready ? t.app.connect.connect : t.app.connect.loading}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 font-mono text-[13px] text-white transition-colors hover:bg-ink/90"
      >
        <span className="hidden sm:inline">{shortHash(publicKey, 4, 4)}</span>
        <span className="sm:hidden">{shortHash(publicKey, 3, 3)}</span>
        <span className={`text-[9px] text-white/60 transition-transform ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>

      {open && (
        <>
          {/* click-away */}
          <button
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 top-full z-50 mt-3 w-52 overflow-hidden rounded-xl border border-line bg-card shadow-card-lg">
            <div className="border-b border-line px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-faint">{t.app.nav.connected}</div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="break-all font-mono text-[12px] text-ink">
                  {shortHash(publicKey, 6, 6)}
                </span>
                <CopyButton text={publicKey ?? ''} />
              </div>
            </div>
            <button
              onClick={() => {
                setOpen(false);
                disconnect();
              }}
              className="block w-full px-4 py-3 text-left text-[13px] text-orange transition-colors hover:bg-bg-2"
            >
              {t.app.nav.disconnect}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function AppFooter() {
  const { t } = useLocale();
  return (
    <footer className="border-t border-line bg-bg-2/40">
      <div className="mx-auto flex w-full max-w-content flex-wrap items-center justify-between gap-3 px-5 py-6 text-[12px] text-faint sm:px-8">
        <span>© 2026 Sawit Finance</span>
        <div className="flex items-center gap-4">
          <Link href="/" className="hover:text-ink">
            {t.app.nav.backToSite}
          </Link>
        </div>
      </div>
    </footer>
  );
}
