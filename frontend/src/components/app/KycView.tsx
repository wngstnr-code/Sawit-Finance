'use client';

import { useEffect, useId } from 'react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/primitives';
import { CONTRACTS, NETWORK } from '@/lib/config';
import { useLocale } from '@/lib/i18n';
import { useInvestor } from './investor';
import { ToolColumns, ToolIntro, ContractRow, HistoryPanel, PageHead, ConnectPrompt } from './shared';

export default function KycView() {
  const { t } = useLocale();
  const { publicKey, connected, kycVerified, kyc, balLoading, reload, handleVerifyKyc } =
    useInvestor();

  // While waiting on the vault authority, poll chain state so the view flips
  // to "Verified" on its own the moment KYC is authorized on-chain (no
  // manual refresh needed).
  const pending = kyc.phase === 'submitted' && !kycVerified;
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => reload(true), 10_000);
    return () => clearInterval(id);
  }, [pending, reload]);

  // Not connected — invite the visitor to connect before applying.
  if (!connected) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <PageHead title={t.app.kyc.title} sub={t.app.kyc.pendingSub} />
        <ConnectPrompt title={t.app.connect.kycTitle} body={t.app.connect.kycBody} />
      </div>
    );
  }

  // Still reading the on-chain KYC flag — don't flash the application form at
  // an already-verified holder (it reads as "your KYC was lost").
  if (balLoading && !kycVerified && kyc.phase === 'idle') {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <PageHead title={t.app.kyc.title} sub={t.app.kyc.pendingSub} />
        <Card className="p-8 text-center">
          <p className="text-[14px] text-muted">{t.app.claim.checking}</p>
        </Card>
      </div>
    );
  }

  // Verified on-chain — done.
  if (kycVerified) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <PageHead title={t.app.kyc.title} sub={t.app.kyc.verifiedSub} />
        <Card className="p-8 text-center">
          <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-brand">
            {t.app.kyc.verified}
          </span>
          <h3 className="mt-3 font-display text-2xl text-ink">{t.app.kyc.allSet}</h3>
          <p className="mt-2 text-[14px] text-muted">{t.app.kyc.allSetText}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button href="/app">{t.app.kyc.exploreSawit}</Button>
            <Button href="/app/tools/claim" variant="secondary">
              {t.app.kyc.claimYield}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Submitted but not yet verified — waiting on the vault authority.
  if (kyc.phase === 'submitted') {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <PageHead title={t.app.kyc.title} sub={t.app.kyc.pendingSub} />
        <Card className="p-8 text-center">
          <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-faint">
            {t.app.kyc.pendingReview}
          </span>
          <h3 className="mt-3 font-display text-2xl text-ink">{t.app.kyc.underReview}</h3>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            {t.app.kyc.underReviewText1}
            <span className="mx-1 break-all font-mono text-[12px] text-ink">{publicKey ?? '—'}</span>
            {t.app.kyc.underReviewText2}
          </p>
          <div className="mt-6 w-full divide-y divide-line rounded-lg border border-line-2 text-left [&>div]:px-4">
            <StatusRow label={t.app.kyc.application} ok />
            <StatusRow label={t.app.kyc.authorized} ok={false} />
          </div>
          <p className="mt-4 text-[12px] text-faint">{t.app.kyc.autoUpdate}</p>
        </Card>
        <DemoKycCard />
      </div>
    );
  }

  // Registration — left intro + form (middle) + status (right). Reaching
  // this point means kyc.phase is not 'submitted' (handled above) and KYC is
  // not yet verified, so "Application" is always pending here.
  const submitted = false;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (kyc.phase === 'working') return;
    // Sawit's KYC demo is a single on-chain action (POST /api/demo-kyc →
    // vault authorization) — the form fields below are collected for UX
    // parity, but the submit itself calls useInvestor().handleVerifyKyc(),
    // which is the only KYC entrypoint the investor contract exposes.
    await handleVerifyKyc();
  }

  return (
    <ToolColumns
      left={<ToolIntro title={t.app.kyc.title} divided paragraphs={[...t.app.kyc.intro]} />}
      middle={
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.app.kyc.fullName} name="name" required placeholder={t.app.kyc.namePlaceholder} />
            <Field label={t.app.kyc.email} name="email" type="email" required placeholder={t.app.kyc.emailPlaceholder} />
          </div>

          {/* Casper wallet — auto-filled from the connected account, not editable */}
          <div>
            <label className="text-[12px] font-medium text-ink">{t.app.kyc.casperWallet}</label>
            <div className="mt-1.5 overflow-x-auto whitespace-nowrap rounded-xl border border-line bg-bg-2/60 px-3.5 py-2.5 font-mono text-[11px] leading-5 text-ink">
              {publicKey ?? t.app.kyc.walletPlaceholder}
            </div>
            <p className="mt-1 text-[11px] text-faint">{t.app.kyc.walletNote}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.app.kyc.allocation} name="allocation" placeholder={t.app.kyc.allocationPlaceholder} />
            <Field label={t.app.kyc.organization} name="entity" placeholder={t.app.kyc.optional} />
          </div>

          <MessageField label={t.app.kyc.message} placeholder={t.app.kyc.messagePlaceholder} />

          {kyc.phase === 'error' && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-700">
              {kyc.message}
            </div>
          )}

          <Button type="submit" disabled={kyc.phase === 'working' || !publicKey} size="lg" className="w-full">
            {kyc.phase === 'working' ? t.app.kyc.sending : t.app.kyc.submit}
          </Button>
          <p className="text-center text-[11px] text-faint">
            {publicKey ? t.app.kyc.footNoteConnected : t.app.kyc.footNoteDisconnected}
          </p>

          {/* contracts */}
          <div className="pt-2">
            <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-faint">
              {t.app.kyc.contracts}
            </div>
            <div className="mt-1 divide-y divide-line">
              <ContractRow label={t.app.kyc.sawitIssuer} id={CONTRACTS.productionVault} />
              <ContractRow label="SAWIT (CEP-18)" id={CONTRACTS.sawitToken} />
            </div>
          </div>
        </form>
      }
      right={
        <div className="space-y-4">
          <HistoryPanel title={t.app.kyc.status}>
            <div className="divide-y divide-line">
              <StatusRow label={t.app.kyc.application} ok={submitted} />
              <StatusRow label={t.app.kyc.authorized} ok={kycVerified} />
            </div>
            <p className="mt-5 text-[12px] leading-relaxed text-faint">{t.app.kyc.statusNote}</p>
          </HistoryPanel>
          <DemoKycCard />
        </div>
      }
    />
  );
}

