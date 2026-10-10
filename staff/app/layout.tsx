import type { Metadata } from 'next';
import { Inter_Tight } from 'next/font/google';
import './globals.css';

// The app's one typeface. Family and weights match ui/src/constants/fonts.ts; the token check
// (web/scripts/check-tokens.mjs, run on this folder) fails if they drift.
const appFont = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  style: ['normal'],
  variable: '--font-app',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Mahi staff',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" className={appFont.variable}>
      <body suppressHydrationWarning className="min-h-dvh bg-paper font-sans text-ink-deep">{children}</body>
    </html>
  );
}
