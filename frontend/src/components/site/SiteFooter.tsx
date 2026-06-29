import { CONTRACTS } from '@/lib/config';
import { pkgUrl } from '@/lib/onchain';

export default function SiteFooter() {
  return (
    <footer className="border-t border-line bg-bg-2/50">
      {/* links */}
      <div>
        <div className="mx-auto grid w-full max-w-content gap-8 px-5 py-12 sm:grid-cols-[1.4fr_1fr_1fr] sm:px-8">
          <div>
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/sawit-fi-icon-black.svg" alt="" className="h-7 w-7" />
              <span className="font-display text-base text-ink">
                <span className="font-semibold">Sawit</span>
                <span className="font-light text-muted"> Finance</span>
              </span>
            </div>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-muted">
              Tokenized Indonesian palm oil on Casper. Built for the Casper
              Agentic Buildathon 2026.
            </p>
            <div className="mt-4 flex items-center gap-4 text-[13px]">
              <a
                href="https://x.com/wnsstt"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted transition-colors hover:text-brand"
              >
                X ↗
              </a>
              <a
                href="https://github.com/wngstnr-code/Sawit-Finance"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted transition-colors hover:text-brand"
              >
                GitHub ↗
              </a>
            </div>
          </div>

          <div>
            <div className="text-[12px] uppercase tracking-[0.12em] text-faint">
              Contracts
            </div>
            <ul className="mt-3 space-y-2">
              {Object.entries(CONTRACTS).map(([name, hash]) => (
                <li key={name}>
                  <a
                    href={pkgUrl(hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] capitalize text-muted transition-colors hover:text-brand"
                  >
                    {name.replace(/([A-Z])/g, ' $1')} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-[12px] uppercase tracking-[0.12em] text-faint">
              Network
            </div>
            <ul className="mt-3 space-y-2 text-[13px] text-muted">
              <li>Casper Testnet</li>
              <li>CPO feed: FRED PPOILUSDM (IMF)</li>
              <li>
                <a
                  href="/app"
                  className="text-muted transition-colors hover:text-brand"
                >
                  Launch the app →
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mx-auto w-full max-w-content px-5 pb-6 sm:px-8">
          <p className="border-t border-line pt-6 text-[12px] text-faint">
            © 2026 Sawit Finance
          </p>
        </div>

        {/* giant wordmark */}
        <div className="overflow-hidden px-5 sm:px-8">
          <div className="mx-auto max-w-content">
            <div className="select-none whitespace-nowrap text-center font-display text-[13vw] font-semibold leading-[0.8] tracking-tighter2">
              <span className="text-ink/[0.09]">Sawit</span>
              <span className="font-light text-ink/[0.05]"> Finance</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
