# Feature Flags (PostHog)

New features ship behind a PostHog feature flag, so one can be flipped off or rolled out gradually, and so
each goal in the loop ([HANDOVER §4](./HANDOVER.md#4-the-goal-loop-goal-driven-development-process)) ships
behind a flag that's already live. Only keys that code reads stay in the registry; a shipped surface with no
flag is simply on.

**State in PostHog (checked 2026-10-01):** 14 of the 15 keys exist, all active at **100% for everyone**.
The seven added 2026-10-01 (`onboarding-welcome-cards`, `feed-lock-explainer`, `nav-rail-morph`,
`camera-pip-guide`, `tags-invite-step`, `auth-password-reset`, `account-delete`) and four that had never
been created (`nav-glass-rail`, `invite-links`, `tag-challenges`, `mahi-points`) were created that day.
Since 2026-10-07 the code no longer reads twelve of these (see
[Removed from code 2026-10-07](#removed-from-code-2026-10-07)).
**`push-core` is deliberately not created** (checked 2026-10-02), and since 2026-10-02 it is a
default-off flag, so it reads as off — even while flags load — until push notifications are set up on
the server and the owner creates it (steps in
[go-live-runbook.md](./go-live-runbook.md#switching-push-notifications-on)), on for everyone at 100%
(never for one account first, owner 2026-10-07).
**`video-posts` (added 2026-10-02) is a default-off flag:** the owner wants it OFF for everyone.
Create it in PostHog **switched off** (or at 0%); it reads as off until PostHog says true.
**`ios-sf-symbols` and `camera-tap-focus` (added 2026-10-02) are default-off too:**
they need build 11; they exist in PostHog **switched off** (2026-10-06: `ios-sf-symbols` is ON at 100%) — turn each on only once build 11 is on the phones
(build 10 ignores them either way).
**`identity-verification` and `purchases` (added 2026-10-02) are default off too:** dormant until Didit and
RevenueCat are set up (owner steps in [HANDOVER.md](./HANDOVER.md)). Both exist in PostHog **switched off**.
**`mahi-points` was removed 2026-10-02** (decision #50): Mahi points are the core counter and always show.
No code reads it any more, and it was deleted from PostHog the same day, after OTA 10.26 went out (a phone
still on an older update hides points for one launch, until 10.26 loads).

PostHog project: **EU region, `project_id=130791`**.

## Reading a flag in the app

```ts
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

const videoOn = useFeatureFlag('video-posts');
if (!videoOn) return null;
```

- Keys are the typed `FeatureFlag` union in [`ui/src/lib/featureFlags.ts`](../ui/src/lib/featureFlags.ts) — the single
  source of truth. Add a key there when you add a flag in PostHog.
- The hook is a thin `useSyncExternalStore` wrapper over the shared `posthog` singleton (no `PostHogProvider`),
  re-rendering whenever flags (re)load. `App.tsx` calls `posthog.reloadFeatureFlagsAsync()` after `identify`, and
  `posthog.reset()` on sign-out clears flags (so no sign-out reset wiring is needed — guardrail #6 is satisfied).
- **Default-on:** `resolveFlag` returns `true` when PostHog isn't configured (no key) or while flags haven't
  loaded yet, so a feature is never hidden by analytics being slow or absent. Only an explicit `false` hides it.
  **But a key that doesn't exist in PostHog reads as OFF once flags have loaded** (the SDK returns `false` for
  a missing key). So every new flag must be created in PostHog, at 100%, before the update that uses it ships —
  found 2026-10-01, when seven new features stayed hidden on the test phones until their flags were created.
  This pure logic is unit-tested in [`ui/src/lib/__tests__/featureFlags.test.ts`](../ui/src/lib/__tests__/featureFlags.test.ts).
- **Default-off flags** (`DEFAULT_OFF_FLAGS` in `featureFlags.ts`: `push-core`, `video-posts`,
  `ios-sf-symbols`, `camera-tap-focus`, `identity-verification`, `purchases`, `tag-slots`,
  `auth-google-signin`, `auth-apple-signin`, `live-activity`, `control-post-workout`, `siri-shortcuts`
  and `spotlight`): off
  while flags load, off with no PostHog key, off when missing from PostHog — on only when PostHog returns
  `true`. Use this for a feature that must never show, even for a moment on cold start (video posts would
  otherwise be able to ask for the microphone before flags load; the full-screen notifications page would
  flash up on a first launch).

## The flags

29 keys, every one read by code. (Suggested follows have no flag: they are always on. Nor do the 12.12 additions — message requests, caption edits, shared post links and the crew strip are standard for everyone. Nor do the twelve switches removed on 2026-10-07 — see [Removed from code 2026-10-07](#removed-from-code-2026-10-07).)

**Tag loop** (keys map to [tag-loop-plan.md](./tag-loop-plan.md) phases; they hide UI only — server rules
are switched in the `app_config` table):
`push-core` (**default off; not in PostHog yet**. On: a full-screen page, once per device after the
welcome cards and the phone's camera question — "When do you post on Mahi?", one line of why, and a card
"Please turn on notifications" with one button, Continue, which brings up the phone's own question
(Apple's guidance; no "Not now" since 2026-10-06). Someone who said "Don't allow" sees, while they hold an open tag, one dismissible line under the
camera's open-tags pill, "Turn on notifications so you never miss a tag", which opens Mahi in the
phone's Settings (or the phone's question if it was never asked). Works on build 10; needs `send-push`
live to be worth switching on. The server queues pushes whether it is on or off. Off = nobody is asked;
phones that already allowed still register.)
`tag-slots` (**default off**; added 2026-10-03; its migration `20261003120000_tag_slots` is live). On:
one "Tag 3 friends" screen. Three slots at the top, each showing where it's at (tagged, invite sent,
accepted, link ready, shared, joined). Search finds anyone on Mahi: a friend is tagged; someone who isn't
a friend gets an in-app invite ("@x wants to tag you", Accept / Not now in their notifications). A share
row (WhatsApp, Messages, Copy or more) makes a personal link on tap and fills a slot. Live while open; nothing kept on the phone.
Off = today's tag sheet (with the invite step). The caption's `@` still picks one friend either way.
**Find your mates:** switch `contacts-finder` (**default on**, a kill switch); on for everyone on build 13+ (expo-contacts), needs migration `20261007270000_contact_match`. "Find your mates" — once
after sign-up for a new account (after the welcome cards, before the notifications page), and from
Settings → Mates, Your invites and the camera's waiting card. Asks for contacts with a plain why first;
a no gets "Invite by link instead". Contacts on Mahi can be followed; everyone else with a number gets
"Invite", which opens a text with a mate link. Only hashes of numbers and emails reach the server;
nothing is kept on the phone. Builds 10–12 never show it, switch or not.

**Lock screen and widget:** `live-activity` (**default off** since 2026-10-08, held back until the owner
releases it; off in PostHog; needs build 13, which carries `expo-widgets`). On: while you have a tag to answer, a Live
Activity on the lock screen and in the Dynamic Island says "@sam is waiting on you", "Answer with any
workout" and counts down to the tag's deadline with Apple's own timer (ticks with Mahi closed); several tags
show the soonest and "+2 more"; from the 6-hour mark the countdown turns to the warning colour. It starts when
Mahi sees an open tag, updates when tags change, and ends when they're answered or over and on sign-out; one
swiped away stays away until a different tag is the soonest. The Mahi home-screen widget (small and medium)
shows the same, or "Waiting for a mate to tag you" with your Mahi points and best; it moves on by itself at
each 6-hour mark and deadline. A tap on either opens the camera. Only the username and points leave the app.
Logic in [`ui/src/lib/liveTag.ts`](../ui/src/lib/liveTag.ts). On builds 10–12 and Android it does nothing.
Off = no Live Activity, and the widget says "Open Mahi to see your tags".

**Camera:** `camera-tap-focus` (**default off**; needs build 11). On: one tap on the live camera focuses and sets the
exposure there, with a small yellow square at the tap that settles and fades (Reduce Motion: it only
appears and fades). Two taps still switch camera; with this on, a single tap waits 0.28 s to tell them
apart. Moving the phone (a new scene) goes back to normal autofocus. iPhone only; Android and build 10
(which OTA updates also reach) have no native focus point, so there it reads as off whatever the switch
says. Native side: the `focusAt` patch to expo-camera in `patches/expo-camera.patch`. Off = no tap to
focus, and the double tap to switch camera is exactly as before.)

**Build 13 native features — kill switches, on for everyone** (owner, 2026-10-07; default on, so
create each in PostHog at 100%). Off = today's behaviour, no new motion:
`camera-pull-down` (the waiting camera gives when pulled down, its handle and one-time tip),
`point-fly-in` (a later answer's +1 flies into the counter, Apple's rolling digits; off = the full-screen
moment for every point), `feed-develop` (locked posts clear one by one after you post),
`tag-drain-ring` (last 6 hours: the tagger's face in a draining ring, one tap at the last hour),
`answered-stamp` ("Answered @sam" on the photo and the pill-to-tick morph; off = "Tag answered"),
`camera-tab-badge` (a number on the Camera tab while a tag waits), `miss-roll-down` (the counter rolls
down after a miss, the miss moment waits for it), `profile-points-card` (the bar fills, numbers roll, the
last three mates answered), `widget-tagger-photo` (the tagger's photo on the widget and Live Activity;
off = no photo).

**Posts:** `video-posts` (**default off**; owner: off for everyone). On: each of a post's two shots can be a
photo or a video of up to 15 seconds — a Photo / Video switch by the shutter, and press and hold the shutter
to record (tap still takes a photo; letting go or 15 seconds stops). The microphone is asked for only the
first time someone records. Videos in the feed, the small window, the post viewer and the preview play muted
and looping while on screen, with a "Turn sound on" / "Turn sound off" button; the profile grid marks video
posts with a video icon. Needs the `expo-video` native module (a new native build) and migration
`20261002100000_video_posts`. On a build without the native module (build 10) it reads as off. Off = today's
photo-only camera exactly, and the app never asks for the microphone.)

**Reports:** no switch since 2026-10-06 (owner): standard for everyone. `content-reports` was deleted from PostHog on 2026-10-07. A '…'
button on every post (feed and post viewer) and every comment opens the phone's own menu — Report on
other people's posts and comments (a list of reasons, then "Thanks. We'll take a look."). Your own posts
and comments show no '…' yet (no delete in the app, no clipboard package). Needs migration `20261006100000_moderation`; without it a
report says "Couldn't send your report. Try again." Off = no '…' on posts and comments; the profile's
report keeps working.

**Hold to preview:** no switch since 2026-10-06 (owner): standard on every iPhone build that has @expo/ui. `context-menu-preview` was deleted from PostHog on 2026-10-07 (was: iPhone only; needs build 11, which carries
`@expo/ui`). On: press and hold and the content pops out over a blurred background with a short menu
below (Apple's own context menu). Profile grid squares: the post's photo, with Open, Like / Unlike and
Share (Share sends the photo itself — post links expire within the hour — fetched to the phone only
for the share sheet and deleted when it closes). A tap still opens the post viewer; locked squares
don't pop. Messages rows: the latest six messages in that chat, read fresh from the server each time
it opens (a spinner first, nothing kept on the phone, and peeking doesn't mark them read), with Open and,
while the chat is unread, Mark as read (no Mute: the server has none). Feed posts and the post viewer
(owner: this REPLACES hold to view): the post's photo pops out with Like / Unlike, Comment, Share and
View profile; a double tap still likes, the small photo still drags, and holding the like / comment
column does nothing new. VoiceOver: the same choices are actions on the square, row or post. On build
10 or Android it reads as off. Off = today's grid, Messages list and hold to view exactly.

**Look:** `ios-sf-symbols` (**ON at 100% since 2026-10-06**; default off in code; needs build 11+). On an iPhone, the app's plain drawn icons
become Apple's own (SF Symbols) at the same size and colour: search → magnifying glass, camera, feed →
three left-aligned lines, profile → person, settings → gear, notifications → bell, heart (red filled heart
when liked), video, sound on / sound off (speaker with waves / speaker struck through). The brand "echo"
icons — comment and messages bubbles with the blue offset layer — stay drawn. Mapping
in [`ui/src/lib/sfSymbols.ts`](../ui/src/lib/sfSymbols.ts). Needs the `expo-symbols` native module: on build 10
and on Android it reads as off. Off = today's drawn icons exactly.)

**Identity checks and purchases** (dormant in build 11 — [architecture.md](./architecture.md#identity-checks-and-purchases-dormant)):
`identity-verification` (**default off**; a Didit identity check: the server starts a session, Didit's own
screens check an ID document and a selfie, the result arrives at the server and is read fresh from it. No
screen uses it yet. Needs the Didit native module (build 11), functions `didit-session` and `didit-webhook`,
their secrets and migration `20261002150000_identity_verifications`. On a build without Didit it reads as off.)
`purchases` (**default off**; in-app purchases through RevenueCat: offering, entitlement check, purchase,
restore and RevenueCat's paywall. No screen uses it yet. Needs the RevenueCat native modules (build 11) and
`EXPO_PUBLIC_REVENUECAT_IOS_KEY` in the lane. On a build without RevenueCat, or with no key, it reads as off
and RevenueCat is never started.)

**Sign in with Apple**: `auth-apple-signin` (**default off** since 2026-10-08; not released yet, see below). Shows Apple's
own button on the welcome screen on iPhones with build 13+ (the `expo-apple-authentication` native module)
where Apple says sign-in works; off hides it. Builds 10–12, Android and the web never show it. In PostHog
it is off (2026-10-08) until the owner releases it.

**Sign-in placeholder**: `auth-google-signin` (**default off** since 2026-10-07, so it never flashes up while flags load) — a pill on the welcome screen with no sign-in behind it
yet; tapping it does nothing. At 0% in PostHog (checked 2026-10-07).

## Build 13 native features: off switches (owner, 2026-10-07)

The owner asked for a way to turn off every new native feature. Each one below is a default-on switch.
All of them were created in PostHog on 2026-10-07, active at 100% for everyone, before any update read them.
Turning one off hides that feature for everyone, and the app behaves as it did before the feature.
They are not rollouts: never on for one account first. Once a feature is proven on phones, the
removal rule applies as usual: take the switch out of the code, then delete it in PostHog.

| Switch | What it turns off |
|---|---|
| `contacts-finder` | Find your mates from the phone's contacts (camera, Settings, Your invites, welcome step) |
| `live-activity` | A mate's tag on the lock screen, Dynamic Island and home-screen widget |
| `emoji-keyboard` | The emoji button and panel in a conversation |
| `message-reactions` | Hold a message to react, reaction badges, double tap for a heart |
| `camera-pull-down` | Pulling the locked camera down to see what's behind it |
| `point-fly-in` | The +1 flying into the points counter |
| `feed-develop` | Locked posts clearing one by one after you post |
| `tag-drain-ring` | The ring draining around the tagger in the last 6 hours |
| `answered-stamp` | The "Answered @sam" stamp and tick |
| `camera-tab-badge` | The badge on the Camera tab while a tag waits |
| `miss-roll-down` | The counter rolling down before the miss moment |
| `profile-points-card` | The profile points card with the last three mates |
| `widget-tagger-photo` | The tagger's photo on the lock screen and widget |
| `app-clip` | The app taking the invite the App Clip handed over (create in PostHog at 100%; the clip itself is turned off in App Store Connect) |
| `share-to-mahi` | Sharing a photo from Photos into Mahi |
| `control-post-workout` | The Control Centre and lock screen "Post a workout" control |
| `spotlight` | Mahi's actions in Spotlight |
| `siri-shortcuts` | Mahi's Siri and Shortcuts actions |
| `shutter-sound` | Apple's shutter sound on capture |
| `widget-background-refresh` | The widget refreshing while Mahi is closed |
| `auth-apple-signin` | Sign in with Apple (already existed) |

**Held back, not released yet (owner, 2026-10-08).** Five of these are **default off** in code and turned
off in PostHog: `auth-apple-signin`, `live-activity`, `control-post-workout`, `siri-shortcuts`, `spotlight`.
(`widget-tagger-photo` and `widget-background-refresh` stay on; with `live-activity` off they have nothing to show.) They stay off while flags load and on a build with
no PostHog key; only PostHog saying true turns one on. The iPhone side (Control Centre button, Siri) also
reads a switch the app hasn't written yet as off. What a switch can't hide, because Apple lists it from the
build itself: the Mahi widget in the widget gallery, the "Post a workout" button in the Control Centre
gallery (it reads "Open Mahi"), and the Siri phrases in the Shortcuts app (each just opens Mahi).

**Build 13 native extras** (owner, 2026-10-07). `share-to-mahi`, `shutter-sound` and
`widget-background-refresh` are kill switches, default on in code, each **created in PostHog at 100%
before build 13 ships** (a missing key reads as off). `control-post-workout`, `spotlight` and
`siri-shortcuts` are held back, default off in code and off in PostHog, until the owner releases them
(owner, 2026-10-08). Builds 10–12
don't have the native parts, so the switches do nothing there.
- `share-to-mahi`: "Post to Mahi" in the Photos share sheet (1–2 photos). On: Mahi opens on the Camera
  page with them as the shots (two fill the preview; one is the first shot and the selfie side takes the
  second). Off: Mahi still appears in the share sheet (that can't change without a build), but the app
  ignores the share — it deletes the copied photos and opens as it is.
- `control-post-workout`: "Post a workout" in Control Centre, on the lock screen or on the Action button
  (iOS 18+). On: a tap opens Mahi on the camera. Off: the app writes the switch to the App Group, the
  button then reads "Open Mahi", and a tap just opens Mahi where it was.
- `spotlight`: Spotlight offers "Post a workout", "Your invites" and "Find your mates" (the app's own
  actions; nothing about the person is indexed). On: the app puts them in the phone's index at launch; a
  tap opens the camera, or the invites list / Find your mates over the Camera page. Off: the app takes
  them out of the index at its next launch; a tap on one still showing just opens Mahi.
  `mahi://invites` and `mahi://find-mates` also work as plain links, with no switch.
- `siri-shortcuts`: App Shortcuts, ready in Siri, the Shortcuts app and Spotlight with nothing to set
  up — "Post a workout in Mahi", "Open my invites in Mahi", "Find my mates in Mahi". On: each opens
  Mahi on the camera, the invites list or Find your mates. Off: they still show (Apple lists them from
  the build), but each just opens Mahi; the app writes the switch to the App Group so the intent leaves
  nothing to act on.
- `shutter-sound`: Apple's own camera shutter sound (the Camera app's) at the press, in step with the
  haptic. The phone's silent switch silences it. Today the camera already makes that sound itself, but
  only once the photo is taken (after the 0.3 s settle on the first shot); with this on, the camera's
  own sound is turned off so there's only one. Off: exactly today's.
- `widget-background-refresh`: iOS wakes Mahi in the background now and then (15 minutes at the
  least; iOS decides, and wakes rarely-used apps less) to read the open tags and the points again, so
  the home-screen widget and the lock-screen tag stay right with Mahi closed (owner-approved exception
  #113). On: the task is registered at launch. Off: it is unregistered at the next launch, and the
  widget updates only when Mahi is opened, as before. A failed refresh is reported to Sentry and
  leaves the widget as it was.

## Removed from code 2026-10-07

These twelve were on at 100% for everyone since about 2026-10-01. The owner made them standard on
2026-10-07: the code no longer reads them and always behaves as they did when on (OTA 12.24).
**Deleted from PostHog on 2026-10-07** (owner's go, once their phone had 12.24). A phone still on an
older update reads them as off until it loads 12.24, since a key missing from PostHog reads as off.

- `notifications-core` — the bell in the header and the notifications list.
- `tag-challenges` — the camera's open-tags banner.
- `invite-links` — invite a slot from the tag sheet and share the links after posting.
- `feed-lock-explainer` — the locked feed says who tagged you and how long you have to answer; the open
  feed shows a live countdown to when it locks.
- `tags-invite-step` — when friends can't fill a post's tag slots, the tag sheet leads with "Invite N
  friends to post"; after posting, a list of the invite links shows which are sent and lets each be sent
  again.
- `camera-pip-guide` — the small window on the live camera says what comes second, then shows the first
  photo while the camera switches.
- `comment-likes` — a heart and a count on each comment; tap the count to see who liked it.
- `nav-glass-rail` — the glass rail on the Camera's left and the glass bar along the bottom of the other
  pages, on builds without the phone's own tab bar (the tab bar takes its place where there is one).
- `nav-rail-morph` — the rail as one floating pill with a sliding selector; hold and drag to switch.
- `onboarding-welcome-cards` — the one-time three-card welcome, and Settings → Help to see it again.
- `auth-password-reset` — "Forgot password?" on the log-in sheet.
- `account-delete` — Settings → Security and privacy → "Delete account".

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
