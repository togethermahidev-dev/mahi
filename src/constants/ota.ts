/**
 * OTA counter — how many over-the-air updates since the last native build. Shown on the version
 * line (`v0.1.0 10.09`) as proof on the phone that an update landed.
 *
 * Never edit by hand:
 *   - every OTA update:   node scripts/bump-build.cjs --ota   (then commit, then publish)
 *   - every native build: pnpm release:prepare                (build +1, this back to 0)
 *
 * History (newest first):
 *   build 10 · 09 — carried over from the hand-typed counter in Settings (2026-09-23)
 */
export const OTA_NUMBER = 10;
