/**
 * OTA counter — how many over-the-air updates since the last native build. Shown on the version
 * line (`v0.1.0 10.09`) as proof on the phone that an update landed.
 *
 * Never edit by hand:
 *   - every OTA update:   node scripts/bump-build.cjs --ota   (then commit, then publish)
 *   - every native build: pnpm release:prepare                (build +1, this back to 0)
 *
 * History (newest first):
 *   build 10 · 17 — invite-3-friends step, password reset, delete account, sentence-case labels, no mic prompt (2026-10-01)
 *   build 10 · 16 — Camera sideways swipe fix; welcome cards; locked-feed card + feed timer; nav rail pill + morph selector + hold-drag; camera two-photo guide (2026-10-01)
 *   build 10 · 15 — sideways swipe on Feed works again (2026-10-01)
 *   build 10 · 14 — native sheets, menus and pickers; password + code autofill; gesture-handler swipes; empty feed below header; profile grid shows 9, suggestions fold away (2026-10-01)
 *   build 10 · 13 — glass nav rail, Inter font, everything on design tokens (2026-09-30)
 *   build 10 · 12 — posts ask for all three slots once invite links are on (2026-09-28)
 *   build 10 · 11 — tag picker says "tagged you, can't tag back" (2026-09-28)
 *   build 10 · 09 — carried over from the hand-typed counter in Settings (2026-09-23)
 */
export const OTA_NUMBER = 17;
