import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { COLORS } from '../../src/constants/tokens';
import './globals.css';

// The app's one typeface. Weights and styles match FONTS in src/constants/fonts.ts
// (regular, italic, semi-bold, bold); scripts/check-tokens.mjs fails the build if they drift.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Mahi — join the waitlist',
  description:
    'Mahi is the fitness accountability app: post one workout photo a day and tag three friends to keep each other going. Coming to iPhone and Android.',
};

export const viewport: Viewport = {
  themeColor: COLORS.paper,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" className={inter.variable}>
      <body className="min-h-dvh bg-paper font-sans text-ink-deep">{children}</body>
    </html>
  );
}
