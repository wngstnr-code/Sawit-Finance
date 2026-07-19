'use client';

import Button from '@/components/ui/Button';
import { fmtAmount, shortHash } from '@/lib/format';
import { txUrl } from '@/lib/onchain';
import { CONTRACTS, NETWORK } from '@/lib/config';
import { accountHashFromPublicKey } from '@/lib/useSawitBalance';
import { useActivity } from '@/lib/activity';
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
  const { state, connected, publicKey, kycVerified, balLoading, claimable, alreadyClaimed, estYield, claim, handleClaim } =
    useInvestor();
  const activity = useActivity(publicKey ?? null);

  if (!connected) {
    return <ConnectPrompt title={t.app.connect.claimTitle} body={t.app.connect.claimBody} />;
  }

  // Every on-chain claim this wallet has made — from the merged activity log
  // (local record + CSPR.cloud deploy history), each linkable to the explorer.
  const claimHistory = activity.filter((e) => e.type === 'claim' && e.hash);
  const accountHash = publicKey ? accountHashFromPublicKey(publicKey) : undefined;

  // Gate strictly on the on-chain claimable/claimed record, NOT the projected
  // `estYield` — once an epoch is claimed, claimable reads 0 and a retry would
  // revert on-chain with AlreadyClaimed (user error 9), burning gas.
  const claimedNow = claim.phase === 'done';
  const isClaimed = claimedNow || alreadyClaimed;
  const canClaim = !isClaimed && claimable != null && claimable > 0;
  const status: Status = balLoading
    ? 'loading'
    : !kycVerified
    ? 'not-kyc'
    : isClaimed
    ? 'claimed'
    : canClaim
    ? 'claimable'
    : 'nothing';

  // Show the exact claimable when there's something to claim; for an
  // already-claimed epoch fall back to the holder's share estimate.
  const amount = status === 'claimable' ? claimable ?? 0 : status === 'claimed' ? estYield : 0;

  // Avoid showing the fresh session claim twice (its card already carries the hash).
  const sessionHash = claim.phase === 'done' ? claim.hash : undefined;
  const pastClaims = claimHistory.filter((e) => e.hash !== sessionHash);
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
          <div className="space-y-3">
            {/* this-session claim confirmation (carries the fresh tx hash) */}
            {status === 'claimed' && (
              <div className="rounded-xl border border-line bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold text-brand">{t.app.claim.claimed}</span>
                  <span className="text-[11px] text-faint">{t.app.claim.epochShort.replace('{n}', String(epoch))}</span>
                </div>
                {amount > 0 && <div className="mt-1 text-[13px] text-muted">{fmtAmount(amount, 4)} CSPR</div>}
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
            )}

            {/* every past claim this wallet made on-chain, each verifiable on the explorer */}
            {pastClaims.map((e, i) => (
              <a
                key={`${e.hash}-${i}`}
                href={txUrl(e.hash as string)}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl border border-line bg-card p-3 transition-colors hover:border-brand/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-medium text-ink">{t.app.claim.claimed}</span>
                  <span className="font-mono text-[12px] text-brand">{shortHash(e.hash as string, 6, 4)} ↗</span>
                </div>
              </a>
            ))}

            {status !== 'claimed' && pastClaims.length === 0 && (
              <EmptyState title={t.app.claim.noClaims} text={t.app.claim.noClaimsText} />
            )}

            {/* persistent on-chain link — verify any claim directly on the explorer,
                even when no local tx hash is cached (e.g. claimed on another device) */}
            {accountHash && (
              <a
                href={`${NETWORK.explorer}/account/${accountHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block pt-1 text-center text-[12px] text-brand hover:underline"
              >
                {t.app.portfolio.fullHistory}
              </a>
            )}
          </div>
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
