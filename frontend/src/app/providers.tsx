'use client';

import dynamic from 'next/dynamic';

// CSPR.click touches `window` at import time, so load the whole wallet provider
// tree client-only (no SSR). The app renders after hydration — fine for a dApp.
const ClickProviders = dynamic(() => import('./ClickProviders'), {
  ssr: false,
});

export default function Providers({ children }: { children: React.ReactNode }) {
  return <ClickProviders>{children}</ClickProviders>;
}
