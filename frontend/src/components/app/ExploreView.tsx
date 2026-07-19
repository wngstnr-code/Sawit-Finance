'use client';

import { useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/primitives';
import Button from '@/components/ui/Button';
import { CountUp } from '@/components/motion/CountUp';
import { fmtAmount, fmtUsdFromCents, fromBaseUnits } from '@/lib/format';
import { NETWORK, SALE, SAWIT_DECIMALS } from '@/lib/config';
import { useLocale } from '@/lib/i18n';
import { useInvestor } from './investor';
import {
  PageHead,
  PhaseNote,
  EpochList,
  BalanceHero,
  ChartAccordionCard,
  SectionTitle,
  TokenBadge,
} from './shared';

export default function ExploreView() {
  const { t } = useLocale();
  const {
    state,
    balance,
    connected,
    connect,
    kycVerified,
    fairValueUsd,
    cpoHistory,
    supply,
    distributed,
    buy,
    handleBuy,
  } = useInvestor();
  const [csprSpend, setCsprSpend] = useState('');
  const buyCardRef = useRef<HTMLDivElement>(null);

  const sawitBalance = fromBaseUnits(String(balance ?? 0), SAWIT_DECIMALS);
  const parsed = Number(csprSpend);
  const validAmount = csprSpend.trim() !== '' && Number.isFinite(parsed) && parsed >= SALE.minCspr;
  const estSawitOut =
    csprSpend.trim() !== '' && Number.isFinite(parsed) && parsed > 0
      ? Math.floor(parsed / SALE.priceCspr)
      : null;

  const cpoUsdPerTon = state ? state.latest_cpo_price_cents / 100 : 0;

  // Distribution yield: total CSPR distributed to date per SAWIT, expressed as a
  // percentage of the fixed treasury price. `useInvestor()` does not expose a
  // pre-computed annualized figure, so this is derived locally from state — a
  // reasonable proxy given a single fixed price point rather than an order-book mark.
  const epochsFunded = state?.epochs?.filter((e) => e.funded).length ?? state?.epoch_count ?? 0;
  // Denominator: circulating SAWIT (issuer float + sale treasury excluded);
  // falls back to total supply for snapshots predating circulating_sawit.
  const circulating = state?.circulating_sawit
    ? fromBaseUnits(state.circulating_sawit, SAWIT_DECIMALS)
    : 0;
  const yieldBase = circulating > 0 ? circulating : supply;
  const distYieldPct =
    state && yieldBase > 0 && distributed > 0
      ? (distributed / yieldBase / SALE.priceCspr) * 100
      : null;

  // Historical fair value per SAWIT — the CPO price series pushed through the
  // same on-chain formula as the live scalar: price × 10 000 / (token_rate × gorr_bps).
  const fairValueSeries = useMemo(() => {
    if (!state?.token_rate || !state?.gorr_bps || !cpoHistory) return undefined;
    const denom = state.token_rate * state.gorr_bps;
    return cpoHistory.series.map((p) => ({ date: p.date, price: (p.price * 10_000) / denom }));
  }, [state, cpoHistory]);

  function handleAmountChange(v: string) {
    if (v === '' || /^\d*\.?\d*$/.test(v)) setCsprSpend(v);
  }

  return (
    <div className="space-y-6">
      <PageHead title={t.app.explore.title} sub={t.app.explore.sub} />

      {/* product hero */}
      <BalanceHero
        label={t.app.explore.cpoPrice}
        value={fmtUsdFromCents(state?.latest_cpo_price_cents ?? 0)}
        sub={`$${fmtAmount(cpoUsdPerTon)} ${t.app.explore.perTon}`}
        change={cpoHistory ? { pct: cpoHistory.change_pct, note: t.app.shared.cpo5yr } : undefined}
      />

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ProductStat
          label={t.app.explore.sawitPriceLabel}
          value={`${SALE.priceCspr} CSPR`}
          sub={t.app.explore.noOffer}
          accent
        />
        <ProductStat
          label={<span title={t.app.explore.distYieldTip}>{t.app.explore.distYield}</span>}
          value={distYieldPct != null ? `~${distYieldPct.toFixed(1)}%` : '—'}
          sub={
            distYieldPct == null
              ? t.app.explore.distYieldNone
              : t.app.explore.distYieldFrom.replace('{n}', String(epochsFunded))
          }
        />
        <ProductStat
          label={t.app.explore.oracleRep}
          value={<><CountUp to={state?.oracle_reputation ?? 0} />/100</>}
          sub={t.app.explore.epochsRecorded.replace('{count}', String(state?.epoch_count ?? 0))}
        />
        <ProductStat
          label={t.app.explore.totalMinted}
          value={
            <CountUp
              to={fromBaseUnits(state?.total_sawit_supply ?? '0', SAWIT_DECIMALS)}
              format={(v) => fmtAmount(v)}
            />
          }
          sub={t.app.explore.sawitOutstanding}
        />
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <div className="flex h-full flex-col lg:col-span-2">
          {/* stacked accordion: on-chain fair value (default open) + market feed */}
          <ChartAccordionCard
            className="grow"
            defaultOpen="fair"
            matchHeightOf={buyCardRef}
            sections={[
              {
                key: 'fair',
                eyebrow: t.app.explore.fvEyebrow,
                title: t.app.explore.fvTitle,
                value:
                  fairValueUsd != null ? (
                    <div className="font-display text-lg tabular-nums text-brand">
                      ${fmtAmount(fairValueUsd, 4)}
                      <span className="ml-1 text-[11px] font-normal text-faint">
                        {t.app.explore.fvPerSawit}
                      </span>
                    </div>
                  ) : undefined,
                points: fairValueSeries,
                accent: 'ember',
                decimals: 4,
                unit: ' /SAWIT',
                footer: t.app.explore.fvFooter,
              },
              {
                key: 'cpo',
                eyebrow: t.app.explore.chartEyebrow,
                title: t.app.explore.chartTitle,
                value:
                  cpoHistory?.latest != null ? (
                    <div className="font-display text-lg tabular-nums text-ink">
                      ${fmtAmount(cpoHistory.latest)}
                      <span className="ml-1 text-[11px] font-normal text-faint">/t</span>
                    </div>
                  ) : undefined,
                points: cpoHistory?.series,
                accent: 'steel',
                footer: t.app.explore.chartFooter,
                ranged: true,
              },
            ]}
          />
        </div>

        {/* buy panel — self-start so accordion height changes never shift its CTA;
            the accordion matches this card's height via buyCardRef */}
        <div ref={buyCardRef} className="self-start">
          <Card className="flex flex-col p-6">
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">
              {t.app.explore.acquire}
            </div>
            <h3 className="mt-2 font-display text-2xl text-ink">{t.app.explore.buySawit}</h3>
            <p className="mt-2 text-[14px] text-muted">{t.app.explore.buyDesc}</p>

            {/* converter (CSPR → SAWIT) */}
            <div className="mt-5">
              {/* network — single chain, static */}
              <div className="flex items-center justify-between rounded-xl bg-bg-2 px-4 py-3">
                <div>
                  <div className="text-[11px] text-faint">{t.app.explore.network}</div>
                  <div className="mt-0.5 text-[14px] font-medium text-ink">Casper Testnet</div>
                </div>
              </div>

              {/* from → to */}
              <div className="relative mt-2">
                {/* from: CSPR (you spend) */}
                <div className="rounded-xl bg-bg-2 px-4 pb-6 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <input
                      value={csprSpend}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      inputMode="decimal"
                      placeholder="0"
                      className="w-0 flex-1 bg-transparent font-display text-3xl tabular-nums text-ink outline-none placeholder:text-faint"
                    />
                    <div className="shrink-0 text-right">
                      <div className="flex items-center justify-end gap-2 text-[15px] font-medium text-ink">
                        <TokenBadge code="CSPR" />
                        CSPR
                      </div>
                    </div>
                  </div>
                </div>

                {/* divider chevron */}
                <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
                  <div className="grid h-9 w-9 place-items-center rounded-full border border-line bg-card text-faint shadow-pill">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                </div>

                {/* to: SAWIT (you receive) */}
                <div className="mt-1 rounded-xl bg-bg-2 px-4 pb-4 pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-display text-3xl tabular-nums text-ink">
                      {estSawitOut != null ? fmtAmount(estSawitOut) : '0'}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="flex items-center justify-end gap-2 text-[15px] font-medium text-ink">
                        <TokenBadge code="SAWIT" />
                        SAWIT
                      </div>
                      {connected && (
                        <div className="mt-1 text-[12px] text-muted">
                          {t.app.explore.available} {fmtAmount(sawitBalance)}
                          <button
                            onClick={() => handleAmountChange(String(sawitBalance * SALE.priceCspr))}
                            className="ml-1.5 font-semibold text-brand hover:underline"
                          >
                            {t.app.explore.max}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-2 text-[12px] text-muted">
                {t.app.explore.estOut.replace('{amount}', fmtAmount(estSawitOut ?? 0))}
              </div>
              <div className="mt-1 text-[11px] text-faint">{t.app.explore.estOutNote}</div>
            </div>

            {/* testnet self-service: official Casper faucet */}
            {NETWORK.name === 'casper-test' && <FaucetRow />}

            {/* CTA — pinned to the bottom so the card fills its height cleanly */}
            <div className="mt-auto pt-6">
              {!connected ? (
                <Button onClick={connect} size="lg" className="w-full">
                  {t.app.connect.buyCta}
                </Button>
              ) : !kycVerified ? (
                <Button href="/app/tools/kyc" variant="secondary" size="lg" className="w-full">
                  {t.app.explore.verifyToBuy}
                </Button>
              ) : !validAmount ? (
                <Button disabled size="lg" className="w-full disabled:pointer-events-none disabled:opacity-50">
                  {t.app.explore.enterAmount}
                </Button>
              ) : (
                <Button
                  onClick={() => handleBuy(parsed)}
                  disabled={buy.phase === 'working'}
                  size="lg"
                  className="w-full disabled:opacity-60"
                >
                  {buy.phase === 'working' ? buy.note : t.app.explore.buySawit}
                </Button>
              )}
            </div>
            <div className="mt-2">
              <PhaseNote phase={buy} />
            </div>
          </Card>
        </div>
      </div>

      {/* provenance */}
      <div>
        <SectionTitle>{t.app.explore.provenance}</SectionTitle>
        <EpochList />
        <p className="mt-3 text-[12px] text-faint">{t.app.explore.provenanceNote}</p>
      </div>
    </div>
  );
}

// Testnet self-service: send the connected wallet to the official Casper
// faucet (Casper has no on-chain swap path for this MVP — the faucet is a
// hosted, wallet-agnostic flow).
function FaucetRow() {
  const { t } = useLocale();
  const d = t.app.demo;
  return (
    <div className="mt-3 rounded-xl border border-dashed border-line px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[12px] font-medium text-ink">{d.csprTitle}</div>
          <div className="mt-0.5 text-[11px] text-faint">{d.csprNote}</div>
        </div>
        <a
          href="https://testnet.cspr.live/tools/faucet"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-full border border-line px-3.5 py-1.5 text-[12px] font-semibold text-brand transition-colors hover:border-brand/50"
        >
          {d.csprCta}
        </a>
      </div>
    </div>
  );
}

function ProductStat({
  label,
  value,
  sub,
  accent,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub: string;
  accent?: boolean;
}) {
  return (
    <Card className="p-6">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">{label}</div>
      <div
        className={`mt-2 font-display text-3xl tracking-tightish tabular-nums ${
          accent ? 'text-brand' : 'text-ink'
        }`}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[13px] text-muted">{sub}</div>
    </Card>
  );
}
