'use client';

import { Reveal } from '@/components/motion/Reveal';
import { CountUp } from '@/components/motion/CountUp';
import Button from '@/components/ui/Button';
import { SAWIT_DECIMALS } from '@/lib/config';
import { fromBaseUnits, fmtAmount } from '@/lib/format';
import { useChainState } from '@/lib/useChainState';
import { useCpoHistory } from '@/lib/useCpoHistory';
import { LineTrend } from '@/components/ui/LineTrend';

export default function RwaSection() {
  const s = useChainState();
  const hist = useCpoHistory();
  const cpoValueM = s ? (s.total_tons_cpo * s.latest_cpo_price_cents) / 100 / 1_000_000 : 0;
  const rep = s?.oracle_reputation ?? 0;

  return (
    <section id="rwa" className="flex min-h-screen flex-col justify-center px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto w-full max-w-content">
      <Reveal className="mx-auto mb-12 max-w-3xl text-center">
        <div className="inline-flex items-center justify-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-brand">
          <span className="h-px w-5 bg-brand/40" />
          Real-world asset
        </div>
        <h2 className="mt-4 font-display text-4xl font-semibold tracking-tighter2 text-ink text-balance sm:text-5xl">
          The world’s largest palm oil market, brought on-chain.
        </h2>
      </Reveal>

      <Reveal>
        <div className="rounded-3xl border border-line bg-bg-2/60 p-3 sm:p-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="relative flex flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-card lg:row-span-2">
              <div className="relative h-60">
                <img
                  src="/hero/buah-sawit.jpg"
                  alt="Indonesian oil-palm estate"
                  className="absolute inset-0 h-full w-full object-cover [filter:saturate(0.85)_brightness(0.6)]"
                />
                <div className="absolute inset-0 bg-ink/25" />
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
                <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-ink/40 to-transparent" />
                <div className="absolute left-6 top-6 grid h-12 w-12 place-items-center rounded-xl border border-white/60 bg-white/85 shadow-card backdrop-blur">
                  <img src="/sawit-fi-icon-black.svg" alt="" className="h-7 w-7" />
                </div>
              </div>

              <div className="relative -mt-6 flex flex-1 flex-col px-7 pb-7">
              <h3 className="font-display text-2xl tracking-tightish text-ink">
                <span className="font-semibold">Sawit</span>
                <span className="font-light text-muted"> Finance</span>
                <span className="font-semibold"> Protocol</span>
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">
                Tokenized CPO production revenue on Casper — verified by AI
                oracles, minted as CEP-18, and claimable as CSPR yield.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {['CEP-18', 'KYC-gated', 'Casper'].map((b) => (
                  <span key={b} className="rounded-full bg-bg-2 px-2.5 py-1 text-[11px] text-muted">
                    {b}
                  </span>
                ))}
              </div>
              <div className="mt-auto pt-7">
                <Button href="/app" variant="primary" size="md">
                  Launch App →
                </Button>
              </div>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-card p-7 shadow-card lg:col-span-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[12px] text-faint">Verified CPO value</div>
                  <div className="mt-1 font-display text-4xl font-semibold tracking-tighter2 text-ink">
                    {s ? <CountUp to={cpoValueM} format={(v) => `$${v.toFixed(2)}M`} /> : '—'}
                  </div>
                </div>
                <span className="rounded-md border border-line px-2 py-1 font-mono text-[11px] text-brand">
                  recorded on-chain
                </span>
              </div>
              <div className="mt-5 flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-faint">
                  Palm oil price · FRED/IMF
                </span>
                {hist && (
                  <span className="rounded-md bg-brand px-2 py-0.5 font-mono text-[11px] text-white">
                    {hist.change_pct >= 0 ? '+' : ''}
                    {hist.change_pct}% · 5y
                  </span>
                )}
              </div>
              <div className="mt-2 h-32">
                <LineTrend id="rwa" data={hist?.series.map((p) => p.price)} />
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-card p-7 shadow-card">
              <div className="text-[12px] text-faint">CPO recorded</div>
              <div className="mt-1 font-display text-4xl font-semibold tracking-tighter2 text-ink">
                {s ? <CountUp to={s.total_tons_cpo} format={(v) => `${Math.round(v).toLocaleString()} t`} /> : '—'}
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">
                Across {s?.epoch_count ?? 0} verified epoch(s), priced from the
                live FRED/IMF feed.
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-card p-7 shadow-card">
              <div className="text-[12px] text-faint">Oracle reputation</div>
              <div className="mt-1 font-display text-4xl font-semibold tracking-tighter2 text-ink">
                {s ? <CountUp to={rep} format={(v) => `${Math.round(v)}/100`} /> : '—'}
              </div>
              <div className="mt-5">
                <div className="h-2 w-full overflow-hidden rounded-md bg-bg-2">
                  <div
                    className="h-full rounded-md bg-brand transition-[width] duration-700"
                    style={{ width: `${rep}%` }}
                  />
                </div>
                <div className="mt-2.5 flex justify-between font-mono text-[11px] text-faint">
                  <span>{s?.oracle_submission_count ?? 0} submissions</span>
                  <span>{rep >= 90 ? 'Excellent' : rep >= 75 ? 'Good' : 'Review'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card px-7 py-5 shadow-card">
            <span className="font-display text-lg font-semibold text-ink">
              {s ? fmtAmount(fromBaseUnits(s.total_sawit_supply, SAWIT_DECIMALS)) : '—'}{' '}
              <span className="text-muted">SAWIT minted</span>
            </span>
            <span className="font-mono text-[12px] text-faint">
              yield-bearing · claimable in CSPR
            </span>
          </div>
        </div>
      </Reveal>
      </div>
    </section>
  );
}
