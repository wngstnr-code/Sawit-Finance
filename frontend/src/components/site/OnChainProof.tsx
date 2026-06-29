import { Section, Eyebrow } from '@/components/ui/primitives';
import { Reveal, Stagger, StaggerItem } from '@/components/motion/Reveal';
import { LOOP_STEPS, txUrl } from '@/lib/onchain';

export default function OnChainProof() {
  return (
    <Section id="proof" className="flex min-h-screen flex-col justify-center py-24 sm:py-32">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <Reveal className="max-w-2xl">
          <Eyebrow>Proof, on-chain</Eyebrow>
          <h2 className="mt-4 font-display text-4xl font-semibold tracking-tighter2 text-ink text-balance sm:text-5xl">
            The full economic loop, already executed.
          </h2>
          <p className="mt-5 font-serif text-lg leading-relaxed text-muted sm:text-xl">
            Every step below is a real transaction on Casper Testnet — record →
            mint → fund → claim, including cross-contract CPI and a KYC-gated
            payout. Verify each on the explorer.
          </p>
        </Reveal>
      </div>

      <Stagger className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-2">
        {LOOP_STEPS.map((s) => (
          <StaggerItem key={s.n} className="bg-card p-7">
            <div className="flex items-center gap-3">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-ink font-mono text-[13px] font-semibold text-bg">
                {s.n}
              </span>
              <h3 className="font-display text-lg font-semibold text-ink">
                {s.title}
              </h3>
            </div>
            <p className="mt-3 text-[14px] leading-relaxed text-muted">
              {s.desc}
            </p>
            <a
              href={txUrl(s.tx)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 font-mono text-[12px] text-brand transition-colors hover:text-ink"
            >
              {s.entrypoint} · {s.tx.slice(0, 10)}… ↗
            </a>
          </StaggerItem>
        ))}
      </Stagger>
    </Section>
  );
}
