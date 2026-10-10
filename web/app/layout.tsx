import type { Metadata, Viewport } from 'next';
import { Inter_Tight } from 'next/font/google';
import { COLORS } from '../../ui/src/constants/tokens';
import './globals.css';

// The app's one typeface. Family, weights and styles match ui/src/constants/fonts.ts (five
// weights, no italic); scripts/check-tokens.mjs fails the build if they drift.
const appFont = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  style: ['normal'],
  variable: '--font-app',
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
    <html lang="en-GB" className={appFont.variable}>
      <body suppressHydrationWarning className="min-h-dvh bg-paper font-sans text-ink-deep">{children}</body>
    </html>
  );
}
