# Mahi Fitness — Architecture

## Overview

Mahi Fitness is a React Native fitness application built with Expo (iPhone first). Users post a two-photo workout from the Camera screen only to answer a friend's tag (reactive posting, below — the first post is the exception), and every post tags 3 friends, who have 48 hours to answer. Each answer earns one Mahi point; the friends-only Feed opens for 24 hours after each post (the tag loop — [tag-loop-plan.md](./tag-loop-plan.md), [decisions.md](./decisions.md)). The app has messaging (inbox + requests), notifications, and profiles with Mahi points (Points and Best).

## Reactive posting

The posting rule since 2026-10-01 ([decisions.md](./decisions.md#reactive-posting-2026-10-01) #1, #10, #27–#30; Mahi points #47–#50):

- **Reactive posting** — you post only when a friend has tagged you and you can still answer (48 hours,
  `app_config.tag_window`, plus 10 minutes `answer_grace`). Your very first post is the one exception. The
  server enforces it: `create_post` checks `public.reactive_posting_open(user)` and raises
  `reactive posting: not tagged` otherwise (migration `20261001120000_reactive_posting.sql`, test
  `supabase/tests/reactive_posting_test.sql`). The app's copy of the rule is `reactivePostingGate()` in
  `src/lib/reactivePosting.ts`, fed by the feed's lock state (`unlockedUntil` is null until the first post) and the open tags: the camera
  shows a spinner while that loads and "No tags to answer" when closed; the server error maps to the same
  toast. There is no daily limit any more: one post per tag answered, as often as you're tagged (the
  migration drops the old one-a-day index).
- **Mahi points** (founder, 2026-10-02: "This is not streaks. Streaks are a daily thing.") — each post
  that answers at least one tag earns its poster 1 point (not 1 per tag); the tagger earns nothing and
  there is no daily cap. Miss a tag's 48 hours and the points go back to 0 (`break_missed_streaks`, run
  by the `mark_missed_tags` cron and inside `create_post`); the person who missed gets a `streak_lost`
  notification ("You missed @x's tag. Your points are back to 0.", actor = the tagger), the tagger gets
  `tag_missed`. The best is never lowered and always shown. The database keeps the old names so older
  apps keep working: `profiles.streak_current` = points, `streak_highest` = best, `posts.streak_day` =
  the poster's points after that post, `create_post` returns them as `streak`. `points` in feed items,
  the tag list and the profile's computed column carries the same number
  (`20261002170000_mahi_points.sql`, test `supabase/tests/mahi_points_test.sql`). App wording:
  `src/lib/mahiPoints.ts` ("N points", hidden at 0 on posts); the word streak is never shown. No daily
  streak, rest days, training days or calendar. The old separate points (tagger point, 3-a-day cap,
  `point_events`) are gone.
