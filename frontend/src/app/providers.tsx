'use client';

import dynamic from 'next/dynamic';
import { LocaleProvider } from '@/lib/i18n';

const ClickProviders = dynamic(() => import('./ClickProviders'), {
  ssr: false,
});

// LocaleProvider wraps everything here (root layout) so the EN/ID choice is
// shared across the landing page and the /app routes. CSPR.click's
// ClickProviders stays inside it — the wallet UI doesn't need locale context,
// but nesting order here keeps both providers available to all descendants.
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <ClickProviders>{children}</ClickProviders>
    </LocaleProvider>
  );
}
