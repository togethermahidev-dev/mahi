import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

// The app's one typeface. Weights match FONTS in ui/src/constants/fonts.ts; the token check
// (web/scripts/check-tokens.mjs, run on this folder) fails if they drift.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Mahi staff',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" className={inter.variable}>
      <body className="min-h-dvh bg-paper font-sans text-ink-deep">{children}</body>
    </html>
  );
}