- **Feed** — every post opens the feed for 24 hours. Tagged within those 24 hours → it locks when they
  end; not tagged → it stays open until you're tagged, then locks. Miss a tag and it stays locked until
  a friend tags you again (you can't post without a tag); a cancelled tag no longer locks. Wording:
  `src/lib/feedLock.ts`. Backend is Supabase (auth, database, storage, Edge Functions). State is managed with Zustand using an optimistic-UI-first pattern; features sit behind PostHog flags ([feature-flags.md](./feature-flags.md)).

## Push notifications

Founder, 2026-10-02 ([decisions.md](./decisions.md#push-notifications-2026-10-02) #52–#59). The app asks
for the permission, the database decides what is sent and when, one function sends. **Not live yet:**
`send-push` is not deployed and `push-core` is absent from PostHog; the owner's steps are in
[go-live-runbook.md](./go-live-runbook.md#switching-push-notifications-on). No new native build is needed
for iPhone (build 10 has `expo-notifications` and the push entitlement).

- **Asking** (flag `push-core`, default off). `PushPrimer` (`src/components/PushPrimer.tsx`, rendered in
  `App.tsx` beside the welcome cards) is a full-screen page: "When do you post on Mahi?", one line of
  why, and a card "Please turn on notifications" with **Allow** (brings up the phone's own question)
  and **Not now**. It shows once per device — remembered once answered — to someone the phone has not
  asked yet, and only when the welcome cards are out of the way (`WelcomeCards` reports `onSettled`) and
  the phone's camera question has been answered (`usePushPrimer` re-reads the camera permission each time
  the app comes back to the front). It replaces the old pop-up. Someone who chose "Not now" or told the
  phone "Don't allow" sees, while they hold an open tag, one line under the camera's open-tags pill
  (`PushNudge`, inside `OpenTagsBanner`): "Turn on notifications so you never miss a tag". A tap opens
  Mahi in the phone's Settings — or, if the phone was never asked, brings up its question (Settings has
  no notifications row until it has). The ✕ hides it until the next tag. The rules are pure and tested:
  `shouldShowPushPrimer`, `pushNudge`, `nudgeDismissMark` in `src/lib/pushPrimer.ts`. State lives in
  `pushStore` (`permission`, `primerAnswered`, `nudgeDismissedThrough`); `usePushRegistration` refreshes
  it on sign-in and on every return to the front, and registers the device once allowed — so switching
  notifications on in Settings is picked up without a restart. Events: `push_primer_answered`,
  `push_nudge`, `push_opened`.
- **What is sent** (title "Mahi"; several due in the same minute for one person become one push ending
  "(+N more)"). The words live in `push_on_notification`, `queue_tag_pushes`,
  `schedule_feed_lock_pushes` (`20261002190000_tag_and_feed_pushes.sql`) and `send_message`; the
  notifications list says the same through `notificationText()` (`src/lib/notificationText.ts`), minus
  what goes out of date ("just", the hours left).

  | Push | Words | Tap opens |
  | --- | --- | --- |
  | Tagged | You've just been tagged by @sam. 48 hours left to post your Mahi! | Camera |
  | Reminders, 24 h and 2 h before the deadline | 24 hours left to post your Mahi! @sam is waiting. | Camera |
  | Feed about to lock | Your feed locks in 1 hour. Post your answer to @sam to keep it open. | Camera |
  | Feed locked | Your feed is locked. Post your answer to @sam to open it. | Camera |
  | Your tag was answered | @sam answered your tag in 3h | Notifications list |
  | Your tag was missed | @sam missed your tag | Notifications list |
  | You missed a tag | You missed @sam's tag. Your points are back to 0. | Notifications list |
  | Like / comment | @sam liked your post · @sam commented on your post | Notifications list |
  | Follow | @sam started following you | Their profile |
  | Joined from your invite | @sam joined Mahi from your invite | Their profile |
  | Message (one per sender per chat per minute) | Sam sent you a message | Messages |

  A push can't tick, so each states the time left at the moment it is sent. The hours in the tag push
  come from `app_config.tag_window`.
- **Feed-lock pushes** follow `viewer_is_locked`: they are queued only for someone whose feed is open on
  its 24 hours and who holds an open tag made since their last post — the warning
  `feed_lock_warning_lead` (1 hour) before the 24 hours end, the locked push when they end, both naming
  the tag with the nearest deadline. A tag that arrives after the 24 hours locks the feed at once and
  its own tag push is the news: no second push. `schedule_feed_lock_pushes(user)` works one person's
  two pushes out from scratch; the `queue_tag_pushes` trigger on `tag_challenges` calls it whenever a tag
  is made, answered, cancelled or missed, so posting (which answers every open tag) takes them back. The
  same trigger queues the two reminders — `create_post` and `claim_invite` no longer do. Each feed push
  has its own switch (`feed_lock_warning_push`, `feed_locked_push`).
- **Sending.** Everything goes through `enqueue_push` into `push_outbox` in the same transaction as the
  change it announces: no push to yourself, between blocked people, from or to a banned person. Quiet
  hours (22:00–07:00 in the person's own time zone) move a push to 07:00; a reminder that would then be
  past its deadline, and a feed warning that would have to wait at all, are dropped. The `send-push` job
  runs every minute (`invoke_send_push` → `supabase/functions/send-push` → Expo's push service →
  Apple), and skips until the two Vault secrets exist. `claim_push_batch` hands out what is due and
  closes anything more than `push_stale_after` (1 hour) overdue as `stale` instead of sending it, so a
  pause — or switching push on for the first time — never sends a backlog. Receipts are checked every
  15 minutes and dead device tokens removed.
- **Tapping** a push: `pushDestination()` (`src/lib/pushRoute.ts`) → `usePushRouting` in
  `HorizontalNavigator`, which moves the pages to the Camera or Messages, or opens the profile or
  the notifications over them.
- **Later:** a live countdown on the lock screen (iOS Live Activity) — researched, not built; it needs
  a native build.

## Video posts

Owner, 2026-10-02 ([decisions.md](./decisions.md#video-posts-2026-10-02) #33–#38). Flag `video-posts`,
**default off** (off while flags load and with no PostHog key; on only when PostHog says true).

- **What it does:** each of a post's two shots (rear = your view, front = selfie) is a photo or a video of
  up to 15 seconds. On the camera a Photo / Video switch sits by the shutter (beside the 1× / 0.5× lens
  toggle); a tap does what the switch says, and pressing and holding the shutter always records until you
  let go, or 15 s. Recording: 1080p H.264 at ~5 Mbit/s (~9 MB for 15 s), standard stabilisation, `VIDEO_RECORDING` in
  `src/lib/videoPosts.ts`. Videos play muted and looping while on screen — preview, feed, the small window,
  the post viewer — with a mute / unmute button (`PostVideo`, `SoundButton` in `src/components/PostVideo.tsx`);
  the profile grid shows the still photo (or a video card) with a video mark (`gridTile`).
- **Microphone:** the camera stays in photo mode and muted unless video is on and in use, so the system
  prompt can't appear on its own (expo-camera adds a microphone input as soon as `mode="video"` is unmuted).
  The first recording asks once (`askMicIfNew` in `CameraScreen`); a refusal records silent video.
- **Older builds and OTA safety:** OTA updates reach build 10, which has no `expo-video` native module.
  Nothing imports `expo-video` at the top level: `src/lib/videoModule.ts` checks
  `requireOptionalNativeModule('ExpoVideo')` and only then requires the package. No module = video posts
  off (`videoAvailable(flag, native)`, hook `useVideoPosts`), and a video someone else posted shows an
  "Update Mahi to play videos" card instead of a player.
- **Server** (migration `20261002100000_video_posts`, test `video_posts_test.sql`): `posts.rear_media_type` /
  `front_media_type` (`'photo' | 'video'`, default `'photo'`); `create_post` takes `p_rear_media_type` /
  `p_front_media_type` last and optional, and refuses a mismatch (`unsupported media`: a video must be a
  `.mov` / `.mp4`, a photo must not); `feed_item` returns both types, null while locked (with the paths,
  so a locked viewer gets no video links). The `posts` bucket now takes `image/jpeg`, `video/quicktime`,
  `video/mp4` up to 50 MB. The app sends the media arguments only for a post with a video, so photo posts
  make exactly the old call. Posting rules are unchanged: a video post answers tags like a photo post.
- **Uploads:** a video is read from its file only when posting (`uploadPostMedia`); the feed shows the
  pending post with "Posting…" until it's saved. Nothing new is kept on the device.

## Identity checks and purchases (dormant)

Prepared 2026-10-02 so build 11 carries the native pieces; switching either on later is an OTA plus its
flag. Both flags are **default off** (`DEFAULT_OFF_FLAGS`). No screen uses them yet. Owner steps:
[HANDOVER.md](./HANDOVER.md) (pending list).

- **OTA safety:** OTA updates also reach build 10, which has neither SDK. Nothing imports them at the top
  level. `src/lib/diditModule.ts` checks `TurboModuleRegistry.get('SdkReactNative')` (the package itself
  calls `getEnforcing`, which throws without the module) and `src/lib/purchasesModule.ts` checks
  `NativeModules.RNPurchases` / `RNPaywalls`; only then is the package required. No module = off. Tested in
  `src/lib/__tests__/nativeLoaders.test.ts` (the package is never required when the module is missing).
- **Identity checks (Didit, flag `identity-verification`):** config plugin in `app.config.js` with the
  `autodetection` variant on both platforms (automatic capture, no NFC — so no NFC capability, entitlement
  or usage text; camera, microphone, photos and location texts already exist). Flow: hook
  `useIdentityVerification` → `identityStore.startIdentityCheck` → `didit-session` function (checks the
  caller's token; already approved → no new session; at most 5 sessions a day; `POST /v3/session/` with
  `x-api-key`, the workflow and `vendor_data` = user id; stores a `pending` row) → the SDK's
  `startVerification(token)` → reload the status. What the phone saw is only a hint (`sdkResultHint`). The
  real result comes from `didit-webhook` (no JWT; HMAC-SHA256 `X-Signature` over the raw body or
  `X-Signature-V2` over the canonical JSON, `X-Timestamp` within 5 minutes) into `identity_verifications`
  via `record_identity_verification` (service role only; idempotent; an older event arriving late changes
  nothing; a session stays with the person who started it). Statuses: `pending`, `in_review`, `approved`,
  `declined`, `expired` (Didit's ten mapped in `supabase/functions/_shared/didit.ts`). `decision` keeps
  statuses only — names, document numbers, dates of birth and images stay at Didit. People read only their
  own rows; nothing is kept on the device. Migration `20261002150000_identity_verifications`.
- **Purchases (RevenueCat, flag `purchases`):** public keys `EXPO_PUBLIC_REVENUECAT_IOS_KEY` /
  `_ANDROID_KEY` through `src/lib/env.ts`. `purchasesAvailability` = flag on AND native module AND key.
  Hook `usePurchases()` (availability, current offering, `hasEntitlement(id)`, `purchase(pkg)`,
  `restore()`, `presentPaywall()` via react-native-purchases-ui); mounting it configures RevenueCat once
  per app run with app user id = Supabase user id, and a different account logs in. Sign-out calls
  `usePurchasesStore.reset()`, which logs RevenueCat out only if it was configured. No server pieces yet:
  entitlements come from RevenueCat's SDK.

## Tech Stack

| Layer | Tool | Version |
|---|---|---|
| Framework | Expo (React Native 0.86) | ~57.0.23 |
| Language | TypeScript (strict) | ~6.0.3 |
| Backend / Auth | Supabase | ^2.116.0 |
| State Management | Zustand | ^5.0.15 |
| Session Storage | AsyncStorage | ^2.2.0 |
| List Rendering | @shopify/flash-list | 2.0.2 |
| Gestures | react-native-gesture-handler | ~2.32.0 |
| UI Animation | react-native-reanimated | 4.5.1 |
| Font | @expo-google-fonts/inter | ^0.4.2 |
| Glass / Blur | expo-glass-effect, expo-blur | ~57 |
| Gradients | expo-linear-gradient | ~57.0.2 |
| Video playback | expo-video (loaded only when the build has it) | ~57.0.5 |
| Identity checks | @didit-protocol/sdk-react-native (dormant, loaded only when the build has it) | 4.9.0 |
| In-app purchases | react-native-purchases (+ -ui) (dormant, loaded only when the build has it) | 10.11.0 |
| Analytics | PostHog | ^4.74.0 |
| Error Tracking | Sentry | ^8.26.0 |

Versions as in `package.json`; check there before relying on one.

---

## Project Structure

```
mahi-fitness/
├── src/
│   ├── api/            # Supabase query functions (posts, messages, profile, tags, auth)
│   ├── lib/            # Singleton clients (Supabase, PostHog, Sentry) + pure, unit-tested rules
│   │                   #   (swipeRules, railSelector, feedLock, captureGuide, inviteStep, inviteShare,
│   │                   #    reactivePosting, mahiPoints, welcomeCards, featureFlags, versionGate, …;
│   │                   #    tests in __tests__/)
│   ├── constants/      # tokens.ts (design tokens), fonts.ts (Inter), ota.ts (OTA counter + history)
│   ├── store/          # Zustand global state (feedStore, messagesStore, tagStore, inviteStore, …)
│   ├── hooks/          # Thin store wrappers + utility hooks (useFeed, useOpenTags, useFeatureFlag, …)
│   ├── types/          # TypeScript types — database.ts is the source of truth for DB shapes
│   ├── components/     # Shared UI (AppHeader, NavRail, WelcomeCards, FeedLockBanner, TagSlotsSheet,
│   │                   #   CapturePipGuide, InviteStep, InviteShareSheet, DraggablePip,
│   │                   #   LoginSheet, CreateAccountSheet, ForgotPasswordSheet, OtpCodeInput, SettingsPanel,
│   │                   #   BlockedUsersSheet, KeyboardInset, GlobalSearchOverlay, …)
│   └── screens/        # Screen-level components (navigators, Camera, Feed, Profile, UserProfile, …)
├── supabase/           # migrations, rollbacks, pgTAP tests, Edge Functions (see supabase/README.md)
├── docs/               # Project documentation
├── assets/             # Images, icons, splash
├── App.tsx             # Root component — auth subscription + store hydration
├── index.ts            # Entry point (registerRootComponent)
└── app.config.js       # Expo config (dynamic)
```

---

## Data Flow

The Zustand stores are the **single event-ordering layer** between the UI and Supabase.

```
User Action
    │
    ▼
Zustand Store  ←── instant synchronous update (UI responds immediately)
    │
    ▼ (background)
Supabase API   ←── network call fires after store is updated
    │
    ▼
Store confirm / rollback
```

`App.tsx` hydrates feed and messages stores immediately after auth — screens have data before they mount.

```
onAuthStateChange (session found)
    │
    ├── getProfile(userId)              → useUserStore.setProfile()
    ├── useFeedStore.sync()                     → background, non-blocking
    ├── useMessagesStore.sync()                 → background, non-blocking
    ├── useNotificationsStore.sync(userId)      → background, non-blocking
    └── useBlockStore.sync(userId)              → background, non-blocking

useMessages() mount (MessagesScreen)
    │
    └── useMessagesStore.subscribeToInbox(userId)
            ├── channel inbox_p1:{userId}  → participant_one=eq.{userId}
            └── channel inbox_p2:{userId}  → participant_two=eq.{userId}

useConversation(conversationId) mount (ConversationScreen)
    │
    └── channel convo:{conversationId}  → conversation_id=eq.{conversationId}
```

---

## Layering Contract

The architecture is 5 layers with a strictly **downward** dependency direction:
`screens/components → hooks → stores → api → lib → supabase`. Every change must obey these
import rules. To add a feature, follow [adding-a-feature.md](./adding-a-feature.md).

| Layer | May import | Must NOT | Owns |
|---|---|---|---|
| **Screens / Components** | hooks, stores (`getState()` actions only), components, lib, types | `src/api/*` or the supabase client for app data (the `App.tsx` auth bootstrap is the one sanctioned exception) | rendering, local UI state |
| **Hooks** (`src/hooks/*`) | stores, types | business logic; direct API calls (delegate to a store action) | realtime subscription lifecycle in a `[userId]`-keyed `useEffect`; re-exposing store selectors/actions |
| **Stores** (`src/store/*`) | api, lib (supabase for realtime channels only), types, other stores (documented cross-store effects) | putting realtime channels in `set()` state | optimistic state + rollback; realtime channels in a module-level `Map`; a `reset()` that tears down channels + clears state, **wired into `App.tsx` sign-out** |
| **API** (`src/api/*`) | lib (supabase), types | React, Zustand, any state | pure stateless calls returning `{ data: T \| null, error: Error \| null }` (wrap PostgrestError via `new Error(error.message)`); barrel-exported from `index.ts` |
| **lib** (`src/lib/*`) | nothing from upper layers | — | singleton clients (supabase/sentry/posthog), the typed `env` accessor, pure utils |

**Known exceptions in today's code (2026-10-01):** some screens and components call `src/api` (or the Supabase auth client) directly for one-off reads or writes that no store owns — auth and account (`LoginSheet`, `CreateAccountSheet`, `ForgotPasswordSheet`, `SettingsPanel`), `CameraScreen` (photo upload + `create_post`), `UserProfileScreen`, `GlobalSearchOverlay`, `FollowListModal`, `BlockedUsersSheet`, `AvatarPicker`. Don't add more; new shared data goes through a store.

**The only legal sideways import is store→store** for already-documented cross-store refreshes
(e.g. `socialStore` → `feedStore.patchPost`; `blockStore` → `feedStore`/`messagesStore`/`followStore`).

**Cross-cutting invariants:**
- **Env:** never read `process.env.*` directly — import the typed, fail-fast `env` from `src/lib/env.ts`.
- **Sign-out:** every store with a `reset()` must be called in the `App.tsx` sign-out branch (prevents
  cross-account state/realtime leaks on the same device).
- **Errors:** the whole tree is wrapped in `src/components/ErrorBoundary.tsx` (reports to Sentry, shows a
  recoverable fallback). It is the only sanctioned class component.

---

## Database Schema

| Table | Purpose |
|---|---|
| `public.profiles` | User profile — display name, avatar, Mahi points (`streak_current`) and best (`streak_highest`) |
| `public.posts` | Workout posts, made under reactive posting (above), each carrying the poster's Mahi points after it (`streak_day`). `image_url` = rear/POV photo; `pov_image_url` = front selfie (nullable — null on legacy single-photo posts). `rear_media_type` / `front_media_type` = `'photo'` or `'video'` per shot (video posts, default `'photo'`). No daily limit: one post per tag answered (the old one-a-day unique index was dropped by `20261001120000_reactive_posting.sql`) |
| `public.post_likes` | One row per user-post like. Unique constraint `(post_id, user_id)`. RLS: authenticated read-all, insert/delete own only. |
| `public.post_comments` | Comments on posts. Ordered oldest-first. RLS: authenticated read-all, insert/delete own only. |
| `public.comment_likes` | One row per user-comment like (flag `comment-likes`). Unique `(comment_id, user_id)`, cascades with the comment and the profile. RLS: read where the comment is readable, insert own only and not across a block (`comment_like_allowed`), delete own only. Read through `get_comment_likes(post)` (count + liked by me per comment) and `get_comment_likers(comment)` (newest first, without people blocked either way or banned); written through `toggle_comment_like`. Migration `20261002130000_comment_likes`. |
| `public.follows` | Follow relationships. Unique constraint `(follower_id, following_id)`, self-follow check constraint. RLS: authenticated read-all, insert/delete own only (`auth.uid() = follower_id`). Explicit UPDATE deny policy. |
| `public.post_tags` | User-tag junction table: which users were mentioned on which post. Composite PK `(post_id, user_id)`. RLS: authenticated read-all, insert only when the caller owns the referenced post. Aggregated into `tagged_users` by the `get_feed_posts` RPC. |
| `public.conversations` | Messaging thread — one row per pair, ordered participants constraint |
| `public.messages` | Individual messages within a conversation |
| `public.notifications` | Activity feed (likes, comments, follows, tags, tag answered / missed, `streak_lost`, invites) |
| `public.user_blocks` / `public.user_reports` | Moderation |
| `public.tag_challenges` | A tag with its 48-hour deadline (tag loop) |
| `public.invites` | Invite links and 6-character codes |
| `public.push_tokens` / `public.push_outbox` | Push devices and the push queue (sender not deployed yet — [Push notifications](#push-notifications)) |
| `public.conversation_reads` | Unread counts |
| `public.app_config` | One row of numeric rules (tag window, unlock window, caps, `min_app_version`, `invite_links_enabled`) |
| `public.otp_codes` / `public.auth_rate_limits` | Hashed sign-up and reset codes (`purpose` = `signup` / `reset`) and send limits |

All tables use Row Level Security (RLS). Writes for posting and messaging go through one `SECURITY DEFINER` function each: `create_post` (checks reactive posting with `reactive_posting_open`, dates the post, adds the Mahi point, saves tags and deadlines, queues pushes, answers waiting tags) and `send_message`. The feed reads through `get_feed` (server-side lock), profiles through `get_user_posts`. Every migration is in `supabase/migrations/`; all through `20261002130000_comment_likes` are live (checked against prod 2026-10-02) — see `supabase/README.md` for the ones waiting; the old paths (`get_feed_posts`, the public photo bucket, direct message inserts) are retired later by the files in `supabase/deferred/`.

---

## API Layer — `src/api/`

| File | Exports |
|---|---|
| `posts.ts` | `getFeed` (`get_feed` — lock state, `like_count`, `comment_count`, `liked_by_me`, `tagged_users`), `getUserPosts` (`get_user_posts`), `hasEverPosted` (the first post is free), `uploadPostMedia` (photos or videos), `removePostPhotos`, `createPost` (`create_post`, one call with tags, invites, location and — for a video post — media types) |
| `tags.ts` | `getTaggableFriends`, `getOpenTags`, `getTagRules` |
| `invites.ts` | `getInvitePreview`, `claimInvite` |
| `social.ts` | `toggleLike` (single-RPC atomic toggle), `getComments`, `addComment`, comment likes: `getCommentLikes`, `toggleCommentLike`, `getCommentLikers` |
| `follows.ts` | `followUser`, `unfollowUser`, `getFollowData`, `getFollowList`, `getFriends`, `getSuggestedFollows` |
| `messages.ts` | `getInbox`, `getRequests`, `acceptRequest`, `sendMessage`, `createOrGetConversation`, `deleteConversation`, `getMessages`, `markConversationRead` |
| `notifications.ts` | `getNotifications`, `getUnreadCount`, `markAsRead`, `markAllAsRead` |
| `moderation.ts` | `blockUser`, `unblockUser`, `getBlockedUsers`, `getBlockedIds`, `reportUser`, `hasReported` |
| `profile.ts` | `getProfile`, `searchProfiles`, `updateAvatarUrl`, `updateTimezone` (sign-up inserts the profile row directly) |
| `auth.ts` | `signIn`, `signOut`, `completeSignup`, `sendResetCode`, `resetPassword`, `deleteAccount` (Edge Functions) |
| `push.ts` | `registerPushToken`, `unregisterPushToken` |
| `appStatus.ts` | `getAppGate` (forced-update gate) |

All barrel-exported from `src/api/index.ts`.

---

## Navigation

The app uses **state-driven navigation** — no React Navigation, no router (don't add one). Transitions are handled by conditional rendering in `App.tsx` and by one gesture-driven navigator (with the phone's tab bar around it on build 12+). Pop-ups are native: page sheets (`<Modal presentationStyle="pageSheet">`) for comments, tags, notifications, requests, blocked users and friends; `ActionSheetIOS` for menus (profile menu, report reasons).

### The swipe pages

One row, sideways only, in the tab bar's order (founder, 2026-10-05, decisions #60–#64). No up/down
page swiping; the Camera's pull-down for search is gone with it.

```
     swipe right ←                                              → swipe left
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ CameraScreen │  FeedScreen  │ ProfileScreen│MessagesScreen│
│  (index 0,   │  (index 1)   │  (index 2)   │  (index 3)   │
│   on entry)  │              │              │              │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

The order is `SWIPE_PAGES` in `src/lib/nativeTabs.ts` (= the tab bar's `NATIVE_TABS`, tested).

The swipe runs on **react-native-gesture-handler + reanimated** (UI thread): one manually-activated `Gesture.Pan`, whose every decision comes from the pure worklet rules in `src/lib/swipeRules.ts` (tested in `swipeRules.test.ts`):
- `horizontalSwipe` — the finger must move 20px (`SLOP`) mostly sideways; an up/down move fails it and is left to the lists. Touches that start in the phone's own strips (status bar, home bar, and the 24px side edges) are left to the phone. `blocked` (a pop-up is open) fails it.
- `exclude` — a swipe never starts inside the nav rail's rectangle (left edge); the rail owns those touches. The 24px left edge strip stays the phone's, beside the rail too.
- `horizontalRelease` / `rubberBand` — where a release lands (60px or 0.4 velocity) and the rubber band at the ends.
- `atListTop` — the Feed header shows only at the top of the list.

**Gesture relations (the rule that makes swipes work):** a vertical list starts tracking after ~10pt of movement in any direction, before the page swipe decides at 20pt; unless the swipe may run alongside the list, the list wins and sideways swipes on it do nothing. So `HorizontalNavigator` makes a `Gesture.Native()` for each page that is one scrolling list — `feedList`, `profileList`, `messagesList` — passes each to its screen (`listGesture`), and the pan is `.simultaneousWithExternalGesture(feedList, profileList, messagesList)`. A list lends its scrolling through `ListGestureContext` + `GestureScrollView` (`src/components/GestureScrollView.tsx`, the FlashList `renderScrollComponent`), shared by the Feed, Messages, both profile pages and the post viewer. `UserProfileScreen`'s swipe back and `PostViewer`'s sideways close run alongside their own list the same way.

**Hold to view** (2026-10-02, owner: "native hold to preview"): `PostCard`'s press and hold (`Gesture.LongPress`, `POST_CARD.holdMs`) runs alongside its double tap and alongside the list (it reads the list's gesture from `ListGestureContext`), so a finger that moves first is a scroll or a page swipe and the hold never starts; once held, the list can still scroll. Held: a light haptic, and `chromeStore.viewing` fades out (`useChromeFade`) the name and caption, the tags and points row, the like / comment column and the post viewer's ✕; release brings them back. The small photo stays and stays draggable (its own gesture, on top); a double tap still likes. The page swipes that started under a hold wait for the finger to lift.

**Pinch to zoom** (flag `pinch-zoom`, 2026-10-05): `PostCard`'s photo also takes a `Gesture.Pinch` (with the double tap and the hold, alongside the list). Two fingers zoom around the point between them (`pinchOffset` in `src/lib/viewer.ts`, up to `VIEWER.pinchMax`); letting go springs back. While pinching, `chromeStore.zooming` holds the Feed and post-viewer lists still and blocks the page swipe (which also fails on a second finger), and `viewing` fades everything over the post.

**Hold to preview** (flag `context-menu-preview`, default off, iPhone + build 11): `PreviewMenu` (`src/components/PreviewMenu.tsx`) hosts the held content in a SwiftUI `Host` → `ContextMenu` → `RNHostView`, so Apple's own context-menu hold (a `UIContextMenuInteraction`, not a gesture-handler gesture) lifts a `Preview` with menu `Items`. Used by profile grid squares, Messages rows and `PostCard` (where it replaces the `Gesture.LongPress` above: with the flag on `postGesture` is the double tap alone). Nothing in the gesture relations changes: the hosted RN content keeps its gestures (double tap, taps) because the surface's touch handler still dispatches into it; the system hold fails as soon as the finger moves, so list scrolling and the page swipes win a moving finger, and once the menu is up the system takes the touch. The draggable small photo and the like / comment column sit outside the held area. `@expo/ui` is required lazily (`src/lib/expoUiModule.ts`) so build 10 never loads it. One `Host` per mounted cell (FlashList recycles them: about a screenful), because a context menu must belong to the view that is held; the preview's content mounts only while it shows (`onAppear` / `onDisappear`), so no second picture is decoded per cell.

Spring: `damping: 22, stiffness: 160, mass: 0.9` (Reduce Motion ignored on purpose). Light haptic on a page change. Pages are sized from `usePageSize()` (`src/hooks/useChrome.ts`): the live window, or with the phone's tab bar the space above it — so each page, and each Feed post, is one page tall.

### Horizontal Navigator (`src/screens/HorizontalNavigator.tsx`)

The swipe pages above, plus what they share: an `AppHeader` on the Camera and on the Feed (the Feed's slides off-screen by `headerAnim` as the list scrolls down), `NotificationsScreen`, a `UserProfileScreen` opened from notifications or a push, `GlobalSearchOverlay` (the empty feed's "Find friends"; Messages has its own magnifier), the `NavRail`, and the push hooks `usePushRegistration` and `usePushRouting` ([Push notifications](#push-notifications)). Messages' back button goes to Profile.

| Index | Page | Also reached by |
|---|---|---|
| 0 | `CameraScreen` | Entry page; the tab bar / rail |
| 1 | `FeedScreen` | The tab bar / rail |
| 2 | `ProfileScreen` | The tab bar / rail; the header pill when neither shows |
| 3 | `MessagesScreen` | The tab bar / rail; the header icon when neither shows; a message push |

**Global Search:** `GlobalSearchOverlay` — a frosted-glass overlay (`BlurView`). It searches with `searchProfiles()`; tapping a result opens `UserProfileScreen` over it, from which Message opens `ConversationScreen`. Tapping your own profile is a no-op. All state resets when the overlay closes. Opened from the empty feed's "Find friends"; whether the header gets a search button is open (#64).

### The phone's tab bar (`src/screens/TabsNavigator.tsx`) — build 12+, no switch

On builds with react-native-screens (build 12+; `loadScreens()` probes first, so build 10 never loads it) `App.tsx` renders `TabsNavigator` instead of `HorizontalNavigator` alone: the phone's own tab bar at the bottom (Apple's on iPhone, Material's on Android) — Camera, Feed, Profile, Messages — with `HorizontalNavigator` filling the screen above it. The bar's own tab pages are empty; they only measure the room the bar takes. A tap on a tab moves the swipe pages there (`movesPages`); a swipe moves the bar's highlight (`onTabChange`). The pages always end above the bar and never resize (the Feed would jump), so the bar stays visible under profiles, search and settings; it hides only under the post preview. Inside the pages `TabBarRoomContext` is 0 and `PageSizeContext` is the space above the bar. With the tab bar there is no glass rail and no header pills.

### Nav Rail (`src/components/NavRail.tsx`) — flags `nav-glass-rail`, `nav-rail-morph`; builds without the tab bar

A floating glass rail on the **left** edge of the **Camera only** (owner, 2026-10-02: "the tab bar should only be seen on the camera screen, not others"), inside the safe area and vertically centred, with four icons: Camera, Feed, Messages, Profile (`expo-glass-effect` where available, `BlurView` otherwise). With the flag on, the header's Profile/Messages pills are hidden on every screen; the other pages are left by swiping (Messages also has its back button).
- Where it shows is one rule: `railShows` in `src/lib/railSelector.ts` (tested), read by `HorizontalNavigator`: the flag is on, the Camera is the screen showing, and no pop-up or full-screen view is open over it (someone's profile, search — `useCoverRail`, `chromeStore.covers`).
- Nothing on the Camera's left sits under it: `useRailRoom()` (`src/hooks/useChrome.ts`) is the room it takes, used by the camera's photo-in-photo guide. No other screen keeps room for it.
- `nav-rail-morph` on: the rail reads as one floating pill with an outline and shadow (`NAV_RAIL` tokens); one selector slides and stretches between icons (stretch, then contract; a plain move with Reduce Motion); press and hold or drag along the rail to switch screens live. Geometry and motion plans are pure in `src/lib/railSelector.ts` (tested).
- A touch that starts on the rail never moves the pages (`exclude` in `swipeRules`).
- Off: the header pills.

### App Header (`src/components/AppHeader.tsx`)

Top bar placed from the safe area, `pointerEvents: 'box-none'` so touches pass through. `LinearGradient` background from opaque to clear (dark on Camera/dark mode, white in light mode, from tokens). Shows the MAHI wordmark, the notifications bell (flag `notifications-core`), and the Profile/Messages pills only when the rail is off (`showNavPills`).

## Screens

| Screen | Path | Status |
|---|---|---|
| `SplashScreen` | `src/screens/SplashScreen.tsx` | Custom JS splash with the version line |
| `WelcomeScreen` | `src/screens/WelcomeScreen.tsx` | Log in (`LoginSheet`, with "Forgot password?" → `ForgotPasswordSheet`) / Create account (`CreateAccountSheet`; code typed in `OtpCodeInput`, autofill from email). Apple/Google pills are placeholders |
| `InAppAnimationScreen` | `src/screens/InAppAnimationScreen.tsx` | Post-login entry animation |
| `HorizontalNavigator` / `TabsNavigator` | `src/screens/` | Swipe pages and the phone's tab bar (above) |
| `CameraScreen` | `src/screens/CameraScreen.tsx` | **Two-tap** dual-camera capture. `CaptureState` (`src/lib/captureGuide.ts`): `idle → capturing-first → switching → awaiting-second → capturing-second`. With `camera-pip-guide`, `CapturePipGuide` shows what comes second, then the first photo, in the photo-in-photo spot. Then `DualPhotoPreview` (Modal: big photo + draggable pip, tap to swap), caption, tag sheet (page sheet; `InviteStep` when friends can't fill the slots), Post → `InviteShareSheet` when invites were used. Also `OpenTagsBanner` (who tagged you and the time left to answer) and the reactive-posting gate: a spinner while it loads, "No tags to answer" when closed. Flash button (off → on → auto, kept for the app session; the selfie side lights the screen) and photo quality (`src/lib/cameraCapture.ts`). With `camera-tap-focus` (build 11+, iPhone): one tap focuses and exposes there (`FocusSquare`, native `focusAt` from `patches/expo-camera.patch`); two taps still flip. Haptics come from `haptic(moment)` in `src/lib/haptics.ts`. No microphone |
| `FeedScreen` | `src/screens/FeedScreen.tsx` | Feed from `useFeed()` (`get_feed`), FlashList; `FeedLockBanner` (flag `feed-lock-explainer`) on top; locked posts say "Answer a tag to see it", with a button only when you can post; each post is a `PostCard` (`src/components/PostCard.tsx`; dual-photo posts use `DraggablePip`); comments in `CommentSheet`, a native page sheet (with `comment-likes`: a heart and count per comment, read fresh on each opening and shown once they arrive; the count opens `CommentLikersSheet`, a page sheet of who liked it — loading, then the live list, nothing kept); avatar → `UserProfileScreen` |
| `ProfileScreen` | `src/screens/ProfileScreen.tsx` | Own profile as one scrolling list (`ProfileMediaMap`: the header — settings, theme, avatar, stats, "Suggested for you" folded away by default — scrolls away, then the 3-column grid with "N points" badges; pull to refresh). Avatar (`AvatarPicker`: "+" changes it, a tap opens `AvatarViewer`), `FollowListModal` page sheet, `PostViewer`, `SettingsPanel` (Blocked users, Delete account, Help = the welcome cards again, Log out; no rows without an action) |
| `UserProfileScreen` | `src/screens/UserProfileScreen.tsx` | Another person's profile, opened over Feed, search, notifications, messages, friends lists; one scrolling list like your own (back and menu scroll away with the header); swipe right to close — it follows the finger and slides away like a page swipe (`backSwipeX` / `backSwipeCloses` in `swipeRules`, reanimated on the UI thread); tap the photo → `AvatarViewer`; tap a post → `PostViewer`; menu and report reasons via `ActionSheetIOS`; Message (spinner while the chat opens) |
| `PostViewer` | `src/components/PostViewer.tsx` | A tapped grid post, full screen, in a Modal: up/down pages through all of that profile's posts (only those the grid opens — the feed lock's rule, `openablePosts` in `src/lib/viewer.ts`), each drawn by `PostCard` (videos play on screen); a swipe left or right closes (`swipeCloses`), as do ✕ and back. Owner, 2026-10-02 |
| `AvatarViewer` | `src/components/AvatarViewer.tsx` | A profile picture as a circle (`avatarCircleSize`, `VIEWER.avatarShare` of the short side): pinch or double tap to zoom (`clampZoom`, `clampPan`); a tap on the dark space (`avatarTapCloses`), a drag away in any direction, ✕ or back closes it |
| `MessagesScreen` | `src/screens/MessagesScreen.tsx` | Inbox from `useMessages()`; requests open `MessageRequestsScreen` (page sheet; Deny asks first) |
| `ConversationScreen` | `src/screens/ConversationScreen.tsx` | Thread; real-time via `useConversation`; request banner (Accept / Deny with confirm) |
| `NotificationsScreen` | `src/screens/NotificationsScreen.tsx` | Activity list (page sheet); each row's words come from `notificationText()` and match the push for the same thing (a tag: "You've been tagged by @x. 48 hours to post your Mahi!"; `streak_lost`: "You missed @x's tag. Your points are back to 0.") |

App-level overlays in `App.tsx`: `WelcomeCards` (flag `onboarding-welcome-cards` — one-time 3-card carousel in a Modal, once per account per device, and again from Settings → Help; rules in `src/lib/welcomeCards.ts`), `PushPrimer` (flag `push-core` — the one-time "turn on notifications" page, after the cards; see [Push notifications](#push-notifications)), `UpdateRequiredScreen` (forced-update gate), `ToastHost`.

---

## Mahi points

Mahi points are a number, not a calendar (reactive posting, above): profiles show Points and Best;
posts and the profile grid show "N points" (hidden at 0); the camera's top-right corner counts your
points; the tag list and search show "N points" (`PointsBadge`, no flame — points are not a streak).
Earning a point is the `pointsUp` haptic. The old daily streak's calendar, rest days and training
days (`StreakGridPanel`, `RestDaysStreakPanel`, `StreakCalendar`, `src/lib/streakGrid.ts`,
`fitness_routine`, `streak_logs`, `record_upload_streak`) belonged to the old daily rule and are
deleted; `20261001170000_drop_rest_days` removes the last columns and table from the database.

---

## Caption + Tagging

Users attach an optional caption and must fill the post's tag slots (3, `tagStore.maxTags` from `app_config`) with friends or invite links. The flow lives inside the `DualPhotoPreview` modal in `CameraScreen.tsx` and renders in `FeedScreen.tsx`.

### Preview UI (`DualPhotoPreview`)

Above the Post button sits one row of glass pills: tag (`tagPillLabel` — `'＋ Tag people'`, `'@username'`, `'@user1 +N'`), caption (`'＋ Add a caption'`), and location. The Post button reads `Tag N more` until every slot is filled (tapping it then opens the tag sheet with a warning haptic), then `Post`. The draggable pip may paint over the pill row.

### Sheet state machine

`DualPhotoPreview` holds two pieces of state that coordinate the sheets:

```ts
type ActiveSheet = 'none' | 'caption' | 'tag';
const [activeSheet, setActiveSheet] = useState<ActiveSheet>('none');
const [captionAtIndex, setCaptionAtIndex] = useState<number | null>(null);
```

Only one sheet renders at a time (their `visible` props derive from `activeSheet`). Transitions:

| From | Trigger | To | Side effect |
|---|---|---|---|
| `'none'` | tap caption pill | `'caption'` | — |
| `'none'` | tap tag pill | `'tag'` | `captionAtIndex = null` |
| `'caption'` | user types `@` | `'tag'` | `onCaptionChange(currentText)` + `captionAtIndex = cursor-1` |
| `'caption'` | DONE / scrim / back | `'none'` | `onCaptionChange(draft.trim())` |
| `'tag'` | DONE | `'none'` | `onTaggedUsersChange(selected)` |
| `'tag'` | ✕ / scrim / back (pill flow) | `'none'` | — |
| `'tag'` | user tapped (singleShot, `@` flow) | `'caption'` | splice `@username ` at `captionAtIndex+1` into caption; append picked user to `taggedUsers` (deduped, capped at `maxTags`) |
| `'tag'` | ✕ / scrim / back (`@` flow) | `'caption'` | leave the typed `@` in place |

### `CaptionSheet` (`@` bridge)

Extends the simple `CaptionSheet` from the caption feature with one extra prop, `onOpenTagAt?: (atIndex, currentText) => void`. Inside, the `TextInput` now tracks the current caret via `onSelectionChange` into a `cursorRef: useRef<number>`, and `handleChangeText` detects a freshly-typed `@` at the cursor position. When detected, it fires `onOpenTagAt(cursor-1, next)` and early-returns without updating local `draft` state — the parent commits the text (including the `@`) and swaps the active sheet to `'tag'`.

### `TagSheet`

Defined in `CameraScreen.tsx`; a native page sheet (`presentationStyle="pageSheet"` — swipe down or ✕ cancels).

- **Who can be tagged:** friends who follow back, from `getTaggableFriends` (`get_taggable_friends`), listed on open and filtered as you type (350ms debounce). Friends with an open tag on you can't be tagged back (founder's no-tag-back rule).
- **Counter** `filled/maxTags`, where filled = friends picked + invite slots. Adding past `maxTags` fires a warning haptic and no-ops.
- **Invite step** (flags `tags-invite-step` + `invite-links`; rules in `src/lib/inviteStep.ts`): when friends can't fill the slots, the sheet leads with `InviteStep` — "Invite N friends to post", a big invite button and a count of slots filled — instead of the search field. After posting, `InviteShareSheet` lists each invite link as sent / not sent with send again (`src/lib/inviteShare.ts`).
- **`singleShot`** (set by the caption `@` bridge): no counter; tapping a friend commits just that one.

### `TaggedBubbleStack` (on-photo overlay)

Shared component at `src/components/TaggedBubbleStack.tsx`. Renders a vertical stack of `@username` bubbles (`BlurView intensity={40} tint="dark"`, sizes and colours from tokens) — max 3 visible, 4th+ collapses to a `+N more` chip. Returns `null` when `users.length === 0`.

- **Default positioning** is absolute, bottom-left. Uses `pointerEvents="box-none"` so taps outside the bubbles pass through to the photo.
- **Accepts an optional `style` prop** to override the default anchor — used by the camera preview to lift the stack above the pill column (`bubbleStackBottom` is computed from `pillsT` and a 16pt gap).
- **Accepts an optional `onPressUser` prop** — when provided, tapping a bubble fires with the `TaggedUser`. When absent (e.g. in the preview), the `Pressable` is `disabled` and taps fall through.
- **Z-order requirement.** In both the preview and the feed, `TaggedBubbleStack` is rendered **before** the draggable PIP in JSX source order so the PIP paints on top. Dragging the PIP into the bubble region should not hide the PIP — the bubbles yield visually to the user-controlled interactive element.

### Feed display (`FeedScreen`)

Inside each `PostItem`, the `TaggedBubbleStack` is rendered as an absolute overlay inside `styles.imageContainer` (which already has `position: 'relative'`), passed the post's `tagged_users` array plus an `onPressUser` handler that routes through the existing `onAvatarPress(userId)` → `UserProfileScreen` flow.

The caption itself is rendered via the `CaptionText` component (`src/components/CaptionText.tsx`):

- When `tagged.length === 0`, returns a plain `<Text>` — fast path.
- Otherwise builds a regex `@(user1|user2|...)\b` from the tagged users' usernames (defensively regex-escaped), walks the caption with `matchAll`, and emits a mixed array of plain string segments and cyan `<Text>` spans for each `@username` match.
- Each cyan span has its own `onPress` handler firing `onPressUser(user)` for that username — tapping jumps to the user's profile the same way a bubble does.

### Persistence + read path

- `create_post` (`createPost` in `src/api/posts.ts`) stores the caption, the `post_tags` rows, a `tag_challenges` row per tag with its 48-hour deadline, and one invite per invite slot (returned as links), in one transaction. A retry with the same `clientId` returns the same post.
- `get_feed` returns `tagged_users` as an always-present array (`coalesce(..., '[]')`), so `FeedPost.tagged_users` is typed `TaggedUser[]`.

---

## Boot Sequence

```
App launch
  OS renders native splash
  JS bundle loads (Inter faces loaded with useFonts)
  SplashScreen.preventAutoHideAsync()       ← module scope in App.tsx
  App renders → <SplashScreen /> → SplashScreen.hideAsync() → setSplashDone(true)

  getAppGate()                              ← every launch; a failed or slow check never blocks
    → blocked: <UpdateRequiredScreen />

  supabase.auth.onAuthStateChange
    → session found:
        hydrateForUser: getProfile → useUserStore.setProfile(); feed, messages,
          notifications and blocks sync in the background
        posthog.identify + reloadFeatureFlagsAsync
        → <InAppAnimationScreen onComplete → showCamera=true>
        → <TabsNavigator /> on build 12+ (tab bar + swipe pages), else <HorizontalNavigator />
                                   + <WelcomeCards /> (once per account per device)
                                   + <PushPrimer /> (once per device, after the cards; flag push-core)

    → no session:
        every per-user store reset(), posthog.reset()
        → <WelcomeScreen />
```

---

## Config

App config lives in `app.config.js`. Version numbers, build numbers, OTA numbers and the update gate
are handled only through the `/version-control` skill (`.claude/skills/version-control/SKILL.md`).

| Field | Value |
|---|---|
| `version` | `0.1.0` (owner changes it, never by hand in passing) |
| `ios.buildNumber` / `android.versionCode` | Native build number (`10` as of 2026-10-01); moved only by `pnpm release:prepare` |
| `runtimeVersion` | `{ policy: 'appVersion' }` — an OTA reaches the builds of the same version |
| OTA number | `src/constants/ota.ts` (`OTA_NUMBER` + history), bumped by `node scripts/bump-build.cjs --ota`; shown on the version line |
| `ios.associatedDomains` | `applinks:togethermahi.com` (invite links; the domain doesn't serve the app-site-association file yet) |
| `NSMicrophoneUsageDescription` | Still present but unused — the app no longer asks for the mic; remove at the next native build |
| `userInterfaceStyle` | `automatic` |
