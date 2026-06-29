'use client';

import { useState } from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import { ServerStyleSheet, StyleSheetManager } from 'styled-components';

// Collects styled-components styles during SSR so CSPR.click UI renders without
// a flash of unstyled content. Standard Next.js App Router pattern.
export default function StyledRegistry({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sheet] = useState(() => new ServerStyleSheet());

  useServerInsertedHTML(() => {
    const styles = sheet.getStyleElement();
    sheet.instance.clearTag();
    return <>{styles}</>;
  });

  if (typeof window !== 'undefined') return <>{children}</>;

  return (
    <StyleSheetManager sheet={sheet.instance}>{children}</StyleSheetManager>
  );
}
