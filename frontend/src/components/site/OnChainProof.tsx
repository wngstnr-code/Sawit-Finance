'use client';

import { Reveal } from '@/components/motion/Reveal';
import { LOOP_STEPS, X402_PROOF, txUrl } from '@/lib/onchain';
import { useLocale } from '@/lib/i18n';

// Sawit's on-chain loop is 4 real steps (record -> mint -> fund -> claim) plus
// a separate x402 data-payment proof. Tx hashes/entrypoints come from
// `lib/onchain.ts`; row copy is bilingual via `t.proof.steps`, keyed by
// entrypoint.
const ROWS = [...LOOP_STEPS, X402_PROOF];

export default function OnChainProof() {
  const { t } = useLocale();

  return (
    <section
      id="proof"
      className="relative isolate flex min-h-screen flex-col justify-center overflow-hidden bg-bg-2/50 py-24 sm:py-32"
    >
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <Reveal className="max-w-2xl">
          <div className="inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-brand">
            <span className="h-px w-5 bg-brand/40" />
            {t.proof.eyebrow}
          </div>
          <h2 className="mt-4 font-display text-4xl font-semibold tracking-tighter2 text-ink text-balance sm:text-5xl">
            {t.proof.title}
          </h2>
          <p className="mt-5 font-serif text-lg leading-relaxed text-muted sm:text-xl">
            {t.proof.subcopy}
          </p>
        </Reveal>

        {/* vertical ledger of proof rows */}
        <div className="mt-14 flex flex-col">
          {ROWS.map((s, i) => {
            const n = String(s.n).padStart(2, '0');
            const url = 'url' in s ? s.url : txUrl(s.tx);
            const copy = t.proof.steps[s.entrypoint];
            const isLast = i === ROWS.length - 1;

            return (
              <Reveal key={s.n} delay={i * 0.06} className="relative flex gap-5 sm:gap-7">
                {/* numbered rail */}
                <div className="flex flex-col items-center">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-card font-mono text-[13px] text-ink shadow-card">
                    {n}
                  </span>
                  {!isLast && (
                    <span
                      aria-hidden
                      className="mt-1 w-px flex-1 bg-line"
                    />
                  )}
                </div>

                {/* content */}
                <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-10'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-xl font-semibold text-ink">
                      {copy.title}
                    </h3>
                    <span
                      aria-hidden
                      title="Verified on-chain"
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line text-[11px] text-brand"
                    >
                      ✓
                    </span>
                  </div>

                  <p className="mt-2 text-[14px] leading-relaxed text-muted">
                    {copy.desc}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                    <span className="rounded-md border border-line bg-bg-2/60 px-2 py-1 font-mono text-[11px] text-brand">
                      {s.entrypoint}
                    </span>
                    {s.tx ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 break-all font-mono text-[12px] text-ink/70 transition-colors hover:text-orange"
                      >
                        {s.tx.slice(0, 12)}…{s.tx.slice(-6)} ↗
                      </a>
                    ) : (
                      <span className="font-mono text-[12px] text-faint">
                        {t.proof.pending}
                      </span>
                    )}
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
