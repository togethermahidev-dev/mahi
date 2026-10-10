# Mahi — Engineering Handover & Operating Manual

The single entry point for continuing work on Mahi. Read this first. It encodes **what's built**, the
**rules that never change**, the **patterns to copy**, and the **goal-driven loop** every new feature runs through.

---

## State on 2026-10-09 (newest; overrides everything below)

Preview lane / TestFlight at **OTA 13.35** on build 13 (published 13:50 UTC from `d8703ec`; the
production app lane is untouched). It carries the owner's **core workflow** (`docs/core-workflow.md`,
RULES.md "Core loop", decisions #151–#167):
- Onboarding: intro → welcome cards ("1. Show up & tag mates · 2. Get tagged · 3. Pass it on") →
  private or public ("You can change this later in Settings."; switch `private-accounts`) →
  notifications ("Don't miss your tag 🔔", Turn on / Not now; switch `push-core`) → camera. Not now
  puts a 🔕 banner with Turn on at the top of the feed. The contacts step left onboarding (Find your
  mates stays in Settings, Your invites and the camera).
- First post: Post → "Hold up ✋" → Tag mates → tag 1 mate (friends first; no friends → contacts →
  WhatsApp / Messages / Snap / IG, Snap and IG through the share sheet). Answers still tag 3; posting
  only when tagged stays. The tag screen's Post is the confirmation (no pop-up).
