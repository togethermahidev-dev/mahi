import type { NextConfig } from 'next';

// A fully static site (written to web/out). Netlify serves the files as they are and reads the
// waitlist form straight from the HTML, so no Netlify Next.js plugin or server is involved.
const nextConfig: NextConfig = {
  output: 'export',
  // /thanks → /thanks/index.html, which every static host serves without rewrite rules.
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
