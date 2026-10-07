// Run: node --test scripts/ota-publish.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const { steps } = require('./ota-publish.cjs');

test('publishes the update, then uploads its source maps to Sentry', () => {
  assert.deepStrictEqual(steps('preview', '10.24 — clearer error reports'), [
    [
      'npx',
      ['-y', 'eas-cli@24.7.0', 'update', '--channel', 'preview', '--environment', 'preview', '--message', '10.24 — clearer error reports'],
    ],
    ['npx', ['sentry-expo-upload-sourcemaps', 'dist']],
  ]);
});

test('refuses any lane but preview, or an empty message', () => {
  assert.throws(() => steps('staging', 'x'), /preview only/);
  assert.throws(() => steps('preview', ''), /message/);
});
