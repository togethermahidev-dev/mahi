import type { NextConfig } from 'next';

// A server-rendered app (not a static export like web/): every page checks the signed-in person
// against staff_users on the server before it shows anything.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Staff pages must never be cached by a browser or a shared cache, type-sniffed, framed or
  // indexed. Tests: lib/headers.test.ts
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default nextConfig;
