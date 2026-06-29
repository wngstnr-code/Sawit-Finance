import type { Metadata } from 'next';
import { Space_Grotesk, Fraunces, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import Providers from './providers';

// Free stand-ins for the licensed brand fonts:
//   --font-display / --font-sans  ← "Gelix"   (geometric sans)  → Space Grotesk
//   --font-serif                  ← "Arizona" (flare serif)     → Fraunces
// To use the real fonts, drop the .woff2 files in public/fonts/ and swap these
// for next/font/local definitions pointing at them (CSS var names stay the same).
const display = Space_Grotesk({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});
const serif = Fraunces({
  variable: '--font-serif',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
});
const sans = Space_Grotesk({ variable: '--font-sans', subsets: ['latin'] });
const mono = JetBrains_Mono({ variable: '--font-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Sawit Finance',
  description:
    'Real palm oil, tokenized. Earn CSPR yield from verified Indonesian CPO production — on-chain on Casper, driven by autonomous AI agents.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${serif.variable} ${sans.variable} ${mono.variable} h-full`}
    >
      <body className="min-h-full">
        {/* react-modal (used by CSPR.click UI) calls setAppElement('#root') */}
        <div id="root">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
