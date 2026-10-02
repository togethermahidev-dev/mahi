# Feature Flags (PostHog)

New features ship behind a PostHog feature flag, so one can be flipped off or rolled out gradually, and so
each goal in the loop ([HANDOVER §4](./HANDOVER.md#4-the-goal-loop-goal-driven-development-process)) ships
behind a flag that's already live. Only keys that code reads stay in the registry; a shipped surface with no
flag is simply on.

**State in PostHog (checked 2026-10-01):** 14 of the 15 keys exist, all active at **100% for everyone**.
The seven added 2026-10-01 (`onboarding-welcome-cards`, `feed-lock-explainer`, `nav-rail-morph`,
`camera-pip-guide`, `tags-invite-step`, `auth-password-reset`, `account-delete`) and four that had never
been created (`nav-glass-rail`, `invite-links`, `tag-challenges`, `mahi-points`) were created that day.
**`push-core` is deliberately not created**, so it reads as off, until push notifications are set up on
the server (Apple/Google push credentials, `send-push` deployed — see [go-live-runbook.md](./go-live-runbook.md)).
**`video-posts` (added 2026-10-02) is a default-off flag:** the owner wants it OFF for everyone.
Create it in PostHog **switched off** (or at 0%); it reads as off until PostHog says true.
**`ios-sf-symbols` (added 2026-10-02) is also default-off:** create it in PostHog **switched off**; turn it
on only once build 11 is on the phones (build 10 ignores it either way).
**`context-menu-preview` (added 2026-10-02) is default-off too:** it needs build 11; create it in PostHog
**switched off** and turn it on only once build 11 is out.

PostHog project: **EU region, `project_id=130791`**.

## Reading a flag in the app

```ts
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

const showBell = useFeatureFlag('notifications-core');
if (!showBell) return null;
```

- Keys are the typed `FeatureFlag` union in [`src/lib/featureFlags.ts`](../src/lib/featureFlags.ts) — the single
  source of truth. Add a key there when you add a flag in PostHog.
- The hook is a thin `useSyncExternalStore` wrapper over the shared `posthog` singleton (no `PostHogProvider`),
  re-rendering whenever flags (re)load. `App.tsx` calls `posthog.reloadFeatureFlagsAsync()` after `identify`, and
  `posthog.reset()` on sign-out clears flags (so no sign-out reset wiring is needed — guardrail #6 is satisfied).
- **Default-on:** `resolveFlag` returns `true` when PostHog isn't configured (no key) or while flags haven't
  loaded yet, so a feature is never hidden by analytics being slow or absent. Only an explicit `false` hides it.
  **But a key that doesn't exist in PostHog reads as OFF once flags have loaded** (the SDK returns `false` for
  a missing key). So every new flag must be created in PostHog, at 100%, before the update that uses it ships —
  found 2026-10-01, when seven new features stayed hidden on the test phones until their flags were created.
  This pure logic is unit-tested in [`src/lib/__tests__/featureFlags.test.ts`](../src/lib/__tests__/featureFlags.test.ts).
- **Default-off flags** (`DEFAULT_OFF_FLAGS` in `featureFlags.ts`: `video-posts`, `ios-sf-symbols` and `context-menu-preview`): off while flags
  load, off with no PostHog key, off when missing from PostHog — on only when PostHog returns `true`. Use this
  for a feature that must never show, even for a moment on cold start (video posts would otherwise be able to
  ask for the microphone before flags load).
- Reference gate: the notifications bell in [`src/components/AppHeader.tsx`](../src/components/AppHeader.tsx) is
  gated by `notifications-core`.

## The flags

Eighteen keys, every one read by code. (Suggested follows have no flag: they are always on.)

**Notifications:** `notifications-core` (the bell in the header and the notifications list)

**Tag loop** (keys map to [tag-loop-plan.md](./tag-loop-plan.md) phases; they hide UI only — server rules
are switched in the `app_config` table):
`push-core` (P1, the one-time "turn on notifications" prompt — **not in PostHog, so off**) · `tag-challenges` (P2, the open-tags banner) · `mahi-points` (P5, points badges) ·
`invite-links` (P7, invite a slot from the tag sheet and share the links after posting; the 6-character
code works, but links point at `togethermahi.com`, which doesn't resolve yet — see [tag-loop-plan.md](./tag-loop-plan.md) Phase 7)
`feed-lock-explainer` (the locked feed names who tagged you and how long you have to answer, or, with
no open tag, says you can post again when a friend tags you; the open feed says how long it stays open,
or, if you're tagged, when it locks. Off = the plain locked post cards.)
`tags-invite-step` (when friends can't fill a post's tag slots, the tag sheet leads with "Invite N friends to post", a big invite button and a count of slots filled; after posting, a list of the invite links shows which are sent and lets each be sent again. Off = the small + stepper and share sheets one after another.)

**Camera:** `camera-pip-guide` (before the first photo, a small window in the preview's photo-in-photo
spot says what comes second — "Selfie next" / "Your view next"; after it, the window shows the photo just
taken while the screen switches to the other camera. Status reads "Taking photo…", "Switching…", "Tap for
your selfie" / "Tap for your view". Off = no window and the old capture labels.)

**Posts:** `video-posts` (**default off**; owner: off for everyone). On: each of a post's two shots can be a
photo or a video of up to 15 seconds — a Photo / Video switch by the shutter, and press and hold the shutter
to record (tap still takes a photo; letting go or 15 seconds stops). The microphone is asked for only the
first time someone records. Videos in the feed, the small window, the post viewer and the preview play muted
and looping while on screen, with a "Turn sound on" / "Turn sound off" button; the profile grid marks video
posts with a video icon. Needs the `expo-video` native module (a new native build) and migration
`20261002100000_video_posts`. On a build without the native module (build 10) it reads as off. Off = today's
photo-only camera exactly, and the app never asks for the microphone.)

**Hold to preview:** `context-menu-preview` (**default off**; iPhone only; needs build 11, which carries
`@expo/ui`). On: press and hold and the content pops out over a blurred background with a short menu
below (Apple's own context menu). Profile grid squares: the post's photo, with Open, Like / Unlike and
Share (Share sends the photo itself — post links expire within the hour — fetched to the phone only
for the share sheet and deleted when it closes). A tap still opens the post viewer; locked squares
don't pop. VoiceOver: the same choices are actions on the square. On build 10 or Android it reads as
off. Off = today's grid exactly.

**Comments:** `comment-likes` (a heart and a count on each comment in the comments sheet — in the feed
and the post viewer; a tap likes or unlikes at once and rolls back if the server says no; tap the count
to open "Likes", who liked it, newest first, with a tap on a name opening their profile. People blocked
either way can't like each other's comments and don't show in the list. Counts and the list are read
fresh from the server each time; nothing is kept on the device. Needs migration
`20261002130000_comment_likes`. Off = comments exactly as before, no hearts.)

**Look:** `ios-sf-symbols` (**default off**; needs build 11). On an iPhone, the app's plain drawn icons
become Apple's own (SF Symbols) at the same size and colour: search → magnifying glass, camera, feed →
three left-aligned lines, profile → person, settings → gear, notifications → bell, heart (red filled heart
when liked), video, sound on / sound off (speaker with waves / speaker struck through). The brand "echo"
icons — comment and messages bubbles with the blue offset layer, and the like medal — stay drawn. Mapping
in [`src/lib/sfSymbols.ts`](../src/lib/sfSymbols.ts). Needs the `expo-symbols` native module: on build 10
and on Android it reads as off. Off = today's drawn icons exactly.)

**Navigation:** `nav-glass-rail` (floating glass rail on the left with Camera, Feed, Messages and
Profile; replaces the side dots and the header's Profile/Messages pills. Off = the old dots and pills.)
`nav-rail-morph` (the rail reads as one floating pill with an outline and shadow; one selector slides
and stretches between icons; press and hold or drag along the rail to switch screens live. A touch that
starts on the rail never moves the pages. Off = today's rail.)

**Onboarding:** `onboarding-welcome-cards` (one-time 3-card welcome carousel after sign-in that
teaches post when a friend tags you → every post tags 3 friends → feed opens/locks; shown once per account
per device, and again from Settings → Help. Off = never shown, and the Help row is hidden.)

**Account:** `auth-password-reset` ("Forgot password?" on the log-in sheet emails a 6-digit code, then
the code and a new password set it and log you in. Needs the `send-reset-code` and `reset-password`
functions and migration `20261001100000_password_reset_codes`. Off = no "Forgot password?" link.) ·
`account-delete` (Settings → "Delete account" asks once, plainly, then deletes the profile, posts,
photos, messages and streak and logs out. Needs the `delete-account` function. Off = no row.)

**Sign-in placeholders** (pills on the welcome screen with no sign-in behind them yet):
`auth-apple-signin` · `auth-google-signin`. **Currently on at 100%** — the owner's choice on 2026-09-23 to
preview the look; tapping them does nothing. Set both to 0% before real users see the welcome screen.

## Creating / managing flags

Flags are managed through the project-scoped **PostHog MCP** (`.mcp.json`, see below). Create a flag at 100% for
everyone: `active: true`, one release condition with `rollout_percentage: 100` and no property filters.

REST equivalent (used to seed the current set), `POST` to
`https://eu.posthog.com/api/projects/130791/feature_flags/` with `Authorization: Bearer <personal-api-key>`:

```json
{ "key": "my-flag", "name": "My flag", "active": true,
  "filters": { "groups": [{ "properties": [], "rollout_percentage": 100 }] } }
```

## MCP scoping & keys (project-specific)

Both backend MCPs are defined **only** in this repo's gitignored `.mcp.json` and enabled only in
`.claude/settings.json` — they do **not** load in any other project, and Mahi's `~/.claude.json` entry has no
user-scoped servers.

- **Supabase MCP** — pinned to `--project-ref=pzepodsppqtvptzmwxzs` (the Mahi project); it cannot reach any other
  Supabase project.
- **PostHog MCP** — `mcp-remote` to `https://mcp.posthog.com/mcp?project_id=130791`, authenticated with a
  **personal API key (`phx_…`)** passed via the `POSTHOG_AUTH_HEADER` env var. PostHog has a single MCP host
  (`mcp.posthog.com`) that auto-routes to your data region (EU here) from the key — there is **no**
  `eu.mcp.posthog.com` (that hostname has no DNS record). `?project_id=130791` pins the Mahi project.

**Two PostHog keys, two purposes — never mix them:**
- The app SDK uses the **public project key** (`phc_…`) via `EXPO_PUBLIC_POSTHOG_API_KEY` (safe to ship).
- The MCP uses the **personal API key** (`phx_…`), which lives **only** in `.mcp.json`. It must **never** go in
  `EXPO_PUBLIC_*` / `.env` — those are bundled into the shipped app.

**Hard project-lock for PostHog:** a personal API key reaches the whole PostHog org unless restricted. For a true
guarantee that this key only touches project 130791, scope it in PostHog → Settings → Personal API keys to that
project with `feature_flag:read` + `feature_flag:write` scopes only. Rotate the seed key before launch.