// Testnet-only shortcut past the manual vault-authority review: calls the
// same useInvestor().handleVerifyKyc() as the registration form, which POSTs
// /api/demo-kyc to register + verify the KYC flag on-chain for the connected
// wallet.
function DemoKycCard() {
  const { t } = useLocale();
  const d = t.app.demo;
  const { publicKey, kyc, handleVerifyKyc } = useInvestor();

  if (NETWORK.name !== 'casper-test' || !publicKey) return null;

  const working = kyc.phase === 'working';

  return (
    <Card className="border-dashed p-5">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">{d.eyebrow}</div>
      <h4 className="mt-1.5 font-display text-lg text-ink">{d.kycTitle}</h4>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{d.kycBody}</p>
      <Button
        onClick={() => handleVerifyKyc()}
        disabled={working}
        variant="secondary"
        size="lg"
        className="mt-4 w-full disabled:opacity-60"
      >
        {working ? d.kycRegister : d.kycCta}
      </Button>
      {kyc.phase === 'error' && (
        <p className="mt-2 text-[12px] leading-relaxed text-amber-700">{kyc.message}</p>
      )}
    </Card>
  );
}

const FIELD_CLASS =
  'mt-1.5 w-full rounded-xl border border-line bg-bg-2/40 px-3.5 py-2.5 text-[14px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand/50 focus:bg-card focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-1';

function Field({
  label,
  name,
  type = 'text',
  required,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const reactId = useId();
  const id = `kyc-field-${name}-${reactId}`;
  return (
    <div>
      <label htmlFor={id} className="text-[12px] font-medium text-ink">
        {label}
        {required && <span className="text-brand"> *</span>}
      </label>
      <input
        id={id}
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
        className={FIELD_CLASS}
      />
    </div>
  );
}

function MessageField({ label, placeholder }: { label: string; placeholder?: string }) {
  const reactId = useId();
  const id = `kyc-field-message-${reactId}`;
  return (
    <div>
      <label htmlFor={id} className="text-[12px] font-medium text-ink">
        {label}
      </label>
      <textarea id={id} name="message" rows={3} placeholder={placeholder} className={FIELD_CLASS} />
    </div>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  const { t } = useLocale();
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-[13px] text-ink">{label}</span>
      <span className={`text-[12px] font-semibold ${ok ? 'text-brand' : 'text-faint'}`}>
        {ok ? t.app.kyc.done : t.app.kyc.pending}
      </span>
    </div>
  );
}
