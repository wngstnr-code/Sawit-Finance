'use client';

import dynamic from 'next/dynamic';

const ClickProviders = dynamic(() => import('./ClickProviders'), {
  ssr: false,
});

export default function Providers({ children }: { children: React.ReactNode }) {
  return <ClickProviders>{children}</ClickProviders>;
}
