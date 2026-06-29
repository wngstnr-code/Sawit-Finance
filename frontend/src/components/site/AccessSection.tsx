import { Section } from '@/components/ui/primitives';
import { Reveal } from '@/components/motion/Reveal';
import RequestAccess from '@/components/site/RequestAccess';

const STEPS = [
  {
    n: '01',
    t: 'Request access',
    d: 'Tell us who you are and your intended allocation. No public sale, no swap.',
  },
  {
    n: '02',
    t: 'Complete KYC',
    d: 'A licensed operator verifies you — compliance is enforced on-chain at claim.',
  },
  {
    n: '03',
    t: 'Receive allocation',
    d: 'SAWIT is issued to your Casper wallet against verified palm-oil production.',
  },
];

export default function AccessSection() {
  return (
    <Section id="access" className="py-24 sm:py-32">
      <Reveal>
        <div className="overflow-hidden rounded-3xl border border-line bg-card shadow-card-lg">
          <div className="grid gap-10 p-8 sm:p-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16 lg:p-16">
            {/* left: pitch */}
            <div className="flex flex-col">
              <div className="inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-brand">
                <span className="h-px w-5 bg-brand/40" />
                For investors
              </div>
              <h2 className="mt-4 font-display text-4xl font-semibold tracking-tighter2 text-ink text-balance sm:text-5xl">
                Access is onboarded, not bought.
              </h2>
              <p className="mt-5 max-w-md font-serif text-lg leading-relaxed text-muted sm:text-xl">
                SAWIT is a permissioned real-world asset. You don&rsquo;t swap for
                it on an exchange — a licensed operator onboards verified
                investors and issues tokens against real production. Yield is
                claimed in CSPR, KYC-gated on-chain.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <RequestAccess
                  context="landing"
                  className="rounded-lg bg-ink px-6 py-3 text-sm font-medium text-bg transition-transform hover:-translate-y-0.5"
                />
                <a
                  href="/app"
                  className="rounded-lg border border-line-2 bg-white px-6 py-3 text-sm font-medium text-ink transition-colors hover:border-brand/40"
                >
                  Open the app
                </a>
              </div>
              <p className="mt-4 font-mono text-[12px] text-faint">
                Primary issuance via the licensed operator · Casper Testnet
              </p>
            </div>

            {/* right: 3 steps as a connected timeline — line only spans badge→badge */}
            <ol className="flex flex-col justify-center">
              {STEPS.map((s, i) => (
                <li key={s.n} className="flex gap-5 pb-9 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-ink font-mono text-[13px] text-bg">
                      {s.n}
                    </span>
                    <span
                      aria-hidden
                      className={`mt-2 w-px bg-line-2 ${
                        i < STEPS.length - 1 ? 'flex-1' : 'h-10'
                      }`}
                    />
                  </div>
                  <div className="pt-1">
                    <div className="font-display text-base font-semibold text-ink">
                      {s.t}
                    </div>
                    <p className="mt-1 text-[14px] leading-relaxed text-muted">
                      {s.d}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
