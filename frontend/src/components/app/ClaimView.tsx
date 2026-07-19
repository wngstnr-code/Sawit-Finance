'use client';

import Button from '@/components/ui/Button';
import { fmtAmount, shortHash } from '@/lib/format';
import { txUrl } from '@/lib/onchain';
import { CONTRACTS } from '@/lib/config';
import { useLocale } from '@/lib/i18n';
import { useInvestor } from './investor';
import {
  ToolColumns,
  ToolIntro,
  ContractRow,
  HistoryPanel,
  EmptyState,
  PhaseNote,
  ConnectPrompt,
  TokenBadge,
} from './shared';

type Status = 'loading' | 'not-kyc' | 'nothing' | 'claimable' | 'claimed';

export default function ClaimView() {
  const { t } = useLocale();
  const { state, connected, kycVerified, balLoading, estYield, claim, handleClaim } = useInvestor();

  if (!connected) {
    return <ConnectPrompt title={t.app.connect.claimTitle} body={t.app.connect.claimBody} />;
  }

  const claimedNow = claim.phase === 'done';
  const status: Status = balLoading
    ? 'loading'
    : !kycVerified
    ? 'not-kyc'
    : claimedNow
    ? 'claimed'
    : estYield > 0
    ? 'claimable'
    : 'nothing';

  const amount = status === 'claimable' || status === 'claimed' ? estYield : 0;
  const epoch = state && state.current_distribution_epoch > 0 ? state.current_distribution_epoch : '—';

  return (
    <ToolColumns
      left={<ToolIntro title={t.app.claim.title} divided paragraphs={[...t.app.claim.intro]} />}
      middle={
        <div className="space-y-4">
          {/* epoch */}
          <div className="rounded-2xl bg-bg-2 px-5 py-4">
            <div className="text-[12px] text-faint">{t.app.claim.epoch}</div>
            <div className="mt-0.5 font-display text-lg text-ink">#{epoch}</div>
          </div>

          {/* claimable amount */}
          <div className="rounded-2xl bg-bg-2 p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="font-display text-4xl tabular-nums text-ink">{fmtAmount(amount, 4)}</div>
              <div className="flex items-center gap-2">
                <TokenBadge code="CSPR" />
                <span className="text-[15px] font-medium text-ink">CSPR</span>
              </div>
            </div>
          </div>

          {/* CTA */}
          <CTA
            status={status}
            claiming={claim.phase === 'working'}
            note={claim.phase === 'working' ? claim.note : ''}
            onClaim={handleClaim}
          />
          <div className="text-center">
            <PhaseNote phase={claim} />
          </div>

          {/* contracts */}
          <div className="pt-2">
            <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-faint">
              {t.app.claim.contracts}
            </div>
            <div className="mt-1 divide-y divide-line">
              <ContractRow label="SawitYield" id={CONTRACTS.yieldDistributor} />
              <ContractRow label="SAWIT (CEP-18)" id={CONTRACTS.sawitToken} />
            </div>
          </div>
        </div>
      }
      right={
        <HistoryPanel title={t.app.claim.history}>
          {status === 'claimed' ? (
            <div className="rounded-xl border border-line bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold text-brand">{t.app.claim.claimed}</span>
                <span className="text-[11px] text-faint">{t.app.claim.epochShort.replace('{n}', String(epoch))}</span>
              </div>
              <div className="mt-1 text-[13px] text-muted">{fmtAmount(amount, 4)} CSPR</div>
              {claim.phase === 'done' && (
                <a
                  href={txUrl(claim.hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block font-mono text-[12px] text-brand hover:underline"
                >
                  {shortHash(claim.hash, 6, 4)} ↗
                </a>
              )}
            </div>
          ) : (
            <EmptyState title={t.app.claim.noClaims} text={t.app.claim.noClaimsText} />
          )}
        </HistoryPanel>
      }
    />
  );
}

function CTA({
  status,
  claiming,
  note,
  onClaim,
}: {
  status: Status;
  claiming: boolean;
  note: string;
  onClaim: () => void;
}) {
  const { t } = useLocale();
  if (status === 'not-kyc') {
    return (
      <Button href="/app/tools/kyc" size="lg" className="w-full">
        {t.app.claim.verifyToClaim}
      </Button>
    );
  }
  const label =
    status === 'loading'
      ? t.app.claim.checking
      : status === 'nothing'
      ? t.app.claim.nothing
      : status === 'claimed'
      ? t.app.claim.claimed
      : claiming
      ? note || t.app.claim.claiming
      : t.app.claim.claimCta;
  const disabled = status !== 'claimable' || claiming;
  return (
    <Button onClick={onClaim} disabled={disabled} size="lg" className="w-full">
      {label}
    </Button>
  );
}
