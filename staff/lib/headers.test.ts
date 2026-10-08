// Run: pnpm test:staff (node's own test runner; no packages needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import nextConfig from '../next.config.ts';

test('every staff page is never cached, sniffed, framed, indexed or sent on as a referrer', async () => {
  const rules = await nextConfig.headers!();
  assert.equal(rules.length, 1);
  assert.equal(rules[0].source, '/:path*');
  const values = Object.fromEntries(rules[0].headers.map((h) => [h.key, h.value]));
  assert.deepEqual(values, {
    'Cache-Control': 'no-store',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
  });
});
