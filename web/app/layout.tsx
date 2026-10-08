import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { COLORS } from '../../ui/src/constants/tokens';
import './globals.css';

// The app's one typeface. Weights and styles match FONTS in ui/src/constants/fonts.ts
// (regular, semi-bold, bold; no italic); scripts/check-tokens.mjs fails the build if they drift.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Mahi — join the waitlist',
  description:
    "Mahi is the fitness accountability app: your first workout needs no tags. After that, answer a friend's tag within 48 hours with any workout, pick 3 friends to hold accountable and earn Mahi points. Coming to iPhone and Android.",
};

export const viewport: Viewport = {
  themeColor: COLORS.paper,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" className={inter.variable}>
      <body suppressHydrationWarning className="min-h-dvh bg-paper font-sans text-ink-deep">{children}</body>
    </html>
  );
}