- Posts say "Replying to @a, @b." and show grey "Invited ⏳" initials for link invites nobody has
  joined from yet. Deleting a post takes its point back. New words on the first-point screen, the
  locked camera ("Scroll up to access feed.") and the locked feed when tagged ("You've been tagged.
  Post your Mahi to access your feed"). The selfie matches the preview. "Invite a mate" on Profile.
- The `tag-slots` switch left the code (it was never in PostHog).

**Database, live on production** (pushed on the owner's go, about 13:55 UTC):
`20261009100000_first_post_tag_and_post_points` — a first post tags `app_config.first_post_tags` (1),
`posts.earned_point` and `delete_post` taking the point back, `feed_item` adding `answered_taggers`
and `pending_invites` (initials only), and the "joined Mahi from your tag 🎉" push. Backup
`supabase/backups/20261009135113_*`. Checked against prod after: `first_post_tags = 1`,
`posts.earned_point` backfilled on 16 of 45 posts, `name_initials` not callable by the app. Then
`20261009110000_tag_join_push_username` (backup `supabase/backups/20261009140044_*`): that push says
the @username, "@sam joined Mahi from your tag 🎉" (decision #166; listed live, checked against
prod). Rollback order is in `.claude/steps-core-workflow.md` (local).

**Waiting — owner phone checks** (preview, a new account, `private-accounts` on; `push-core` on for
the notifications page):
- Order: intro → cards → private/public → notifications → camera; the camera asks only after.
- First post: Post → Hold up ✋ → Tag mates → pick 1 → Post → first-point screen.
- No friends: contacts → WhatsApp / Messages / Snap / IG; the post shows a grey "Invited ⏳" circle;
  when they join it becomes their photo and you get "joined Mahi from your tag 🎉".
- Selfie matches the preview (photo and video).
- Locked camera: "Scroll up to access feed." Answer → Tag 3 friends.
- "Replying to @a, @b." on an answer. Deleting a post drops your points.
- Feed banner after "Not now" on notifications; its Turn on.

Nothing above has been checked on a phone yet.

## State on 2026-10-08, evening

Preview lane / TestFlight at **OTA 13.32** on build 13 (build 13 on preview + TestFlight; production
untouched). Today, in order: photo saving by file name (egress fix, 13.01); Codex's camera drawer,
welcome loop and friend grid (13.02–13.06); feed rows, frosted locked feed, black/white colours
(13.07–13.18); Netflix-style tab morph (13.08); **camera and feed on one screen**, three tabs (13.23);
two-stage camera swipes and one camera gesture for both directions (13.29–13.30); the locked camera
says why and keeps a locked shutter (13.28); lock reason uses the server's has-posted mark (13.31).
Launch crashes in 13.08 and 13.19–13.20 were animation-thread mistakes (rules now in RULES.md, Design
System), fixed in 13.09 and 13.21. Supabase is over the free plan's data allowance: the owner is to
upgrade to Pro before 10 Oct. Build 14 list: Camera tab wiggle, liquid ink transitions (Skia).
Nothing here has been checked on a phone by Claude.

## State on 2026-10-08 (earlier)

Camera reveal correction: the arrow now stays directly below the header in both states. Waiting
content is borderless and scrollable, with wrapping actions for large text. The compressed camera
fades away at the end of the reveal so it no longer leaves an empty blurred rectangle below the
actions; reversing the gesture brings it back. Device visual verification is still needed.

**Fitness-first guidance:** The signed-out entry now shows an animated three-stage workout loop
before account creation: Show up → Get tagged → Answer and pass accountability to 3 friends. The
stages stagger in, an energy line connects them, and the current action has a quiet pulse; Reduce
Motion stays still. Onboarding cards use the same numbered verbs, first-camera guidance says exactly
which two photos come next, and locked-feed actions say “first workout” / “accountability partners”
instead of generic social language. Entry actions use interactive Liquid Glass on supported iOS,
bounded ripple on Android and shared spring compression everywhere else.

**Camera/picker visual correction:** The random labelled pull capsule is gone. One large white
chevron jumps twice, follows the camera and rotates to close. The behind-camera accountability card
is smaller, borderless and neutral; its hierarchy is black/white with blue reserved for a small
active cue. The camera settles into a shorter card. The accountability picker is now a four-column
avatar/name grid with tap-to-check, theme-aware black/white selection and no numbered empty circles;
only real pending invite/link states appear above the grid.

**Camera waiting drawer fixed:** The locked/waiting camera is the front layer. A compact labelled
handle sits around its upper third; the camera gives a short two-beat vertical tug to teach the
depth, then stays still. Pulling uncovers a deliberately compact accountability card behind it and
settles open; the same handle travels to the camera edge and rotates to close. The leading edge gets
a restrained cyan light, the card/primary/secondary actions resolve in order, confident flicks use
velocity-aware snapping, Android Back closes it first, and accessibility announces the open state.
Reduce Motion crossfades the layers. This is standard UI, not a PostHog-gated experiment: the
remote `camera-pull-down` value caused the fixed oversized card/no gesture seen on the phone. Remove
that obsolete flag from PostHog when convenient; no server change is needed.

**Liquid controls direction:** The pull now reversibly changes the full-screen camera into a small
rounded camera card near the bottom; swiping up restores the exact full-screen geometry. Its reveal
card is compact (one short explanation, two actions, a utility row), avoiding the oversized panel
seen in the phone screenshot. Camera accountability/caption/location pills use interactive Liquid
Glass where supported and shared spring press motion everywhere else; Post uses the same response.
RULES.md now limits this treatment to controls that genuinely open a related surface so utility
actions stay quiet. Continue this object-to-destination pattern selectively, not as blanket motion.
`useCardMorphStyle` in `components/MorphTransition.tsx` is the shared geometry owner: the camera,
workout/post viewer and avatar viewer all drive position, size and radius from one UI-thread value.
Reuse that hook for future card-to-sheet or card-to-full-screen transitions.

**Native continuity motion (front end; no server work):** Profile workout tiles now expand from the
exact tapped tile into `PostViewer` and reverse into it on close; a downward dismissal scrubs the
same geometry. Profile photos do the same into the circular avatar viewer. The camera's captured
frame now settles into the post composer with a scale/crossfade instead of arriving as a separate
sideways page. All three paths become crossfades under Reduce Motion, and post video/content waits
until the moving still has landed. The reusable implementation is `components/MorphTransition.tsx`
plus `lib/morph.ts`; it deliberately uses a measured clone inside the destination Modal rather than
Reanimated's experimental shared-element API. Phone-check grid photo/video opens and closes, avatar
opens/closes, swipe-down cancellation/dismissal, camera preview/discard, light/dark, and Reduce
Motion. No database migration, RPC or edge-function change is required for this motion work.

**Show-up accountability (product):** Mahi is a show-up fitness accountability app (RULES.md
"Product identity and core loop"). The front end says "Start by showing up", the first workout has
no tagging step, and every later post answers a live tag and picks 3 friends ("Who are you holding
accountable?"). Committed on `updates` (49f9da2); reaches phones with the next OTA. Server side is
live: `20261008140000_first_workout_no_tags` (the first workout needs no tags, answering a tag or
not; later posts still need a live tag and 3 friends).

**Security review (docs/security.md has the rules and the full log).** Live on production
2026-10-08 (checked against prod): posts, photos, comments, likes and comment-like lists follow the
post's visibility (`can_view_post`), the posts bucket is private; posting, tagging, following and
reporting only through server functions; email sign-ups only through `complete-signup` (claim stamp
on the checked code); a password reset signs out every session; report copies staff-only; staff
need a confirmed email; avatars only in your own folder; no signed-out table rights
(`20261008100000`–`20261008150000`; functions `complete-signup`, `reset-password`, `check-email`
deployed). Next OTA: invite confirm sheet (Accept / Not now), no email to Sentry/PostHog, no
city/postcode in PostHog, widget photo clean-up, no search text in crash reports. Build 13: the
sign-in session in the keychain (`expo-secure-store`), Android backup off and links narrowed.
Website deploy: security headers. Owner to-dos: make the GitHub repo private; DMARC/SPF records;
Sentry "Prevent storing IP addresses"; delete `email` from PostHog persons; Supabase Auth settings
(hook on, password rules, secure email change, Site URL) — listed in docs/security.md.

**Held back (owner, 2026-10-08):** Sign in with Apple, the lock-screen tracker and widget, the Control
Centre button, Siri and Spotlight are off in PostHog and default-off in code (`DEFAULT_OFF_FLAGS`).

**Planned, not built:** public and private accounts (Instagram-style follow requests), waiting for
the owner's six answers (plan kept locally in `.claude/plan-private-accounts.md`).

## 0. Build 13 phone checks (2026-10-07; nothing below is phone-checked yet)

Build 13 carries: contacts (Find friends in your contacts), expo-widgets (lock-screen Live Activity + home-screen
widget), the local emoji-keyboard module, push notifications switched on, Sign in with Apple, Share to
Mahi (share extension), a Control Centre control, Spotlight, Siri shortcuts, Apple's shutter sound,
widget background refresh and an App Clip for invite links. OTAs 12.24–12.33
plus everything after are also unchecked on a phone. Check, in this order, on a build-13 iPhone:

- Sign-up from an invite link: profile loads first time; "@sam tagged you" at the top; claim works.
- Find friends in your contacts: the why-first page, saying no, saying yes, the On Mahi / Invite sections,
  Follow from the list, Invite opening Messages with the text filled, keyboard on the search box.
- Camera: Type A/B first-post words; ticking clock; yellow under 6 h; waiting card (with "Invite a
  mate", "See your invites" + count, "Find friends in your contacts"); the tips as Apple popovers
  pointing at the right things; the points pill visible when the camera is open.
- Posting: the three friend circles fill as you tag (tag back the friend you answer); confirm words;
  the +1 moment; links sheet; "Answered @sam in 2h" on the post.
- Lock screen (only once released): the Live Activity appears with an open tag, ticks, turns yellow at 6 h, opens the
  camera on tap, ends on answer; the widget at both sizes; the tagger's photo shows.
- Messages: hold a bubble → native menu with the emoji row; badges; double-tap ❤️; "+" opens the
  emoji keyboard with search and suggestions; the keyboard never covers the composer.
- Feed: padlock on the tab while locked; "Feed open · next tag locks it after"; reactions.
- Your invites: list, resend (share sheet), cancel; Settings → Friends rows.
- Push: after the server steps, one tag push arrives and opens the camera.
- Miss: the "You missed @sam's tag" moment once; points to 0, best kept.
- Sign in with Apple (after the owner steps below, and only once released): Apple's black button on the light welcome
  screen, white on dark; cancel says nothing; a new Apple account goes to "Getting started" with
  the name filled in, then "Your profile", then the camera; Cancel there goes back to the welcome
  screen; an invite link still says who invited you and is claimed; signing out and in again with
  Apple goes straight to the camera; a build-12 phone on the same OTA shows no Apple button.
- App Clip (after the owner steps below; from TestFlight first): on an iPhone without Mahi, tap an
  invite link → the App Clip card → Open → "@sam tagged you on Mahi" (or "invited you"), the
  48-hours / follow-each-other line, sam's name and photo; light and dark; Get Mahi opens the App
  Store sheet. Install Mahi, open it, Create account: "@sam invited you" is already there and the
  invite is claimed after sign-up. A used or run-out link says so and saves nothing.

### Sign in with Apple — owner steps before build 13 ships

No secrets in code; native sign-in needs only the bundle ID.

1. Apple Developer → Identifiers → `com.mahi.app`: the Sign in with Apple capability. EAS turns it
   on when it builds (app.config.js sets `ios.usesAppleSignIn` and the `expo-apple-authentication`
   plugin); check it's ticked after the build.
2. Supabase dashboard → Authentication → Sign In / Providers → Apple: enable it, Client IDs =
   `com.mahi.app`. Leave Secret Key empty (that is only for web sign-in, and it expires every 6 months).
3. PostHog switch `auth-apple-signin`: stays off (default off in code, off in PostHog since
   2026-10-08) until the owner releases Sign in with Apple; then set it to 100%. Off hides the
   button. Builds 10–12 never show it.
4. Account deletion revokes Apple's access (App Store guideline 5.1.1(v); owner, 2026-10-07).
   Built: at sign-in the app sends Apple's one-time code to the new `apple-token` function, which
   keeps Apple's refresh token in `apple_tokens` (server-only table); `delete-account` revokes it
   at Apple before deleting the account. A failed revoke never stops a deletion (reported in
   Sentry as `account.appleRevoke`); a failed save never stops a sign-in (`auth.appleSaveToken`).
   Accounts that signed in with Apple before these steps are live have no kept token, so their
   deletion skips Apple (they sign in again → token kept). Owner steps, in this order:
   a. Apple Developer → Certificates, IDs & Profiles → Keys → "+": name it "Mahi Sign in with
   Apple", tick Sign in with Apple → Configure → primary App ID `com.mahi.app` → Save →
   Continue → Register. Download the `.p8` file (Apple lets you download it once; keep it
   somewhere safe, never in the repo). Note the Key ID (on the key's page) and the Team ID
   (top right of the developer site, or Membership details).
   b. Database: done. Migration `20261007300000_apple_tokens` is live on production (2026-10-08).
   c. Secrets (type the real values yourself; the key file path is wherever you saved it):
   `supabase secrets set --project-ref pzepodsppqtvptzmwxzs APPLE_TEAM_ID=<team id> APPLE_KEY_ID=<key id> APPLE_CLIENT_ID=com.mahi.app`
   then `supabase secrets set --project-ref pzepodsppqtvptzmwxzs APPLE_PRIVATE_KEY="$(cat <path to AuthKey_XXXX.p8>)"`.
   d. Functions (both keep JWT verification on, the default):
   `supabase functions deploy apple-token delete-account --project-ref pzepodsppqtvptzmwxzs`.
   e. Then step 3 (switch to 100%). Check on a phone: sign in with Apple, then in Supabase →
   Table editor → `apple_tokens` one row for that account; delete that account in the app, the
   row is gone and iPhone Settings → Apple Account → Sign in with Apple no longer lists Mahi.
   Missing secrets: `apple-token` answers 503 (sign-in carries on, a warning in Sentry) and
   `delete-account` deletes without revoking (warning in Sentry).

### App Clip — owner steps before build 13 ships

How it works: invite link → App Clip card → the clip (`ui/clip/MahiClip`, SwiftUI, no React Native,
about 1 MB of fonts) reads `get_invite_preview` like the web page → Get Mahi saves the invite link
in the App Group `group.com.mahi.app` and opens the App Store sheet → iOS keeps the App Group when
Mahi is installed → Mahi reads it once, deletes it, and the sign-up screen says who invited you
(`ui/src/lib/clipHandover.ts`). If that ever fails, copying the link into "Got an invite link?"
still works. Switch `app-clip` (default on) only stops the app taking the hand-over; to turn the
clip itself off, remove its App Clip experience in App Store Connect.

1. PostHog: create `app-clip` at 100% (the app waits for PostHog's answer before taking a
   hand-over, and a switch missing from PostHog reads off, so without it nothing is taken).
2. Deploy the website once (web/README.md "How to deploy") so
   `togethermahi.com/.well-known/apple-app-site-association` lists the App Clip.
3. The interactive EAS build creates the clip's App ID `com.mahi.app.Clip` (App Groups and
   Associated Domains on it, parent app `com.mahi.app`) and its profile; answer yes when it asks.
   The plugin's author notes App Clip signing isn't fully automated: if EAS stops on the clip,
   create `com.mahi.app.Clip` in Apple Developer → Identifiers by hand (App Clip of `com.mahi.app`,
   App Groups `group.com.mahi.app`, Associated Domains), then run the build again.
4. App Store Connect → Mahi → the build 13 version → App Clip: the default experience (header image
   1800×1200 PNG/JPEG, a subtitle up to 56 characters, action Open). Then Advanced App Clip
   Experiences → add `https://togethermahi.com/i/` (prefix, so every invite link opens it).
   Apple checks the website's file (step 2) before it goes live.
5. Once Mahi has an App Store id: put it in `APP_STORE_ID` in `web/app/_lib/links.ts` for
   Safari's App Clip banner on the invite page, then deploy the site. Until then no banner.
6. Not checked here: the Swift was type-checked against the iOS 16.4 SDK but never built or run;
   App Clips can only really be tried from TestFlight (App Clips section) or the live store.

## 1. Where things stand

**Architecture (stable — do not rewrite).** React Native + Expo talking directly to Supabase, no backend server.
5 layers, dependencies flow downward only:

```
screens/components → hooks → stores (Zustand, optimistic) → api ({data,error}) → lib → supabase
                                                                                   (db · RLS · RPCs · edge fns · storage · realtime)
```

Full data flow + the per-layer import contract: [architecture.md](./architecture.md#layering-contract).

**Who works on Mahi (2026-10-08):** Claude and Codex both do, often side by side. Same rules: this
file, `RULES.md` and `CLAUDE.md` are the rulebook; the guard hook (`.claude/hooks/guard.cjs`) still
applies to every tool call. Work on branch `updates`; commit by name, no AI attribution, never push
without the owner's go in the same session.

**State on 2026-10-07 (branch `updates`; `main` is behind):**

- **OTA 12.20 is live on the preview channel (iOS and Android)** (EAS group
  `2eba344a-907a-45be-9366-cd573ddc888a`): right-swipe dismissal works again on another person's
  profile and now dismisses a friends list too. Follow/unfollow stays optimistic, then reconciles
  from the database's committed answer; every subscriber to a shared realtime follow channel is
  refreshed. Production migration `20261007104406_authoritative_follow_mutations` is live. It adds
  the atomic `set_following` RPC and rejects self, banned and blocked follows. Production was
  audited before and after: 48 follow rows, 16 mutual pairs, and no claimed invite missing either
  directional follow. An accepted link or in-app tag invite continues to make both people follow
  each other; declining creates neither row. A normal profile Follow remains one-way until it is
  followed back, which is when the pair appears in Friends.
- **OTAs 12.32–12.34 live on preview 2026-10-07** (12.34 group `655b1b1a-3807-45b3-8bde-326a4ad314a3`): Apple-popover tips, invites badge + Settings row, tag back (#112), mate circles, "Answered @sam in 2h", sign-up profile fix, "@sam is waiting on you", mates on the clock, miss moment, mates wording, website invite page says who tagged you. Prod DB through `20261007275000_mates_on_clock`.
- **OTAs 12.29–12.31 live on preview 2026-10-07** (12.31 group `48a2a28e-8a91-41bd-9685-44cb52860bb0`): Invite a mate any time; a first answer needs no tags; one-time tips; yellow tag clock under 6 hours; open-tag reminder; padlock on the Feed tab; invite link opens and `app_update` in PostHog; Your invites (Profile card, resend once a day up to 3 times, cancel). Prod DB through `20261007210000_my_invites`. Website live with `/i/` and `/p/` pages and the Apple app-association file.
- **OTA 12.28 live on preview 2026-10-07 16:17 UTC** (EAS group `6fcf3a45-7b81-4985-957f-a4a444849c90`): new people guided by how they arrived (Maximus's Type A/B words), first post earns the first point (`20261007180000_first_post_point`, live in prod), every tag countdown ticks, 'Waiting for a mate to tag you' card, full-screen +1 celebration, `joined_via` on sign-up.
- **OTA 12.27 live on preview 2026-10-07 15:28 UTC** (EAS group `490c1120-a02a-4d34-b2e0-e0ea4ec13585`): the camera's tag pill sits under the points counter; the camera and an empty own profile read `profiles.has_posted_before`, so deleting every post never offers a first workout the server would refuse.
- **OTA 12.26 live on preview 2026-10-07 15:22 UTC** (EAS group `b026ffa4-29cb-48e4-a845-5d8b79103f4c`): profile workout grids have hairline gaps between rows again.
- **OTA 12.25 live on preview 2026-10-07 15:12 UTC** (EAS group `4396ab1a-c9cb-4843-bd1c-d373c1b64a5d`): the camera tells a first-time poster whose tag their post answers. `20261007170000_username_available` is live in prod (checked against prod). The twelve switches made standard in 12.24 are deleted in PostHog.
- **OTA 12.24 live on preview 2026-10-07 14:57 UTC** (EAS group `bedd3fdd-602e-48bb-8c52-3427563769a0`): the audit fixes below, twelve switches made standard, Sentry reporting everywhere (`reportError`, docs/integrations.md), PostHog one-person-per-account and core action events, profile photo save fix, server username check. Source maps uploaded. Not yet checked on a phone.
- **Audit 2026-10-07 (checked against prod) and its fixes, on `updates`, now in OTA 12.24:**
  migration `20261007150000_live_updates_and_hardening` (live updates for follows, likes and
  comments; tags readable only by signed-in people and never on hidden posts; fixed search paths;
  trigger functions not callable through the API; indexes on 27 foreign keys) — live on
  production. App: unfollows/unlikes arrive
  live, live comments get their commenter, no duplicate own comment, blank names no longer crash
  (55b90b6). `check-email` source now in the repo (eac0aeb). Sign-in placeholders
  `auth-apple-signin` / `auth-google-signin` set to 0% in PostHog. Twelve 100% switches are being
  removed from the code. Found, not fixed (owner): send-push, moderate-content and didit functions
  not deployed; the update gate is off while old messaging is removed; post photos were public by
  link (private since `20261008100000_security_hardening`, live); leaked-password protection off;
  `messages_test.sql` fails since `contract_messages` (it writes conversations directly).
- **OTA 12.23 is live on preview** (EAS group `6127092f-5dce-44a0-b839-cadb60becb80`, commit 4454e3e):
  the feed shows the people you follow, newest first, and only your latest post among them; older
  posts stay on your Profile (decision #103). Not checked on a phone. Production is still on 12.16;
  every migration the code needs is live there (checked 2026-10-07), so the production update is
  the owner's step from the /version-control skill.
- **OTA 12.22 is live on preview** (EAS group `5e32caf5-fd3c-41c6-92f9-3f8f4f2c6345`, commit 11cc8ce): sideways swipes work on Profile again
  (the Profile list was holding the page swipe on every touch); Messages and Profile swapped places,
  so the order is Messages, Feed, Camera, Profile (decision #95); the crew strip over the feed is
  removed (decision #100). Not checked on a phone.
- **OTA 12.21 is live on preview** (EAS group `85b104e9-9081-4527-8499-5c02e548865c`): every tag-request and invite-link path explains before
  acceptance/joining that both people will automatically follow each other, then confirms it after.
  Declining still creates no follows. Production migration
  `20261007105647_explicit_mutual_follow_wording` is live and gives the same explicit wording to
  `tag_invite`, `tag_invite_accepted` and `invite_joined` pushes when push delivery is enabled.
- **Production OTA 12.16 is live on iOS and Android** (EAS group
  `cc174c9d-c47c-42a0-b4c7-cf37a2777ec2`). It applies Maximus's Q1–Q10 answers: one-day
  re-invite cooldown, no daily invite cap, blocking cancels without a miss, owners may delete posts
  without regaining the first workout, correct invite timing, short share copy without the code,
  accepted slots survive unfollowing, and each of the three tags may be either a current friend or
  someone not on Mahi. It also reuses valid signed media URLs, enables native caching for remote
  media/avatars, and reorganises Settings (appearance icon in the title, Notifications, nested
  Security and privacy, Support/Help).
- **On phones (preview lane), published 2026-10-06, not yet checked on a phone:** OTAs **12.07–12.11**
  (below) and **12.12**: the profile workout story (one column, newest first, swipe back), notification
  activity rows, the feed timer matching the server (the feed stays open 24 hours after you post, then
  locks until a friend tags you and you answer), shared post links, caption edits for one hour, the new
  messages (requests, edit, unsend) and the design pass (no "Mahi" above screen titles, double tap only
  likes, post sizes follow the phone and text size, the crew strip, the countdown ring, the answer
  celebration, motion tokens with Reduce Motion fades).
- **Production database:** every migration through `20261008150000_security_hardening_live`
  is applied. `20261006200000_maximus_answers` adds the invite cooldown, permanent
  `has_posted_before` marker and owner-only `delete_post`; `20261006201000_optional_non_user_tags`
  removes friends-first. `20261006190000_message_requests` makes the first message from a non-friend a request;
  accept, decline or block; edit for 15 minutes; unsend; the server checks blocks, bans and removed
  messages). Direct conversation writes from old apps are closed by
  `20261007111029_contract_messages` (live).
- **Shared post links:** `togethermahi.com/p/<post>` opens the post in the app (universal link). The
  web fallback (`web/app/p/[postId]/route.ts`, sends people without Mahi to the store) needs a web
  deploy (owner); Android link association needs the next native build.
- **Not live yet:** push notifications (in-app notifications work); the automatic check waits for an
  OpenAI key; the website waits for a web deploy.

**State on 2026-10-06, 14:00 (branch `updates`; `main` is behind):**

- **On phones (preview lane), published 2026-10-06, not yet checked on a phone:** OTA **12.07** the
  design pass (Inter only, no italics, tokens for every value, decisions #76–#93); **12.08** the
  Profile redesign; **12.09** reports, Follow back, account standing, hold to preview, the glass dock
  along the bottom, the notifications page's one Continue button, sign-up saying why it asks, the
  Cheer button, the points-milestone buzz and the invite retry; **12.10** more Profile redesign;
  **12.11** feed lock wording, camera polish, the navigation order (Profile, Feed, Camera, Messages;
  Camera still the landing page) and the UI clarity pass.
- **Production database:** every migration through `20261006170000_signed_in_reads` is applied
  (tag/feed pushes, tag slots, moderation, follow back, push deadline wording, private date of birth
  and phone, staff admins, staff remove message, ban signs out, signed-in reads).
- **Staff:** admins are joe.devadmin@, verityadmin@ and maximusadmin@togethermahi.com. Their
  passwords are set by the owner (psql).
- **Staff portal `staff/`:** overview, reports (chips and search), a report page with Safe and
  Serious actions (note + confirm), people, audit log. Runs locally with `staff/.env.local`
  (`SUPABASE_URL`, `SUPABASE_ANON_KEY`); not hosted yet — Vercel, root directory `staff`, the same two
  variables (owner). Counts and search cover the newest 200 reports.
- **Not live yet:** the automatic check (`moderate-content`) waits for an OpenAI key; push
  notifications wait for the owner's go-live; the website footer change waits for a web deploy.
- **Switches:** `ios-sf-symbols`, `context-menu-preview` and `content-reports` ON at 100%. The code no
  longer reads the last two; delete them in PostHog once every phone has 12.09 or later.
- **Rules carried forward:** work on `updates`; a switch turned on is 100%, and removed once proven;
  Mahi doesn't use Docker (database types come from the Supabase MCP generator, not `supabase gen
types --local`); production writes only with the owner's permission, through `scripts/db.sh try` →
  `backup` → `push`.
- **Next native build** moves to Expo SDK 58 (owner).

**State on 2026-10-05, late (on main, not on phones yet):**

- **Design system tidy-up, committed on main, not pushed, not in any update yet** (84377ac…3dd23a0):
  Inter on every word, the tab bar titles too, no italic; × for close buttons; camera pills read
  "+ Tag people", "+ Add a caption", "+ Add location" / "Location on" (no emoji); sentence case in the
  photo and report pop-ups; every see-through amount, line width, blur, animation, swipe, wait and
  layout share from tokens; one shared muted and border colour (`themeColors`). Tests now enforce all
  of it (`fonts.test.ts`, `designTokens.test.ts`, `sentenceCase.test.ts`). Phones still run 12.06 —
  these reach them with the next update to preview, then a phone check.
- **Code email:** the sign-up and reset code email now uses Inter and the app's tokens
  (`emailTokens.ts`). **Not live** until the owner redeploys `send-otp` and `send-reset-code`
  (`--no-verify-jwt`, Mahi access token). Visible changes: a narrower card, the gradient ends in blue.
- **Website:** `web/app/tokens.css` regenerated; the live site changes only on a web deploy (owner).
- **Packages (3335e3f, 254eae1):** the code-only packages and tools moved up (supabase-js 2.117.2,
  posthog-react-native 4.78.4, eslint 10.12, jest 30.5.2, prettier 3.9.9, ts-jest 29.4.14; website
  next 16.3.8). Safe for an update to build 12. pnpm's release-age check stays on (it held PostHog at
  4.78.4). 20 drifted files were formatted; `pnpm format:check` passes.
- **iOS 27.1:** build 12 should run on iOS 27 and 27.1; on iPhone Duo (from 23 Oct) it opens in a
  black-bordered compatibility box until Mahi is built with Xcode 27.1. From April 2027 App Store
  uploads must use the iOS 27 SDK. The native packages still behind (Expo patches, React Native
  0.86 → 0.88, screens, reanimated, gesture-handler 3, Sentry, …) need a new native build with a new
  version — the owner's call; recommended: wait for Expo SDK 58 and do it as one batch on Xcode 27.
  Can't move yet: async-storage 3, TypeScript 7, @types/node 26. eas-cli and pnpm are left as pinned.

**State on 2026-10-05 (newest first; older notes below):**

- **Phones:** build 12 (there is no build 11 — the numbers went 10 → 12) on the preview iPhones and
  TestFlight, both on the `preview` channel; latest update 12.06. Build 12 carries everything the
  notes below call "build 11" (video, Apple icons, hold to preview, Didit, RevenueCat, tap to focus)
  plus the phone's own tab bar.
- **Navigation at that point:** one row of swipe pages, Camera ⇄ Feed ⇄ Profile ⇄ Messages, sideways
  only, with the tab bar on build 12 in the same order (decisions #60–#64; superseded by #95 in the
  current branch). Search: the magnifier on the Profile
  screen, in Messages, and "Find friends" on an empty feed.
- **This round (12.04–12.06):** pinch to zoom on post photos (no switch), profile picture as a circle
  (tap outside to close), smooth swipe off a profile, like/comment higher, live countdown on the open
  feed, a "No tags to answer" card, invites that carry their code, refused posts keep their photos.
- **Q1–Q10 are answered and shipped.** See [decisions.md](./decisions.md). `tag-slots` remains a
  rollout switch, but its database contract and the clarified friend/non-user choice are live.
- **After every OTA, build or push:** post in the right Slack channels and bring these notes up to
  date ("/updateacross").

**State on 2026-10-01:**

- **Backend:** every migration in `supabase/migrations/` through `20261002130000_comment_likes` is live on
  production (checked against prod 2026-10-02); `20261002150000_identity_verifications` and
  `20261002170000_mahi_points` are waiting. Edge Functions live: `send-otp`, `verify-otp`, `complete-signup`,
  `send-reset-code`, `reset-password`, `delete-account` (JWT on), plus `check-email` (not in this repo).
  `send-push` is built but not deployed, and `20261002190000_tag_and_feed_pushes` is waiting with
  it (push go-live, below). See [supabase/README.md](../supabase/README.md).
- **App:** native build 10, version `0.1.0`, on the EAS **preview** lane only — nothing is in the stores.
  Changes ship as OTA updates (history in `ui/src/constants/ota.ts`); see the `/version-control` skill.
- **Built and on (flags in [feature-flags.md](./feature-flags.md)):** the tag loop (3 tags, 48-hour deadlines,
  locked feed, Mahi points, invite links + "Invite 3 friends" step), native-feel update (gesture-handler navigators,
  glass nav rail with morphing selector, native page sheets and action sheets, welcome cards, locked-feed card,
  camera two-photo guide), password reset by emailed code, in-app Delete account, Inter font, design tokens
  enforced by tests, sentence-case labels. Founder's choices: [decisions.md](./decisions.md).
- **Reactive posting (decided 2026-10-01):** you post only when a friend has tagged you and the tag is still
  open (48 hours), except your first post — no daily limit, one post per tag answered. Rules:
  [architecture.md](./architecture.md#reactive-posting).
- **Mahi points (decided 2026-10-02, decisions #47–#50):** each post that answers a tag earns 1 Mahi point
  (only the answerer; no daily cap); a missed tag puts your points back to 0 (`streak_lost` notice: "Your
  points are back to 0.") and keeps the feed locked until a friend tags you again; Best is never lowered.
  "This is not streaks" — the word streak is never shown, and there is no daily streak. The old points
  (tagger point, 3-a-day cap) are retired by migration `20261002170000_mahi_points` (**not pushed yet**);
  the `mahi-points` flag is gone from the code and from PostHog (deleted 2026-10-02, after OTA 10.26).
- **Earlier hardening still in force:** typed `ui/src/lib/env.ts`, `ErrorBoundary`, every store reset on
  sign-out, server-authoritative sign-up codes, Jest + pgTAP + typecheck CI.

**Pending (the work ahead):**

- **Push notifications (built 2026-10-02, not live; decisions #52–#59,
  [architecture.md](./architecture.md#push-notifications)).** In the app, behind `push-core` (now a
  default-off flag, still absent from PostHog): a full-screen "turn on notifications" page once per
  device after the welcome cards, and a reminder line on the camera for someone tagged with
  notifications off. On the server, migration `20261002190000_tag_and_feed_pushes` (**not pushed**):
  the new tag and reminder wording, two feed-lock pushes with their own switches, and a rule that a
  push more than an hour overdue is closed instead of sent. **No new native build is needed for
  iPhone** — build 10 has the notifications module and the push entitlement (checked in the build
  file); the app side goes by OTA. Owner's ordered steps (Apple push key check, migration, function
  and secrets, Vault, OTA, one test push, then the flag for everyone, and how to roll back):
  [go-live-runbook.md](./go-live-runbook.md#switching-push-notifications-on). Not checked on a
  phone. Waiting on the founder: sign-off on the push wording (the full list is in the architecture
  doc), whether both feed pushes stay on, and whether a lock-screen countdown (#59) is wanted for
  build 11. Android needs Google's FCM credentials and its first build.
- Invite landing page on `togethermahi.com` (the domain doesn't resolve yet; the 6-character code works).
- **Video posts (built 2026-10-02, flag `video-posts`, default OFF — [architecture.md](./architecture.md#video-posts)):**
  needs a new native build (adds `expo-video`; the microphone text stays, reworded), migration
  `20261002100000_video_posts` pushed, and the `video-posts` flag created in PostHog switched off. Build 10
  stays safe after OTAs: no video module there = video off. Not yet checked on a phone.
- **Comment likes (built 2026-10-02, flag `comment-likes`):** migration `20261002130000_comment_likes`
  pushed, then the flag created in PostHog at 100%. No native build needed. Not yet checked on a phone.
- Next native build: add `expo-symbols` for Apple icons. (The microphone text is kept for video posts.)
- **Identity checks (Didit) and in-app purchases (RevenueCat) — dormant in build 11** (flags
  `identity-verification` and `purchases`, both default OFF —
  [architecture.md](./architecture.md#identity-checks-and-purchases-dormant)). Build 11 carries the native
  pieces; switching either on later is an OTA plus the flag. Nothing is deployed or pushed. Owner steps:
  - _Didit:_ make an account at business.didit.me; build a workflow (ID document + liveness + face match,
    no NFC) and copy its workflow id; create an API key; add a webhook destination with URL
    `https://pzepodsppqtvptzmwxzs.supabase.co/functions/v1/didit-webhook` and copy its secret. Then:
    ```bash
    export SUPABASE_ACCESS_TOKEN=<Mahi token>
    supabase secrets set --project-ref pzepodsppqtvptzmwxzs \
      DIDIT_API_KEY=<key> DIDIT_WORKFLOW_ID=<workflow id> DIDIT_WEBHOOK_SECRET=<webhook secret>
    scripts/db.sh backup
    scripts/db.sh try supabase/migrations/20261002150000_identity_verifications.sql supabase/tests/identity_verifications_test.sql
    scripts/db.sh push --dry-run && scripts/db.sh push
    supabase functions deploy didit-session --project-ref pzepodsppqtvptzmwxzs
    supabase functions deploy didit-webhook --no-verify-jwt --project-ref pzepodsppqtvptzmwxzs
    ```
  - _RevenueCat + App Store Connect:_ sign the Paid Apps Agreement (banking and tax) in App Store Connect;
    create the products (subscriptions or one-off purchases); create an In-App Purchase key (.p8) under
    Users and Access → Integrations and give RevenueCat the .p8, its key id and the issuer id; in the app's
    App Store Connect page set App Store Server Notifications (Version 2) to the URL RevenueCat shows. In
    RevenueCat: a project, the iOS app (`com.mahi.app`), the products, an entitlement and a current offering
    (and a paywall if you want RevenueCat's). Put the public SDK keys in each EAS lane as **sensitive**
    (not secret — updates can't read secrets):
    `eas env:create --environment production --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_… --visibility sensitive`
    (same for `preview`; `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` when Android comes).
  - Apple reviews the first in-app purchase together with an app version: submit the products with the
    version that first shows them.
  - Create both flags in PostHog **switched off**; turn on only after the steps above.
  - Question for you: build 11's camera and microphone texts talk about workouts. Apple may want them to
    mention identity checks once Didit is switched on — reword before that store build?
- **Mahi points release:** `scripts/db.sh try` the migration with its tests, back up, push (the push also
  carries `20261002150000_identity_verifications` if it's still waiting — it's additive and safe), then
  the OTA. Later, once every phone has that OTA: `supabase/deferred/contract_points.sql`.
- Parked decision: success targets (#12). (Streak rule #1, existing streaks #10 and rest days #27 were
  decided on 2026-10-01 with reactive posting; #1 became Mahi points on 2026-10-02.)
- Store release, then the `supabase/deferred/` contract steps.

---

## 2. Rules that never change (standing guardrails)

These are non-negotiable on every change, by anyone (human or agent):

1. **No AI/assistant fingerprints, ever.** No "Claude", "AI", "generated by", or `Co-Authored-By` trailers — not in code, docs, or commit messages. Commits read as a normal engineer's.
2. **Checkpoint commits, no push without a go.** Commit each finished change with a clean imperative message, staging files by name. Never push, deploy or publish unless the owner says so in that session. Don't batch a day's work into one commit.
3. **Flip-test everything (red → green).** Never trust a green you haven't first seen red. Break the thing → confirm the check fails → fix → confirm it passes. Applies to typecheck gates, tests, runtime guards, RLS.
4. **Layering contract.** Dependencies flow downward only (§1). The only legal sideways import is store→store for documented cross-store effects. Screens never import `api/` or the supabase client for app data (today's exceptions are listed in [architecture.md](./architecture.md#layering-contract); don't add more).
5. **Config through `ui/src/lib/env.ts`.** Never read `process.env.*` directly.
6. **Every new store's `reset()` is wired into the `App.tsx` sign-out branch.** (Forgetting this is the exact bug that leaked one user's state into the next.)
7. **Security is server-side.** RLS is the only authorization layer — every new table/RPC must have correct, owner-scoped policies, version-controlled in `supabase/migrations/`. Anything a malicious client could forge (verification, counts, ownership) lives in an RLS policy or a `SECURITY DEFINER` RPC, never in the client.
8. **Styles from tokens** — every colour, size, spacing, radius, opacity, motion, swipe, wait and font from
   `ui/src/constants/tokens.ts` / `fonts.ts` (`designTokens.test.ts` and `fonts.test.ts` fail otherwise). Inter
   only, no italic. Light/dark via `useAppTheme()` / `themeColors(dark)`. UI copy in sentence case; no
   all-caps letter-spaced labels (MAHI wordmark excepted) — `sentenceCase.test.ts` fails otherwise.
9. **`{ data, error }` contract** on every `api/` function (wrap PostgrestError as `new Error(error.message)`).
10. **Every feature behind a PostHog flag**, created in PostHog at 100% **before** the update that reads it
    ships — a missing flag reads as off ([feature-flags.md](./feature-flags.md)).
11. **The keyboard never covers a sheet, field or button** (see CLAUDE.md).

---

## 3. Patterns to copy (don't reinvent structure)

Adding a full-stack feature is a mechanical copy of proven files — full recipe in
[adding-a-feature.md](./adding-a-feature.md). Reference map:

| Need                                 | Copy                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| API function                         | `ui/src/api/follows.ts`                                                                                         |
| Optimistic store + realtime registry | `ui/src/store/followStore.ts`                                                                                   |
| Thin hook (sync on mount)            | `ui/src/hooks/useFeed.ts`                                                                                       |
| Thin hook (subscription lifecycle)   | `ui/src/hooks/useNotifications.ts`                                                                              |
| DB table + RLS + RPC                 | `follows` table + `get_follow_data` in `supabase/migrations/`                                                   |
| User-facing failure feedback         | `useToastStore.getState().show(...)`                                                                            |
| Native page sheet                    | `BlockedUsersSheet.tsx` (`<Modal presentationStyle="pageSheet">`)                                               |
| Page swipe / spring                  | `HorizontalNavigator.tsx` + `ui/src/lib/swipeRules.ts` (`SPRING.page`, `SWIPE` in tokens)                       |
| Pure, tested UI rules                | `ui/src/lib/feedLock.ts` + `ui/src/lib/__tests__/feedLock.test.ts`                                              |
| Gate a feature behind a flag         | `useFeatureFlag('flag-key')` (keys in `ui/src/lib/featureFlags.ts`; see [feature-flags.md](./feature-flags.md)) |

---

## 4. The Goal Loop (goal-driven development process)

We work as a **loop over specific goals** — one goal at a time, each taken to "done" through the same pipeline
before the next starts. A "goal" = one roadmap item (e.g. _"1.3 Split Messages row taps"_) or one backlog item.

```
        ┌────────────────────────────────────────────────────────────────┐
        ▼                                                                │
  0. SELECT   →  1. MAP   →  2. DESIGN  →  3. BUILD  →  4. VERIFY  →  5. CHECKPOINT
  (one goal)    (real code)  (layers)     (copy        (red→green)    (commit,
                                           patterns)                   then loop) ──┘
```

**0. SELECT** — Pick the next goal (current plans: [tag-loop-plan.md](./tag-loop-plan.md); the owner's list of next features). Write it as one sentence + explicit **acceptance criteria** (what observable behavior proves it's done). One goal in flight at a time.

**1. MAP** — Locate the exact current code the goal touches (files + lines + functions). The roadmap already cites these per feature; confirm against the live code before editing.

**2. DESIGN** — Apply the layering contract: list which layers change (DB → api → store → hook → UI) and the security posture (new RLS? native permission? consent cache?). For full-stack goals, follow `adding-a-feature.md` step order (DB first).

**3. BUILD** — Implement by copying the template files (§3). Obey every standing rule (§2): env, theme colors, sign-out reset, `{data,error}`, RLS-first.

**4. VERIFY (red → green)** — The gate. For the goal:

- `pnpm typecheck` green, `pnpm test` green, `pnpm lint` clean.
- A **behavioral flip test**: break the new behavior, watch the check/UX fail (RED), restore, watch it pass (GREEN). Add a unit test for any pure logic introduced.
- For DB/RLS goals: prove the policy denies the forbidden case before allowing the permitted one.
  A goal is not "done" until its red→green is demonstrated.

**5. CHECKPOINT** — Commit (clean message, no AI fingerprints), staging files by name. Push only when the owner says so in that session. Update the plan's status. Then return to step 0 for the next goal.

**Scaling the loop with agents.** For a broad or multi-part goal, fan out the MAP and BUILD across parallel
agents on **disjoint file sets** (partition by file so there are no write conflicts), then converge on a single
VERIFY + CHECKPOINT. Security-critical SQL/auth changes get an adversarial review pass before checkpoint.

---

## 5. Commands

The repo is a pnpm workspace: the Expo app is in `ui/`, the waitlist site in
`web/`, the database in `supabase/`, shared scripts in `scripts/`. Run every command below from the repo
root; the app ones hand over to `ui/` (`pnpm --dir ui …`). EAS commands run from `ui/`, where `eas.json`
sits next to `app.config.js` (the `/version-control` skill has them). Install packages from the root:
`pnpm --filter ./ui add <pkg>`, or `cd ui && npx expo install <pkg>` for Expo packages.

```bash
pnpm typecheck      # tsc --noEmit on ui/ (CI gate; supabase/ is outside it — it's Deno)
pnpm test           # jest in ui/ (pure-logic tests, design-token, font and sentence-case guards)
pnpm test:scripts   # script, guard-hook and email-token tests
pnpm tokens:email   # regenerate the code email's tokens after a token change (then redeploy its functions)
scripts/db.sh local # replay every migration on a throwaway local Postgres and run the pgTAP tests
pnpm lint           # eslint ui/src
pnpm format         # prettier --write ui/src (pnpm format:check only checks)
pnpm start          # expo, in ui/
pnpm dev:web        # the waitlist website in web/ (also build:web, lint:web)
```

After editing source, rebuild the graph per [CLAUDE.md](../CLAUDE.md). Production database and function changes
are the owner's, through `scripts/db.sh` ([supabase/README.md](../supabase/README.md)). Builds, OTA updates and
versions: the `/version-control` skill.

---

## 6. Doc map

- [architecture.md](./architecture.md) — data flow + **layering contract**
- [adding-a-feature.md](./adding-a-feature.md) — the copy-this recipe
- [tag-loop-plan.md](./tag-loop-plan.md) — the tag-loop build plan, with each phase's status
- [decisions.md](./decisions.md) — every product decision, the options not taken, and what's parked
- [go-live-runbook.md](./go-live-runbook.md) — what's live and the owner's remaining release steps
- [feature-roadmap.md](./feature-roadmap.md) — the June 2026 feedback round (Phases 1–5, all shipped; history)
- [feature-flags.md](./feature-flags.md) — PostHog flags, the `useFeatureFlag` gate, MCP scoping
- [state-management.md](./state-management.md) · [integrations.md](./integrations.md) · [hooks.md](./hooks.md)
- [supabase/README.md](../supabase/README.md) — backend + migration reconciliation
- [web/README.md](../web/README.md) — the waitlist website: local dev, design tokens, Netlify setup and how to deploy
- [RULES.md](../RULES.md) — project rules (also points here)
