#!/usr/bin/env node
/**
 * Publishes an OTA update, then uploads its source maps to Sentry so error stack traces from
 * that update show real file names and lines. Run from ui/ through `pnpm ota:preview "<message>"`.
 *
 * If the upload fails the update is already live: it says so and how to retry the upload alone
 * (`pnpm --dir ui sentry:sourcemaps`), and exits non-zero so it isn't missed.
 */
const { spawnSync } = require('child_process');

/** The commands to run, in order. */
function steps(lane, message) {
  if (lane !== 'preview') throw new Error(`This publishes to preview only, not "${lane}".`);
  if (!message || !message.trim()) throw new Error('An update needs a message: "<build>.<ota> — <what changed>".');
  return [
    ['npx', ['-y', 'eas-cli@24.7.0', 'update', '--channel', lane, '--environment', lane, '--message', message]],
    ['npx', ['sentry-expo-upload-sourcemaps', 'dist']],
  ];
}

function main() {
  const [lane, ...rest] = process.argv.slice(2);
  const [publish, upload] = steps(lane, rest.join(' '));
  if (spawnSync(publish[0], publish[1], { stdio: 'inherit' }).status !== 0) process.exit(1);
  if (spawnSync(upload[0], upload[1], { stdio: 'inherit' }).status !== 0) {
    console.error(
      '\nThe update IS live, but its source maps did not reach Sentry, so its stack traces will be' +
        ' unreadable. Retry the upload alone: pnpm --dir ui sentry:sourcemaps'
    );
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { steps };
