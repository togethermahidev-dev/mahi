/**
 * OTA counter — how many over-the-air updates since the last native build. Shown on the version
 * line (`v0.1.0 10.09`) as proof on the phone that an update landed.
 *
 * Never edit by hand:
 *   - every OTA update:   node scripts/bump-build.cjs --ota   (then commit, then publish)
 *   - every native build: pnpm release:prepare                (build +1, this back to 0)
 *
 * History (newest first):
 *   build 10 · 27 — the full-screen notifications page and camera reminder line (hidden until push is switched on); message alerts open Messages (2026-10-02)
 *   build 10 · 26 — Mahi points replace the streak wording (Points and Best, N points badges); glass bar on the camera only (2026-10-02)
 *   build 10 · 25 — tap a comment to open the commenter's profile (2026-10-02)
 *   build 10 · 24 — camera flash and selfie screen flash, sharper photos, richer haptics app-wide; build-11 pieces (Apple icons, hold-to-preview, tap to focus, Didit, RevenueCat) present but off (2026-10-02)
 *   build 10 · 23 — one-scroll profiles, post viewer, profile picture zoom, glass bar on the left, hold to view, raised like buttons, comment likes, Settings/empty-feed tidy-up; video code ready but off until build 11 (2026-10-02)
 *   build 10 · 22 — post when tagged, answered-tag counter (shown as Mahi points since 2026-10-02), rest days and calendar gone (2026-10-01)
 *   build 10 · 21 — sideways and up/down swipes share the touch (Camera sideways fix) (2026-10-01)
 *   build 10 · 20 — more swipe diagnostics (2026-10-01)
 *   build 10 · 19 — solid rail pill outline; swipe diagnostics off-screen (2026-10-01)
 *   build 10 · 18 — preview-only swipe diagnostics (2026-10-01)
 *   build 10 · 17 — invite-3-friends step, password reset, delete account, sentence-case labels, no mic prompt (2026-10-01)
 *   build 10 · 16 — Camera sideways swipe fix; welcome cards; locked-feed card + feed timer; nav rail pill + morph selector + hold-drag; camera two-photo guide (2026-10-01)
 *   build 10 · 15 — sideways swipe on Feed works again (2026-10-01)
 *   build 10 · 14 — native sheets, menus and pickers; password + code autofill; gesture-handler swipes; empty feed below header; profile grid shows 9, suggestions fold away (2026-10-01)
 *   build 10 · 13 — glass nav rail, Inter font, everything on design tokens (2026-09-30)
 *   build 10 · 12 — posts ask for all three slots once invite links are on (2026-09-28)
 *   build 10 · 11 — tag picker says "tagged you, can't tag back" (2026-09-28)
 *   build 10 · 09 — carried over from the hand-typed counter in Settings (2026-09-23)
 */
export const OTA_NUMBER = 0;
