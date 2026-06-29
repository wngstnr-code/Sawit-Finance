'use client';

import { useEffect, useState } from 'react';
import { ThemeProvider } from 'styled-components';
import {
  ClickProvider,
  ClickUI,
  CsprClickThemes,
} from '@make-software/csprclick-ui';
import type { CsprClickInitOptions } from '@make-software/csprclick-core-types';
import { CONTENT_MODE } from '@make-software/csprclick-core-types';
import StyledRegistry from '@/lib/StyledRegistry';
import { CSPR_CLICK_APP_ID } from '@/lib/config';

const clickOptions: CsprClickInitOptions = {
  appName: 'Sawit Finance',
  appId: CSPR_CLICK_APP_ID,
  contentMode: CONTENT_MODE.IFRAME,
  providers: ['casper-wallet', 'ledger', 'casper-signer', 'metamask-snap'],
};

export default function Providers({ children }: { children: React.ReactNode }) {
  // ClickUI loads a remote runtime; only mount it on the client after hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <StyledRegistry>
      <ThemeProvider theme={CsprClickThemes.light}>
        <ClickProvider options={clickOptions}>
          {mounted && <ClickUI />}
          {children}
        </ClickProvider>
      </ThemeProvider>
    </StyledRegistry>
  );
}
