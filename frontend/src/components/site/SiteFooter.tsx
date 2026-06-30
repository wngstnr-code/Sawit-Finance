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
            <div className="mt-4 flex items-center gap-2.5">
              <a
                href="https://x.com/wnsstt"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="X (Twitter)"
                className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-brand/40 hover:text-brand"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817-5.967 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
                </svg>
              </a>
              <a
                href="https://github.com/wngstnr-code/Sawit-Finance"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-brand/40 hover:text-brand"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 .5C5.73.5.67 5.57.67 11.84c0 5.01 3.25 9.26 7.76 10.76.57.1.78-.25.78-.55v-1.92c-3.16.69-3.83-1.52-3.83-1.52-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.75 1.18 1.75 1.18 1.02 1.75 2.68 1.25 3.33.95.1-.74.4-1.25.72-1.54-2.52-.29-5.17-1.26-5.17-5.6 0-1.24.44-2.25 1.17-3.04-.12-.29-.51-1.45.11-3.02 0 0 .96-.31 3.14 1.16a10.9 10.9 0 0 1 2.86-.39c.97 0 1.95.13 2.86.39 2.18-1.47 3.14-1.16 3.14-1.16.62 1.57.23 2.73.11 3.02.73.79 1.17 1.8 1.17 3.04 0 4.35-2.66 5.31-5.19 5.59.41.36.78 1.05.78 2.12v3.14c0 .3.21.66.79.55a11.35 11.35 0 0 0 7.75-10.76C23.33 5.57 18.27.5 12 .5Z" />
                </svg>
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
