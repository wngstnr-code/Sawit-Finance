'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount } from '@/lib/useAccount';
import { useSawitBalance } from '@/lib/useSawitBalance';
import { useChainState } from '@/lib/useChainState';
import { buildClaimTransaction } from '@/lib/claim';
import {
  CONTRACTS,
  SAWIT_DECIMALS,
  CSPR_DECIMALS,
  type ContractState,
} from '@/lib/config';
import {
  fromBaseUnits,
  fmtAmount,
  fmtUsdFromCents,
  bpsToPct,
  shortHash,
} from '@/lib/format';
import RequestAccess from '@/components/site/RequestAccess';
import { LineTrend } from '@/components/ui/LineTrend';
import { useCpoHistory } from '@/lib/useCpoHistory';
import { LOOP_STEPS, txUrl, pkgUrl } from '@/lib/onchain';

type Tab = 'overview' | 'yield' | 'market' | 'activity';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'yield', label: 'Yield' },
  { id: 'market', label: 'Market' },
  { id: 'activity', label: 'Activity' },
];

type ClaimPhase =
  | { phase: 'idle' }
  | { phase: 'signing' }
  | { phase: 'sent'; hash: string }
  | { phase: 'error'; message: string };

type BandItem = { label: string; value: string; sub?: string; accent?: boolean };

/* ─────────────────────────── derived helpers ─────────────────────────── */

function useDerived(state: ContractState | null, balance: number | null) {
  return useMemo(() => {
    const supply = state ? Number(state.total_sawit_supply) : 0;
    const share = balance && supply ? balance / supply : 0;
    const distributed = state
      ? fromBaseUnits(state.total_distributed_cspr, CSPR_DECIMALS)
      : 0;
    const estYield = share * distributed;
    const cpoValueM = state
      ? (state.total_tons_cpo * state.latest_cpo_price_cents) / 100 / 1_000_000
      : 0;
    // projected yield to holders, derived live from on-chain GORR × production
    const revenueToHolders = state
      ? cpoValueM * 1_000_000 * (state.gorr_bps / 10000)
      : 0;
    const projPerSawit = supply ? revenueToHolders / supply : 0;
    const daysLeft = state?.latest_epoch_claim_deadline_ms
      ? Math.max(0, Math.ceil((state.latest_epoch_claim_deadline_ms - Date.now()) / 86_400_000))
      : null;
    return { supply, share, distributed, estYield, cpoValueM, revenueToHolders, projPerSawit, daysLeft };
  }, [state, balance]);
}

/* ─────────────────────────── root ─────────────────────────── */

