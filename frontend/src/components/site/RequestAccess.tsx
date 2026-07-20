'use client';

import { useEffect, useId, useState } from 'react';
import { ACCESS_EMAIL } from '@/lib/config';

type Phase = 'idle' | 'sending' | 'success' | 'error';

export default function RequestAccess({
  label = 'Request access →',
  className = '',
  context = 'landing',
}: {
  label?: string;
  className?: string;
  context?: string;
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  function close() {
    setOpen(false);
    setTimeout(() => {
      setPhase('idle');
      setError('');
    }, 200);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    if ((data._honey as string)?.length) return;
    setPhase('sending');
    setError('');
    try {
      const res = await fetch(
        `https://formsubmit.co/ajax/${encodeURIComponent(ACCESS_EMAIL)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            _subject: 'SAWIT — Request investor access',
            _template: 'table',
            _captcha: 'false',
            source: context,
            name: data.name,
            email: data.email,
            wallet: data.wallet || '—',
            allocation_usd: data.allocation || '—',
            entity: data.entity || '—',
            message: data.message || '—',
          }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && (json.success === 'true' || json.success === true)) {
        setPhase('success');
      } else {
        throw new Error(json.message || 'Submission failed. Please try again.');
      }
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
      setPhase('error');
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/50 p-4 backdrop-blur-sm sm:items-center"
          onClick={close}
        >
          <div
            data-lenis-prevent
            className="max-h-[90dvh] w-full max-w-lg overflow-y-auto overflow-x-hidden overscroll-contain rounded-2xl border border-line bg-card shadow-card-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-line bg-card p-6">
              <div>
                <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-brand">
                  <span className="h-px w-4 bg-brand/40" />
                  For investors
                </div>
                <h3 className="mt-2 font-display text-xl font-semibold tracking-tightish text-ink">
                  Request access
                </h3>
              </div>
              <button
                onClick={close}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-full text-faint transition-colors hover:bg-bg-2 hover:text-ink"
              >
                ✕
              </button>
            </div>

            {phase === 'success' ? (
              <div className="p-8 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-ink">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FBFBFC" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4 4 10-10" />
                  </svg>
                </div>
                <h4 className="mt-4 font-display text-lg font-semibold text-ink">
                  Request received.
                </h4>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">
                  Thanks — the SAWIT team will reach out to begin onboarding and
                  KYC. SAWIT is issued by a licensed operator, not sold on an
                  exchange.
                </p>
                <button
                  onClick={close}
                  className="mt-6 rounded-lg bg-ink px-6 py-2.5 text-sm font-medium text-bg transition-transform hover:-translate-y-0.5"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4 p-6">
                <p className="text-[13px] leading-relaxed text-muted">
                  No public sale, no swap. Share your details and intended
                  allocation; a licensed operator will onboard you.
                </p>

                <input type="text" name="_honey" tabIndex={-1} autoComplete="off" className="hidden" />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" name="name" required placeholder="Jane Investor" />
                  <Field label="Email" name="email" type="email" required placeholder="you@email.com" />
                </div>
                <Field label="Casper wallet (public key)" name="wallet" placeholder="01a2…  (optional)" mono />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Intended allocation (USD)" name="allocation" placeholder="50,000  (optional)" />
                  <Field label="Organization" name="entity" placeholder="Optional" />
                </div>
                <MessageField />

                {phase === 'error' && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={phase === 'sending'}
                  className="w-full rounded-lg bg-ink px-5 py-3 text-sm font-medium text-bg transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {phase === 'sending' ? 'Sending…' : 'Send request'}
                </button>
                <p className="text-center text-[11px] text-faint">
                  KYC-gated · primary issuance via the licensed operator
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
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
  mono,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  mono?: boolean;
}) {
  const reactId = useId();
  const id = `access-field-${name}-${reactId}`;
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
        className={`${FIELD_CLASS} ${mono ? 'font-mono text-[13px]' : ''}`}
      />
    </div>
  );
}

function MessageField() {
  const reactId = useId();
  const id = `access-field-message-${reactId}`;
  return (
    <div>
      <label htmlFor={id} className="text-[12px] font-medium text-ink">
        Message
      </label>
      <textarea
        id={id}
        name="message"
        rows={3}
        placeholder="Anything we should know? (optional)"
        className={FIELD_CLASS}
      />
    </div>
  );
}
