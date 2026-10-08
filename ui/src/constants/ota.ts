/**
 * OTA counter — how many over-the-air updates since the last native build. Shown on the version
 * line (`v0.1.0 10.09`) as proof on the phone that an update landed.
 *
 * Never edit by hand:
 *   - every OTA update:   node scripts/bump-build.cjs --ota   (then commit, then publish)
 *   - every native build: pnpm release:prepare                (build +1, this back to 0)
 *
 * History (newest first):
 *   build 13 · 02 — the waiting camera pulls down to open the card behind it (tap the arrow to
 *     close); profile line "Only you are accountable for showing up." (2026-10-08)
 *   build 13 · 01 — post photos download once per phone instead of on every open; profile photos
 *     uploaded at 1080 px (2026-10-08)
 *   build 12 · 38 — "friends" instead of "mates" everywhere; invite buttons say "Hold someone else
 *     accountable"; fixes from the new-user walkthrough (joined invites say you follow each other,
 *     ended links say so, who you just tagged after the +1, plain "and 2 more", VoiceOver and
 *     Reduce Motion fixes) (2026-10-08)
 *   build 12 · 37 — closing the share sheet no longer leaves an unsent invite; buttons say "Invite an
 *     accountability mate"; the camera gives when pulled down; the +1 flies into the counter;
 *     the feed clears post by post; last-6-hours ring; Answered stamp; Camera tab badge; miss
 *     roll-down; profile points card (2026-10-07)
 *   build 12 · 36 — Your invites say who each link went to and how (WhatsApp, Messages, a contact),
 *     what it does and when; Resend goes back to the same place; Waiting, Joined, Older groups;
 *     off switches for the new native features (2026-10-07)
 *   build 12 · 35 — hold a message for Apple's menu with a quick emoji row; reaction badges;
 *     double-tap to heart; the light/dark toggle is felt (2026-10-07)
 *   build 12 · 34 — the camera names the mates on your clock; "@sam is waiting on you"; a miss
 *     moment once per miss; mates wording throughout; invite messages say 48 hours; the website
 *     invite page says who tagged you (2026-10-07)
 *   build 12 · 33 — you can tag back the mate you answer; three mate circles fill as you tag;
 *     posts say "Answered @sam in 2h"; new sign-ups load their profile and claim their invite
 *     reliably (2026-10-07)
 *   build 12 · 32 — tips redone: Apple's own popover on the thing it explains (spotlight on older
 *     builds); a count badge on See your invites and a Your invites row in Settings; the waiting
 *     card says why you post when tagged (2026-10-07)
 *   build 12 · 31 — Your invites: see who you invited and who joined; resend once a day (3 times)
 *     or cancel a link (Profile, and the camera's waiting card) (2026-10-07)
 *   build 12 · 30 — a padlock on the Feed tab while the feed is locked; invite link opens and the
 *     app update are counted in PostHog (2026-10-07)
 *   build 12 · 29 — Invite a mate any time; a first post that answers a mate needs no tags;
 *     one-time tips where people get lost; tag clock turns yellow under 6 hours; a reminder of an
 *     open tag when Mahi opens (2026-10-07)
 *   build 12 · 28 — new people are guided by how they arrived (tagged by a mate, or alone); your
 *     first post earns your first point; every tag countdown ticks; a +1 celebration explains
 *     each point; clearer first-time wording (2026-10-07)
 *   build 12 · 27 — the camera's tag pill no longer covers the points counter; after deleting your
 *     posts the camera no longer offers a free first post (2026-10-07)
 *   build 12 · 26 — profile workout grids have hairline gaps between rows again (2026-10-07)
 *   build 12 · 25 — the camera tells someone posting for the first time whose tag their post
 *     answers (2026-10-07)
 *   build 12 · 24 — live follow/unfollow, likes and comments; blank names no longer crash; twelve
 *     always-on switches made standard; crash reports and founder analytics (Sentry, PostHog);
 *     a failed profile photo save keeps your photo; sign-up checks if a username is free on the
 *     server (2026-10-07)
 *   build 12 · 23 — the feed shows only your latest post among the people you follow, newest
 *     first; older posts stay on your Profile (2026-10-07)
 *   build 12 · 22 — sideways swipes work on Profile again; Messages and Profile swap places
 *     (Messages, Feed, Camera, Profile); the crew strip over the feed is gone (2026-10-07)
 *   build 12 · 21 — tag requests and invite links say before acceptance that both people will
 *     automatically follow each other, then confirm it after acceptance (2026-10-07)
 *   build 12 · 20 — right-swipe dismissal restored on profiles and added to friends lists;
 *     follow/unfollow reconciles from the database and open friend lists update live (2026-10-07)
 *   build 12 · 19 — six-blade launch iris, focus/capture/release haptics, direct app reveal and
 *     Reduce Motion fade (2026-10-07)
 *   build 12 · 16 — Maximus's Q1-Q10 answers, deletable posts with permanent first-post history,
 *     any mix of friends and people not on Mahi in the three tags, stable media caching, and the
 *     Settings security/privacy reorganisation (2026-10-06)
 *   build 12 · 06 — search magnifier on the Profile screen (2026-10-05)
 *   build 12 · 05 — pinch to zoom on post photos, for everyone (2026-10-05)
 *   build 12 · 04 — profile picture as a circle (tap outside to close), smooth swipe off a profile, like/comment higher, live feed countdown, no-tags card, invites carry their code, refused posts keep their photos; pinch to zoom built but off (2026-10-05)
 *   build 12 · 03 — Messages is the last swipe page: Camera ⇄ Feed ⇄ Profile ⇄ Messages (2026-10-05)
 *   build 12 · 02 — swipe pages in one row, Camera ⇄ Feed ⇄ Profile, no up/down swiping; Messages opens from its tab; tab bar order Camera, Feed, Profile, Messages (2026-10-05)
 *   build 12 · 01 — phone's own tab bar on build 12 with the swipe pages kept (tap a tab or swipe); new tag screen and in-app invites built but off (2026-10-05)
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
export const OTA_NUMBER = 2;