export default function InvestorDashboard() {
  const { clickRef, publicKey, connected, ready, connect, disconnect } =
    useAccount();
  const state = useChainState();
  const { balance, loading: balLoading, reload } = useSawitBalance(publicKey);
  const [tab, setTab] = useState<Tab>('overview');
  const [claim, setClaim] = useState<ClaimPhase>({ phase: 'idle' });
  const d = useDerived(state, balance);

  async function handleClaim() {
    if (!clickRef || !publicKey || !state) return;
    try {
      setClaim({ phase: 'signing' });
      const tx = buildClaimTransaction(publicKey, state.current_distribution_epoch);
      const res = await clickRef.send(tx.toJSON() as unknown as object, publicKey);
      const hash =
        (res as { transactionHash?: string; deployHash?: string })?.transactionHash ||
        (res as { deployHash?: string })?.deployHash;
      if (hash) {
        setClaim({ phase: 'sent', hash });
        setTimeout(reload, 4000);
      } else {
        setClaim({ phase: 'error', message: 'Cancelled or not submitted.' });
      }
    } catch (e) {
      setClaim({ phase: 'error', message: String(e) });
    }
  }

  return (
    <div className="min-h-screen bg-bg-2/40">
      {/* top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-20 w-full max-w-content items-center justify-between gap-4 px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/sawit-fi-icon-black.svg" alt="" className="h-11 w-11" />
              <span className="font-display text-[19px] tracking-tightish text-ink">
                <span className="font-semibold">Sawit</span>
                <span className="font-light text-muted"> Finance</span>
              </span>
            </Link>
          </div>

          {connected && (
            <nav className="hidden items-center gap-7 md:flex">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative text-[13px] font-medium tracking-wide transition-colors ${
                    tab === t.id ? 'text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {t.label}
                  {tab === t.id && (
                    <motion.span
                      layoutId="tab-underline"
                      className="absolute -bottom-1.5 left-0 right-0 h-0.5 rounded-full bg-ink"
                    />
                  )}
                </button>
              ))}
            </nav>
          )}

          <div className="flex items-center gap-3">
            {connected ? (
              <button
                onClick={disconnect}
                className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-bg shadow-pill transition-transform hover:-translate-y-0.5"
              >
                <span className="[font-family:Menlo,monospace] tabular-nums">{shortHash(publicKey, 6, 6)}</span>
              </button>
            ) : (
              <button
                onClick={connect}
                disabled={!ready}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg shadow-pill transition-transform hover:-translate-y-0.5 disabled:opacity-50"
              >
                {ready ? 'Connect Wallet' : 'Loading…'}
              </button>
            )}
          </div>
        </div>

        {connected && (
          <div className="flex gap-5 overflow-x-auto border-t border-line px-5 py-2.5 md:hidden">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`whitespace-nowrap text-[13px] font-medium ${
                  tab === t.id ? 'text-ink' : 'text-muted'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {!connected ? (
        <ConnectGate ready={ready} onConnect={connect} />
      ) : (
        <>
          <DashboardBand tab={tab} publicKey={publicKey} balance={balance} balLoading={balLoading} state={state} d={d} />
          <main className="mx-auto w-full max-w-content px-5 py-10 sm:px-8 sm:py-12">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                {tab === 'overview' && <OverviewPanel state={state} balance={balance} d={d} onGoYield={() => setTab('yield')} />}
                {tab === 'yield' && <YieldPanel state={state} balance={balance} d={d} claim={claim} onClaim={handleClaim} />}
                {tab === 'market' && <MarketPanel state={state} d={d} />}
                {tab === 'activity' && <ActivityPanel />}
              </motion.div>
            </AnimatePresence>
          </main>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────── connect gate ─────────────────────────── */

function ConnectGate({ ready, onConnect }: { ready: boolean; onConnect: () => void }) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-content flex-col items-center justify-center px-5 py-20 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-ink">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/sawit-fi-icon-white.svg" alt="" className="h-10 w-10" />
      </div>
      <h1 className="mt-6 font-display text-3xl font-semibold tracking-tighter2 text-ink sm:text-4xl">
        Your palm-oil portfolio
      </h1>
      <p className="mt-3 max-w-md font-serif text-lg leading-relaxed text-muted">
        Connect a Casper wallet to view your SAWIT holdings and claim CSPR yield
        from verified Indonesian palm-oil production.
      </p>
      <button
        onClick={onConnect}
        disabled={!ready}
        className="mt-8 rounded-lg bg-ink px-7 py-3 text-sm font-medium text-bg shadow-pill transition-transform hover:-translate-y-0.5 disabled:opacity-50"
      >
        {ready ? 'Connect Wallet' : 'Loading…'}
      </button>
      <Link href="/" className="mt-4 text-sm text-muted transition-colors hover:text-ink">
        ← Back to site
      </Link>
    </div>
  );
}

/* ─────────────────────────── contextual dark band ─────────────────────────── */

function DashboardBand({
  tab,
  publicKey,
  balance,
  balLoading,
  state,
  d,
}: {
  tab: Tab;
  publicKey?: string;
  balance: number | null;
  balLoading: boolean;
  state: ContractState | null;
  d: ReturnType<typeof useDerived>;
}) {
  const sawit = balLoading ? '…' : balance === null ? '—' : fmtAmount(fromBaseUnits(String(balance), SAWIT_DECIMALS));

  const eyebrow: Record<Tab, string> = {
    overview: 'Protocol console · Your position',
    yield: 'Yield · distribution',
    market: 'Market · live fundamentals',
    activity: 'Activity · network',
  };

  const items: BandItem[] =
    tab === 'overview'
      ? [
          { label: 'Your SAWIT', value: sawit, sub: shortHash(publicKey, 6, 6), accent: true },
          { label: 'Share of supply', value: d.share ? `${(d.share * 100).toFixed(3)}%` : '0%', sub: d.supply ? `of ${fmtAmount(d.supply)} SAWIT` : '—' },
          { label: 'Est. CSPR yield', value: fmtAmount(d.estYield, 4), sub: 'accrued, pro-rata' },
          { label: 'Oracle reputation', value: state ? `${state.oracle_reputation}/100` : '—', sub: state ? `${state.oracle_submission_count} submissions` : '…' },
        ]
      : tab === 'yield'
      ? [
          { label: 'Total distributed', value: `${fmtAmount(d.distributed, 2)}`, sub: 'CSPR · all epochs' },
          { label: 'Projected yield', value: `$${d.projPerSawit.toFixed(2)}`, sub: 'per SAWIT · live GORR', accent: true },
          { label: 'Distribution epoch', value: state ? `#${state.current_distribution_epoch}` : '—', sub: state?.latest_epoch_funded ? 'funded' : 'none' },
          { label: 'Days left', value: d.daysLeft === null ? '—' : `${d.daysLeft}d`, sub: '90-day window' },
        ]
      : tab === 'market'
      ? [
          { label: 'Verified CPO value', value: `$${d.cpoValueM.toFixed(2)}M`, sub: 'recorded on-chain' },
          { label: 'SAWIT supply', value: state ? fmtAmount(Number(state.total_sawit_supply)) : '—', sub: 'minted from CPO', accent: true },
          { label: 'CPO price (live)', value: state ? fmtUsdFromCents(state.latest_cpo_price_cents) : '—', sub: 'FRED/IMF · per ton' },
          { label: 'CPO recorded', value: state ? `${fmtAmount(state.total_tons_cpo)} t` : '—', sub: state ? `${state.epoch_count} epoch(s)` : '…' },
        ]
      : [
          { label: 'Epochs recorded', value: state ? `${state.epoch_count}` : '—', sub: 'production epochs' },
          { label: 'Latest epoch', value: state?.latest_epoch_label || '—', sub: state ? `${fmtAmount(state.latest_tons_cpo)} t` : '…' },
          { label: 'Contracts live', value: '4', sub: 'upgradable packages' },
          { label: 'Network status', value: 'Operational', sub: 'casper-test', accent: true },
        ];

  return (
    <section className="relative isolate overflow-hidden bg-ink">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.06]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hero/plantation.jpg" alt="" className="h-full w-full object-cover" />
      </div>
      <div className="mx-auto w-full max-w-content px-5 py-9 sm:px-8 sm:py-11">
        <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-brand-bright">
          <span className="h-px w-5 bg-brand-bright/50" />
          {eyebrow[tab]}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-y-7 lg:grid-cols-4">
          {items.map((it, i) => (
            <div
              key={it.label}
              className={`px-0 lg:px-7 ${i > 0 ? 'lg:border-l lg:border-white/10' : ''} ${i === 0 ? 'lg:pl-0' : ''}`}
            >
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/40">
                {it.label}
              </div>
              <div className={`mt-2 font-display text-3xl tracking-tightish tabular-nums sm:text-[34px] ${it.accent ? 'text-brand-bright' : 'text-bg'}`}>
                {it.value}
              </div>
              {it.sub && <div className="mt-1.5 font-mono text-[12px] text-white/45">{it.sub}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── overview ─────────────────────────── */

const YIELD_STEPS = [
  { t: 'Hold SAWIT', d: 'Keep a balance in your wallet.' },
  { t: 'Oracle sync', d: 'Mill revenue verified on-chain.' },
  { t: 'Epoch ends', d: 'Pro-rata calculation finalized.' },
  { t: 'Claim', d: 'Withdraw CSPR to your wallet.' },
];

function OverviewPanel({
  state,
  balance,
  d,
  onGoYield,
}: {
  state: ContractState | null;
  balance: number | null;
  d: ReturnType<typeof useDerived>;
  onGoYield: () => void;
}) {
  const funded = Boolean(state?.latest_epoch_funded);
  const hasSawit = (balance ?? 0) > 0;
  return (
    <div>
      <PanelHeading eyebrow="Your position" title="A claim on real palm-oil revenue." />
      <div className="mt-6 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
          <MiniCard
            label="SAWIT held"
            value={balance === null ? '—' : fmtAmount(fromBaseUnits(String(balance), SAWIT_DECIMALS))}
            sub="CEP-18 · live balance"
            accent
          />
          <MiniCard label="Compliance" value="KYC" sub="verified cross-contract at claim" pill={funded ? 'Required to claim' : undefined} />
          <MiniCard
            label="Claim window"
            value={funded ? 'Open' : 'None'}
            sub={funded ? `distribution epoch ${state?.current_distribution_epoch}` : 'awaiting a funded epoch'}
            accent={funded}
          />
          <MiniCard label="Yield asset" value="CSPR" sub="USD-stablecoin yield on roadmap" />
        </div>

        <div className="mt-6 rounded-2xl border border-line bg-card p-7 shadow-card">
          <div className="font-display text-lg font-semibold text-ink">How your yield works</div>
          <ol className="mt-7 grid gap-7 sm:grid-cols-4 sm:gap-4">
            {YIELD_STEPS.map((s, i) => (
              <li key={s.t} className="relative">
                {i < 3 && <span className="absolute left-8 right-0 top-3.5 hidden h-px bg-line sm:block" />}
                <span className="relative z-10 grid h-7 w-7 place-items-center rounded-full bg-ink font-mono text-[12px] text-bg">
                  {i + 1}
                </span>
                <div className="mt-3 text-[14px] font-semibold text-ink">{s.t}</div>
                <div className="mt-1 text-[13px] leading-snug text-muted">{s.d}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* aside: next action (holders) OR get started (no SAWIT yet) */}
      {hasSawit ? (
        <aside className="flex flex-col rounded-2xl border border-line bg-card p-7 shadow-card">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">Next action</div>
          <div className="mt-4 grid h-12 w-12 place-items-center rounded-full bg-brand-tint text-brand">
            <CoinIcon />
          </div>
          <div className="mt-5 font-display text-2xl font-semibold tracking-tightish text-ink">
            {funded ? 'Claim available' : 'No open distribution'}
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-muted">
            {funded
              ? 'Your accrued CSPR for this distribution epoch is within its claim window.'
              : 'When the Yield Router funds the next epoch, your claimable CSPR appears here.'}
          </p>

          {funded && (
            <div className="mt-5 rounded-xl bg-bg-2 p-4 font-mono text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-muted">Amount</span>
                <span className="text-ink">{fmtAmount(d.estYield, 4)} CSPR</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-muted">Est. gas</span>
                <span className="text-ink">~3 CSPR</span>
              </div>
            </div>
          )}

          <button
            onClick={onGoYield}
            className="mt-6 w-full rounded-lg bg-ink px-5 py-3 text-sm font-medium text-bg transition-transform hover:-translate-y-0.5"
          >
            Go to Yield →
          </button>
        </aside>
      ) : (
        <aside className="flex flex-col rounded-2xl border border-line bg-card p-7 shadow-card">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">Get started</div>
          <div className="mt-2 font-display text-2xl font-semibold tracking-tightish text-ink">
            You don&rsquo;t hold SAWIT yet.
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-muted">
            SAWIT isn&rsquo;t sold on an exchange. A licensed operator onboards
            verified investors and issues tokens against real production.
          </p>

          <ol className="mt-5 space-y-3">
            {[
              ['Request access', 'Share your intended allocation.'],
              ['Complete KYC', 'Verified by the licensed operator.'],
              ['Receive allocation', 'SAWIT issued to this wallet.'],
            ].map(([t, dsc], i) => (
              <li key={t} className="flex gap-3">
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-ink font-mono text-[11px] text-bg">
                  {i + 1}
                </span>
                <div>
                  <div className="text-[13px] font-semibold text-ink">{t}</div>
                  <div className="text-[12px] text-muted">{dsc}</div>
                </div>
              </li>
            ))}
          </ol>

          <RequestAccess
            context="dashboard"
            className="mt-6 w-full rounded-lg bg-ink px-5 py-3 text-center text-sm font-medium text-bg transition-transform hover:-translate-y-0.5"
          />
          <p className="mt-3 text-center font-mono text-[11px] text-faint">
            Primary issuance · KYC-gated
          </p>
        </aside>
      )}
      </div>
    </div>
  );
}

/* ─────────────────────────── yield / claim ─────────────────────────── */

function YieldPanel({
  state,
  balance,
  d,
  claim,
  onClaim,
}: {
  state: ContractState | null;
  balance: number | null;
  d: ReturnType<typeof useDerived>;
  claim: ClaimPhase;
  onClaim: () => void;
}) {
  const funded = Boolean(state?.latest_epoch_funded);
  const signing = claim.phase === 'signing';

  return (
    <div>
      <PanelHeading eyebrow="Yield · claim" title="Claim your CSPR yield." />
      <div className="mt-6 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
          <div className="bg-gradient-to-b from-ink/[0.06] to-transparent p-8 text-center">
            <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-brand">
              Estimated claimable (pro-rata)
            </div>
            <div className="mt-3 font-display text-6xl font-semibold tracking-tighter2 text-ink tabular-nums">
              {fmtAmount(d.estYield, 4)}
              <span className="ml-2 align-middle text-2xl text-muted">CSPR</span>
            </div>
            <div className="mt-2 text-[13px] text-muted">
              {d.share
                ? `${(d.share * 100).toFixed(3)}% of ${fmtAmount(d.distributed, 2)} CSPR distributed`
                : 'Hold SAWIT to accrue yield. Exact claimable is computed on-chain.'}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-px border-y border-line bg-line">
            <CellStat label="Current epoch" value={state ? `#${state.epoch_count}` : '—'} />
            <CellStat label="Distribution epoch" value={state ? `#${state.current_distribution_epoch}` : '—'} />
            <CellStat label="Days left" value={d.daysLeft === null ? '—' : `${d.daysLeft}d`} />
          </div>

          <div className="p-7">
            <button
              onClick={onClaim}
              disabled={!funded || signing || !state}
              className="w-full rounded-lg bg-ink px-5 py-3.5 text-sm font-medium text-bg transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {signing ? 'Confirm in your wallet…' : funded ? 'Claim CSPR yield' : 'No open distribution'}
            </button>

            {claim.phase === 'sent' && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand-tint/50 p-4 text-[13px] text-ink">
                <span className="inline-flex items-center gap-2">
                  <CheckIcon /> Claim submitted.
                </span>
                <a href={txUrl(claim.hash)} target="_blank" rel="noopener noreferrer" className="font-mono text-brand underline-offset-2 hover:underline">
                  {shortHash(claim.hash, 8, 6)} ↗
                </a>
              </div>
            )}
            {claim.phase === 'error' && (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-[13px] text-amber-700">
                {claim.message}
              </div>
            )}

            <p className="mt-4 text-center text-[12px] leading-relaxed text-faint">
              Claims are KYC-gated and sent from your connected wallet. Gas fees apply on Casper.
            </p>
          </div>
        </div>
      </div>

      <aside className="space-y-4">
        <MiniCard label="Total distributed" value={`${fmtAmount(d.distributed, 2)} CSPR`} sub="cumulative, all epochs" accent />
        <MiniCard
          label="Your SAWIT"
          value={balance === null ? '—' : fmtAmount(fromBaseUnits(String(balance), SAWIT_DECIMALS))}
          sub="drives your pro-rata share"
        />
        <MiniCard label="Projected yield" value={`$${d.projPerSawit.toFixed(2)}`} sub="per SAWIT · live GORR × production" />
      </aside>
      </div>
    </div>
  );
}

/* ─────────────────────────── market ─────────────────────────── */

function MarketPanel({ state, d }: { state: ContractState | null; d: ReturnType<typeof useDerived> }) {
  const hist = useCpoHistory();
  const stats: { label: string; value: string; sub?: string; accent?: boolean }[] = state
    ? [
        { label: 'SAWIT supply', value: fmtAmount(fromBaseUnits(state.total_sawit_supply, SAWIT_DECIMALS)), sub: 'minted from CPO', accent: true },
        { label: 'Verified CPO value', value: `$${d.cpoValueM.toFixed(2)}M`, sub: 'recorded on-chain' },
        { label: 'CPO price (live)', value: fmtUsdFromCents(state.latest_cpo_price_cents), sub: 'FRED/IMF · per ton' },
        { label: 'CPO recorded', value: `${fmtAmount(state.total_tons_cpo)} t`, sub: `${state.epoch_count} epoch(s)` },
        { label: 'GORR', value: bpsToPct(state.gorr_bps), sub: `${state.token_rate} SAWIT / ton` },
        { label: 'Oracle reputation', value: `${state.oracle_reputation}/100`, sub: `score ${state.latest_validation_score}/100 latest` },
        { label: 'Yield distributed', value: `${fmtAmount(fromBaseUnits(state.total_distributed_cspr, CSPR_DECIMALS))} CSPR`, sub: `epoch ${state.current_distribution_epoch}` },
        { label: 'Latest epoch', value: state.latest_epoch_label || '—', sub: `${fmtAmount(state.latest_tons_cpo)} t recorded` },
      ]
    : [];

  return (
    <div>
      <PanelHeading eyebrow="Market · fundamentals" title="The real asset behind SAWIT." />
      {state ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {stats.map((s) => (
              <MiniCard key={s.label} {...s} />
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-line bg-card p-7 shadow-card">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">
                Palm oil price · FRED/IMF (5-year history)
              </div>
              {hist && (
                <span className="rounded-md bg-brand px-2.5 py-1 font-mono text-[11px] text-white">
                  {hist.change_pct >= 0 ? '+' : ''}
                  {hist.change_pct}% · 5y
                </span>
              )}
            </div>
            <div className="mt-5 h-40">
              <LineTrend id="mkt" data={hist?.series.map((p) => p.price)} />
            </div>
          </div>
        </>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[104px] animate-pulse rounded-2xl border border-line bg-white/60" />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── activity ─────────────────────────── */

function ActivityPanel() {
  return (
    <div>
      <PanelHeading eyebrow="Activity · proof" title="The full economic audit trail." />
      <div className="mt-6 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-brand">
            <span className="h-px w-5 bg-brand/40" />
            Transactions
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {LOOP_STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-line bg-card p-6 shadow-card">
              <div className="flex items-start justify-between">
                <h3 className="font-display text-lg font-semibold text-ink">{s.title}</h3>
                <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-ink font-mono text-[13px] font-semibold text-bg">
                  {s.n}
                </span>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">{s.desc}</p>
              <a
                href={txUrl(s.tx)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex items-center justify-between border-t border-line pt-3 font-mono text-[12px] text-brand transition-colors hover:text-ink"
              >
                <span>{s.entrypoint}</span>
                <span>{s.tx.slice(0, 10)}… ↗</span>
              </a>
            </div>
          ))}
        </div>
      </div>

      <aside>
        <div className="inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-brand">
          <span className="h-px w-5 bg-brand/40" />
          Contracts
        </div>
        <div className="mt-6 space-y-2">
          {Object.entries(CONTRACTS).map(([name, hash]) => (
            <a
              key={name}
              href={pkgUrl(hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 shadow-card transition-colors hover:border-brand/40"
            >
              <span className="grid h-8 w-8 flex-none place-items-center text-ink">
                <ContractIcon name={name} />
              </span>
              <span className="flex-1 text-[14px] font-medium capitalize text-ink">
                {name.replace(/([A-Z])/g, ' $1')}
              </span>
              <span className="font-mono text-[12px] text-faint">{hash.slice(0, 8)}… ↗</span>
            </a>
          ))}
        </div>
      </aside>
      </div>
    </div>
  );
}

/* ─────────────────────────── shared bits ─────────────────────────── */

function PanelHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <div className="inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-brand">
        <span className="h-px w-5 bg-brand/40" />
        {eyebrow}
      </div>
      <h2 className="mt-3 font-display text-2xl font-semibold tracking-tighter2 text-ink sm:text-3xl">{title}</h2>
    </div>
  );
}

function MiniCard({
  label,
  value,
  sub,
  accent,
  pill,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  pill?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5 shadow-card transition-shadow hover:shadow-card-lg">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">{label}</div>
      <div className="mt-2 flex items-center gap-2">
        <span className={`font-display text-2xl tracking-tightish tabular-nums ${accent ? 'text-brand' : 'text-ink'}`}>{value}</span>
        {pill && (
          <span className="text-[11px] font-medium text-brand">{pill}</span>
        )}
      </div>
      {sub && <div className="mt-1.5 text-[12px] text-muted">{sub}</div>}
    </div>
  );
}

function CellStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-card p-5 text-center">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">{label}</div>
      <div className={`mt-1.5 font-display text-xl tracking-tightish tabular-nums ${accent ? 'text-brand' : 'text-ink'}`}>{value}</div>
    </div>
  );
}

function CoinIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9.5 9.5h3.2a1.8 1.8 0 0 1 0 3.6H10m0 0h3.2a1.8 1.8 0 0 1 0 3.6H9.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="8" fill="#E7F2EC" />
      <path d="M4.8 8.2l2.1 2.1 4.3-4.6" stroke="#1E7A4F" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ContractIcon({ name }: { name: string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'sawitToken': // CEP-18 token → coin
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="3.5" />
        </svg>
      );
    case 'productionVault': // verified production registry → vault/database
      return (
        <svg {...common}>
          <ellipse cx="12" cy="6" rx="7" ry="3" />
          <path d="M5 6v12c0 1.66 3.13 3 7 3s7-1.34 7-3V6" />
          <path d="M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3" />
        </svg>
      );
    case 'tokenMinter': // mints SAWIT → spark/mint
      return (
        <svg {...common}>
          <path d="M12 3l2.2 5.3L20 10l-5.8 1.7L12 17l-2.2-5.3L4 10l5.8-1.7z" />
        </svg>
      );
    case 'yieldDistributor': // distributes CSPR → share/branch out
      return (
        <svg {...common}>
          <circle cx="6" cy="12" r="2.2" />
          <circle cx="18" cy="6" r="2.2" />
          <circle cx="18" cy="18" r="2.2" />
          <path d="M8 11l8-4M8 13l8 4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M7 3h7l5 5v13H7z" />
          <path d="M14 3v5h5" />
        </svg>
      );
  }
}
