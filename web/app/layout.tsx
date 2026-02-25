import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MAHI — The Fitness Accountability App',
  description: 'Your camera. Your coach. Your proof. MAHI turns every workout into undeniable evidence — shared live with your squad.',
  openGraph: {
    title: 'MAHI — The Fitness Accountability App',
    description: 'Your camera. Your coach. Your proof.',
    siteName: 'MAHI',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MAHI — The Fitness Accountability App',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="grain">{children}</body>
    </html>
  );
}
