import type { NextConfig } from 'next';

// A server-rendered app (not a static export like web/): every page checks the signed-in person
// against staff_users on the server before it shows anything.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Staff pages must never be cached by a browser or a shared cache, framed or indexed.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default nextConfig;
