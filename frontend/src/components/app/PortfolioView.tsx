'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/primitives';
import Button from '@/components/ui/Button';
import { DonutChart } from '@/components/ui/DonutChart';
import { CountUp } from '@/components/motion/CountUp';
import { fmtAmount, fromBaseUnits, shortHash } from '@/lib/format';
import { accountHashFromPublicKey } from '@/lib/useSawitBalance';
import { txUrl } from '@/lib/onchain';
import { NETWORK, SALE, SAWIT_DECIMALS } from '@/lib/config';
import { useLocale } from '@/lib/i18n';
import { useActivity, type ActivityEntry } from '@/lib/activity';
import { useInvestor } from './investor';
import { PageHead, HoldingsList, BalanceHero, ChartCard, SectionTitle, ConnectPrompt } from './shared';

function ActivityIcon({ type }: { type: ActivityEntry['type'] }) {
  const glyph =
    type === 'claim' ? (
      // badge-check
      <>
        <path d="M12 3.5 14 5l2.4-.2.6 2.3 2 1.4-1 2.1 1 2.1-2 1.4-.6 2.3L14 19l-2 1.5L10 19l-2.4.2L7 16.9l-2-1.4 1-2.1-1-2.1 2-1.4.6-2.3L10 5z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ) : type === 'buy' ? (
      // arrow-down-to-line (acquire / issuance)
      <>
        <path d="M12 4v11m0 0 4-4m-4 4-4-4" />
        <path d="M5 20h14" />
      </>
    ) : type === 'kyc' ? (
      // link (kyc verification)
      <>
        <path d="M9.5 14.5 14.5 9.5" />
        <path d="M8 11 6.5 12.5a3.5 3.5 0 0 0 5 5L13 16" />
        <path d="M16 13l1.5-1.5a3.5 3.5 0 0 0-5-5L11 8" />
      </>
    ) : (
      // arrow-left-right (transfer / contract call)
      <>
        <path d="M7 8h11m0 0-3-3m3 3-3 3" />
        <path d="M17 16H6m0 0 3-3m-3 3 3 3" />
      </>
    );
  return (
    <span className="shrink-0 text-brand">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {glyph}
      </svg>
    </span>
  );
}

function formatRelative(at: number, t: ReturnType<typeof useLocale>['t']): string {
  const p = t.app.portfolio;
  const diffMs = Date.now() - at;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return p.justNow;
  if (mins < 60) return p.minsAgo.replace('{n}', String(mins));
  const hours = Math.floor(mins / 60);
  if (hours < 24) return p.hoursAgo.replace('{n}', String(hours));
  const days = Math.floor(hours / 24);
  return p.daysAgo.replace('{n}', String(days));
}

export default function PortfolioView() {
  const { t } = useLocale();
  const { publicKey, connected, balance, liquid, claimable, fairValueUsd, csprUsd, idr, share, supply, state, cpoHistory } =
    useInvestor();
  const activity = useActivity(publicKey ?? null);

  const sawitBalance = fromBaseUnits(String(balance ?? 0), SAWIT_DECIMALS);
  const liquidCspr = liquid ?? 0;
  const claimableCspr = claimable ?? 0;
  const sawitValueCspr = sawitBalance * SALE.priceCspr;
  // Portfolio = everything the connected wallet holds, marked in CSPR: SAWIT at
  // treasury price + liquid CSPR at par + claimable yield at par.
  const totalValueCspr = sawitValueCspr + liquidCspr + claimableCspr;
  // USD marker: SAWIT at its fair value + CSPR (liquid + claimable) at the live
  // CoinGecko spot — the same basis the Casper Wallet uses.
  const totalUsd = (fairValueUsd != null ? sawitBalance * fairValueUsd : 0) + (liquidCspr + claimableCspr) * csprUsd;

  // Donut arcs (CSPR value); DonutChart drops zero segments automatically.
  const segments = useMemo(
    () => [
      { label: 'SAWIT', value: sawitValueCspr, color: '#1E7A4F' },
      { label: 'CSPR', value: liquidCspr, color: '#FF473E' },
      { label: 'Yield', value: claimableCspr, color: '#C6803A' },
    ],
    [sawitValueCspr, liquidCspr, claimableCspr]
  );

  // Legend rows carry the real token counts so "1,000" (a CSPR value) is never
  // mistaken for a token quantity.
  const legendRows = [
    {
      label: 'SAWIT',
      color: '#1E7A4F',
      amount: `${fmtAmount(sawitBalance, 0)} ${t.app.shared.tokenUnit}`,
      valueCspr: sawitValueCspr,
    },
    {
      label: 'CSPR',
      color: '#FF473E',
      amount: t.app.portfolio.liquidWallet,
      valueCspr: liquidCspr,
    },
    ...(claimableCspr > 0
      ? [{ label: t.app.portfolio.claimableYield, color: '#C6803A', amount: t.app.portfolio.readyToClaim, valueCspr: claimableCspr }]
      : []),
  ];

  // Portfolio value over time, per the chart footer: current SAWIT holdings marked
  // at each point's fair value (CPO price × 10 000 / (token_rate × gorr_bps)),
  // plus claimable CSPR at par.
  const portfolioSeries = useMemo(() => {
    if (!state?.token_rate || !state?.gorr_bps || !cpoHistory || sawitBalance <= 0) return undefined;
    const denom = state.token_rate * state.gorr_bps;
    const parCspr = liquidCspr + claimableCspr;
    return cpoHistory.series.map((p) => ({
      date: p.date,
      price: sawitBalance * ((p.price * 10_000) / denom) + parCspr,
    }));
  }, [state, cpoHistory, sawitBalance, liquidCspr, claimableCspr]);

  if (!connected) {
    return (
      <div className="space-y-6">
        <PageHead title={t.app.portfolio.title} sub={t.app.portfolio.sub} />
        <ConnectPrompt title={t.app.connect.portfolioTitle} body={t.app.connect.portfolioBody} />
      </div>
    );
  }

  const shareStr = t.app.portfolio.ofSupply
    .replace('{pct}', (share * 100).toFixed(2))
    .replace('{supply}', fmtAmount(supply));

  const accountHash = publicKey ? accountHashFromPublicKey(publicKey) : undefined;

  return (
    <div className="space-y-6">
      <PageHead title={t.app.portfolio.title} sub={t.app.portfolio.sub} />

      <BalanceHero
        label={t.app.portfolio.value}
        value={<CountUp to={totalValueCspr} format={(v) => `${fmtAmount(v, 2)} CSPR`} />}
        sub={`≈ $${fmtAmount(totalUsd, 2)} (Rp ${(totalUsd * idr).toLocaleString('id-ID', {
          maximumFractionDigits: 0,
        })}) · ${shareStr}`}
      />

      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <ChartCard
          id="portfolio"
          points={portfolioSeries}
          title={t.app.portfolio.chartTitle}
          footer={t.app.portfolio.chartFooter}
          accent="ember"
          decimals={2}
          unit=""
          className="lg:col-span-2"
        />

        {/* allocation donut */}
        <Card className="flex h-full flex-col p-6">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">
            {t.app.portfolio.allocEyebrow}
          </div>
          <h3 className="mt-2 font-display text-lg text-ink">{t.app.portfolio.allocTitle}</h3>
          {totalValueCspr <= 0 ? (
            <div className="grid grow place-items-center text-[13px] text-muted">
              {t.app.portfolio.allocEmpty}
            </div>
          ) : (
            <>
              <div className="mt-4 flex grow items-center justify-center">
                <DonutChart segments={segments} size={160} thickness={22}>
                  <div className="font-display text-xl font-semibold tabular-nums text-ink">
                    {fmtAmount(totalValueCspr, 0)}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-faint">CSPR</div>
                </DonutChart>
              </div>
              <ul className="mt-4 space-y-2.5">
                {legendRows.map((r) => (
                  <li key={r.label} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-[13px] text-muted">
                      <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ backgroundColor: r.color }} />
                      <span className="font-medium text-ink">{r.label}</span>
                      <span className="text-faint">· {r.amount}</span>
                    </span>
                    <span className="font-mono text-[13px] tabular-nums text-ink">
                      {fmtAmount(r.valueCspr, 2)}
                      <span className="ml-1 text-[10px] text-faint">CSPR</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <div>
        <SectionTitle
          aside={
            <Button href="/app" size="md">
              {t.app.explore.buySawit}
            </Button>
          }
        >
          {t.app.portfolio.holdings}
        </SectionTitle>
        <HoldingsList />
      </div>

      {/* activity — real per-wallet activity recorded locally for every
          transaction this app has submitted on the connected wallet's
          behalf (buy / claim / kyc), since Casper testnet has no keyless
          per-account history API. */}
      <div>
        <SectionTitle
          aside={
            accountHash && (
              <a
                href={`${NETWORK.explorer}/account/${accountHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] text-brand hover:underline"
              >
                {t.app.portfolio.fullHistory}
              </a>
            )
          }
        >
          {t.app.portfolio.onchainActivity}
        </SectionTitle>
        {activity.length === 0 ? (
          <Card className="px-6 py-8 text-center text-[13px] text-muted">
            {t.app.portfolio.noActivity}
          </Card>
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {activity.map((entry, i) => {
              const label =
                entry.type === 'buy'
                  ? t.app.portfolio.activityBuy
                  : entry.type === 'claim'
                  ? t.app.portfolio.activityClaim
                  : entry.type === 'kyc'
                  ? t.app.portfolio.activityKyc
                  : entry.type === 'transfer'
                  ? t.app.portfolio.activityTransfer
                  : entry.note || t.app.portfolio.activityContract;
              return (
                <div key={`${entry.at}-${i}`} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <ActivityIcon type={entry.type} />
                    <div>
                      <div className="text-[14px] font-medium text-ink">{label}</div>
                      <div className="text-[12px] text-muted">{formatRelative(entry.at, t)}</div>
                    </div>
                  </div>
                  {entry.hash && (
                    <a
                      href={txUrl(entry.hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 font-mono text-[12px] text-brand hover:underline"
                    >
                      {shortHash(entry.hash, 6, 4)} ↗
                    </a>
                  )}
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
