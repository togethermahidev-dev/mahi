# Mahi Fitness — Architecture

## Overview

Mahi Fitness is a React Native fitness application built with Expo (iPhone first). Users post a two-photo workout from the Camera screen only to answer a friend's tag (reactive posting, below — the first post is the exception), and every post tags 3 friends, who have 48 hours to answer. Each answer adds one to your streak; the friends-only Feed opens for 24 hours after each post (the tag loop — [tag-loop-plan.md](./tag-loop-plan.md), [decisions.md](./decisions.md)). The app has messaging (inbox + requests), notifications, and profiles with streak stats.

## Reactive posting

The posting rule since 2026-10-01 ([decisions.md](./decisions.md#reactive-posting-2026-10-01) #1, #10, #27–#30):

- **Reactive posting** — you post only when a friend has tagged you and you can still answer (48 hours,
  `app_config.tag_window`, plus 10 minutes `answer_grace`). Your very first post is the one exception. The
  server enforces it: `create_post` checks `public.reactive_posting_open(user)` and raises
  `reactive posting: not tagged` otherwise (migration `20261001120000_reactive_posting.sql`, test
  `supabase/tests/reactive_posting_test.sql`). The app's copy of the rule is `reactivePostingGate()` in
  `src/lib/reactivePosting.ts`, fed by the feed's lock state (`unlockedUntil` is null until the first post) and the open tags: the camera
  shows a spinner while that loads and "No tags to answer" when closed; the server error maps to the same
  toast. There is no daily limit any more: one post per tag answered, as often as you're tagged (the
  migration drops the old one-a-day index).
- **Streak** — each post that answers at least one tag adds 1; `posts.streak_day` holds the streak after the
  post. Miss a tag and the streak goes back to 0 (`break_missed_streaks`, run by the `mark_missed_tags` cron
  and inside `create_post`); the person who missed gets a `streak_lost` notification (actor = the tagger),
  the tagger gets `tag_missed`. `streak_highest` is never lowered. Posts carry the streak as "Streak N"
  (`src/lib/streakText.ts`), hidden at 0. No rest days, training days, weekly calendar or streak calendar.
  Existing users' current streaks restarted at 0; best kept.
- **Feed** — every post opens the feed for 24 hours. Tagged within those 24 hours → it locks when they
  end; not tagged → it stays open until you're tagged, then locks. Miss a tag and it stays locked until
  a friend tags you again (you can't post without a tag); a cancelled tag no longer locks. Wording:
  `src/lib/feedLock.ts`. Backend is Supabase (auth, database, storage, Edge Functions). State is managed with Zustand using an optimistic-UI-first pattern; features sit behind PostHog flags ([feature-flags.md](./feature-flags.md)).

## Video posts

Owner, 2026-10-02 ([decisions.md](./decisions.md#video-posts-2026-10-02) #33–#38). Flag `video-posts`,
**default off** (off while flags load and with no PostHog key; on only when PostHog says true).

- **What it does:** each of a post's two shots (rear = your view, front = selfie) is a photo or a video of
  up to 15 seconds. On the camera a Photo / Video switch sits by the shutter (beside the 1× / 0.5× lens
  toggle); a tap does what the switch says, and pressing and holding the shutter always records until you
  let go, or 15 s. Recording: 720p H.264 at ~3.5 Mbit/s (~7 MB for 15 s), `VIDEO_RECORDING` in
  `src/lib/videoPosts.ts`. Videos play muted and looping while on screen — preview, feed, the small window,
  post detail — with a mute / unmute button (`PostVideo`, `SoundButton` in `src/components/PostVideo.tsx`);
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
| Analytics | PostHog | ^4.74.0 |
| Error Tracking | Sentry | ^8.26.0 |

Versions as in `package.json`; check there before relying on one.

---

## Project Structure

```
mahi-fitness/
├── src/
│   ├── api/            # Supabase query functions (posts, messages, profile, streaks, auth)
│   ├── lib/            # Singleton clients (Supabase, PostHog, Sentry) + pure, unit-tested rules
│   │                   #   (swipeRules, railSelector, feedLock, captureGuide, inviteStep, inviteShare,
│   │                   #    reactivePosting, streakText, welcomeCards, featureFlags, versionGate, …;
│   │                   #    tests in __tests__/)
│   ├── constants/      # tokens.ts (design tokens), fonts.ts (Inter), ota.ts (OTA counter + history)
│   ├── store/          # Zustand global state (feedStore, messagesStore, tagStore, inviteStore, …)
│   ├── hooks/          # Thin store wrappers + utility hooks (useFeed, useOpenTags, useFeatureFlag, …)
│   ├── types/          # TypeScript types — database.ts is the source of truth for DB shapes
│   ├── components/     # Shared UI (AppHeader, NavRail, NavigationDots, WelcomeCards, FeedLockBanner,
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
| `public.profiles` | User profile — display name, avatar, streak counters (current tag streak, best streak) |
| `public.posts` | Workout posts, made under reactive posting (above), each carrying the poster's streak. `image_url` = rear/POV photo; `pov_image_url` = front selfie (nullable — null on legacy single-photo posts). `rear_media_type` / `front_media_type` = `'photo'` or `'video'` per shot (video posts, default `'photo'`). No daily limit: one post per tag answered (the old one-a-day unique index was dropped by `20261001120000_reactive_posting.sql`) |
| `public.post_likes` | One row per user-post like. Unique constraint `(post_id, user_id)`. RLS: authenticated read-all, insert/delete own only. |
| `public.post_comments` | Comments on posts. Ordered oldest-first. RLS: authenticated read-all, insert/delete own only. |
| `public.follows` | Follow relationships. Unique constraint `(follower_id, following_id)`, self-follow check constraint. RLS: authenticated read-all, insert/delete own only (`auth.uid() = follower_id`). Explicit UPDATE deny policy. |
| `public.post_tags` | User-tag junction table: which users were mentioned on which post. Composite PK `(post_id, user_id)`. RLS: authenticated read-all, insert only when the caller owns the referenced post. Aggregated into `tagged_users` by the `get_feed_posts` RPC. |
| `public.conversations` | Messaging thread — one row per pair, ordered participants constraint |
| `public.messages` | Individual messages within a conversation |
| `public.notifications` | Activity feed (likes, comments, follows, tags, tag answered / missed, `streak_lost`, invites) |
| `public.user_blocks` / `public.user_reports` | Moderation |
| `public.tag_challenges` | A tag with its 48-hour deadline (tag loop) |
| `public.point_events` | Mahi points, capped per day |
| `public.invites` | Invite links and 6-character codes |
| `public.push_tokens` / `public.push_outbox` | Push devices and the push queue (sender not deployed yet) |
| `public.conversation_reads` | Unread counts |
| `public.app_config` | One row of numeric rules (tag window, unlock window, caps, `min_app_version`, `invite_links_enabled`) |
| `public.otp_codes` / `public.auth_rate_limits` | Hashed sign-up and reset codes (`purpose` = `signup` / `reset`) and send limits |

All tables use Row Level Security (RLS). Writes for posting and messaging go through one `SECURITY DEFINER` function each: `create_post` (checks reactive posting with `reactive_posting_open`, dates the post, adds to the tag streak, saves tags and deadlines, queues pushes, answers waiting tags) and `send_message`. The feed reads through `get_feed` (server-side lock), profiles through `get_user_posts`. Every migration is in `supabase/migrations/` and live on production as of 2026-10-01 (checked against prod); the old paths (`get_feed_posts`, the public photo bucket, direct message inserts) are retired later by the files in `supabase/deferred/`.

---

## API Layer — `src/api/`

| File | Exports |
|---|---|
| `posts.ts` | `getFeed` (`get_feed` — lock state, `like_count`, `comment_count`, `liked_by_me`, `tagged_users`), `getUserPosts` (`get_user_posts`), `hasEverPosted` (the first post is free), `uploadPostMedia` (photos or videos), `removePostPhotos`, `createPost` (`create_post`, one call with tags, invites, location and — for a video post — media types) |
| `tags.ts` | `getTaggableFriends`, `getOpenTags`, `getTagRules` |
| `invites.ts` | `getInvitePreview`, `claimInvite` |
| `social.ts` | `toggleLike` (single-RPC atomic toggle), `getComments`, `addComment` |
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

The app uses **state-driven navigation** — no React Navigation, no router (don't add one). Transitions are handled by conditional rendering in `App.tsx` and by two gesture-driven navigators. Pop-ups are native: page sheets (`<Modal presentationStyle="pageSheet">`) for comments, tags, notifications, requests, blocked users and friends; `ActionSheetIOS` for menus (profile menu, report reasons).

### 2D Navigation Overview

```
           ← swipe right ←          → swipe left →
┌─────────────────────┬──────────────────────┬──────────────────────┐
│   ProfileScreen     │  VerticalNavigator   │   MessagesScreen     │
│  (horizontal left)  │  (center, default)   │ (horizontal right)   │
│                     │  ↕ swipe up/down ↕   │                      │
│                     │  Camera (index 0)    │                      │
│                     │  FeedScreen (index 1)│                      │
└─────────────────────┴──────────────────────┴──────────────────────┘
```

Both navigators run on **react-native-gesture-handler + reanimated** (UI thread): one manually-activated `Gesture.Pan` each, whose every decision comes from the pure worklet rules in `src/lib/swipeRules.ts` (tested in `swipeRules.test.ts`):
- `horizontalSwipe` / `verticalSwipe` — the finger must move 20px (`SLOP`) mostly along the swipe's own axis; the other axis fails it. Touches that start in the phone's own strips (status bar, home bar, and the 24px side edges for sideways swipes) are left to the phone. `blocked` (a pop-up is open) fails both.
- `exclude` — a sideways swipe never starts inside the nav rail's rectangle; the rail owns those touches.
- `atListTop` — on Feed, a downward swipe back to Camera only starts at the top of the list (`y <= 2`); once the list has scrolled under the finger, the drag stays with the list.
- `horizontalRelease` / `verticalRelease` / `rubberBand` — where a release lands (60px or 0.4 velocity), the rubber band at the ends, and the pull-down from Camera that opens search.

**Gesture relations (the rule that makes swipes work):** the sideways pan, the up/down pan and the Feed list's scrolling (`Gesture.Native()`, made in `HorizontalNavigator` and passed down as `feedList`) must all be allowed to track the same touch. `HorizontalNavigator` passes a ref (`swipeRef`) that `VerticalNavigator`'s pan fills with `.withRef()`; the sideways pan is `.simultaneousWithExternalGesture(feedList, verticalSwipe)` and the up/down pan is `.simultaneousWithExternalGesture(feedList)`. The swipe rules keep them apart by axis (the up/down pan fails at once on a sideways drag). Without this, iOS hands the touch to the inner pan and sideways swipes on Camera or Feed do nothing (fixed 2026-10-01, OTA 10.15 / 10.16 / 10.21).

Spring for both: `damping: 22, stiffness: 160, mass: 0.9` (Reduce Motion ignored on purpose). Light haptic on a page change. Pages are sized from the live window (`useWindowDimensions`), not fixed constants.

### Horizontal Navigator (`src/screens/HorizontalNavigator.tsx`)

| Index | Panel | Access |
|---|---|---|
| 0 | `ProfileScreen` | Swipe right, or the rail's Profile icon (header pill when the rail is off) |
| 1 | `VerticalNavigator` | Default on entry |
| 2 | `MessagesScreen` | Swipe left, or the rail's Messages icon (header icon when the rail is off) |

It also renders the `NavRail` and measures its rectangle for the swipe `exclude`.

### Vertical Navigator (`src/screens/VerticalNavigator.tsx`)

| Index | Screen |
|---|---|
| 0 | `CameraScreen` |
| 1 | `FeedScreen` |

Each page is one window tall. It also owns: the `AppHeader` (slid off-screen by `headerAnim` as the Feed scrolls down), `NotificationsScreen`, a `UserProfileScreen` opened from notifications, `NavigationDots` (only when the rail is off), `GlobalSearchOverlay`, and `usePushRegistration`.

**Global Search:** pulling down on `CameraScreen` opens `GlobalSearchOverlay` — a frosted-glass overlay (`BlurView`). It searches with `searchProfiles()`; tapping a result opens `UserProfileScreen` over it, from which Message opens `ConversationScreen`. Tapping your own profile is a no-op. All state resets when the overlay closes.

`FeedScreen` receives `headerAnim` (an `Animated.Value`, 0–header height, driven by its scroll) and the shared `feedList` gesture for its list.

### Nav Rail (`src/components/NavRail.tsx`) — flags `nav-glass-rail`, `nav-rail-morph`

A floating glass rail on the right edge with four icons: Camera, Feed, Messages, Profile (`expo-glass-effect` where available, `BlurView` otherwise). It replaces the side dots and the header's Profile/Messages pills.
- `nav-rail-morph` on: the rail reads as one floating pill with an outline and shadow (`NAV_RAIL` tokens); one selector slides and stretches between icons (stretch, then contract; a plain move with Reduce Motion); press and hold or drag along the rail to switch screens live. Geometry and motion plans are pure in `src/lib/railSelector.ts` (tested).
- A touch that starts on the rail never moves the pages (`exclude` in `swipeRules`).
- Off: the old dots (`NavigationDots`) and header pills.

### App Header (`src/components/AppHeader.tsx`)

Top bar placed from the safe area, `pointerEvents: 'box-none'` so touches pass through. `LinearGradient` background from opaque to clear (dark on Camera/dark mode, white in light mode, from tokens). Shows the MAHI wordmark, the notifications bell (flag `notifications-core`), and the Profile/Messages pills only when the rail is off (`showNavPills`).

## Screens

| Screen | Path | Status |
|---|---|---|
| `SplashScreen` | `src/screens/SplashScreen.tsx` | Custom JS splash with the version line |
| `WelcomeScreen` | `src/screens/WelcomeScreen.tsx` | Log in (`LoginSheet`, with "Forgot password?" → `ForgotPasswordSheet`) / Create account (`CreateAccountSheet`; code typed in `OtpCodeInput`, autofill from email). Apple/Google pills are placeholders |
| `InAppAnimationScreen` | `src/screens/InAppAnimationScreen.tsx` | Post-login entry animation |
| `HorizontalNavigator` / `VerticalNavigator` | `src/screens/` | Gesture navigation (above) |
| `CameraScreen` | `src/screens/CameraScreen.tsx` | **Two-tap** dual-camera capture. `CaptureState` (`src/lib/captureGuide.ts`): `idle → capturing-first → switching → awaiting-second → capturing-second`. With `camera-pip-guide`, `CapturePipGuide` shows what comes second, then the first photo, in the photo-in-photo spot. Then `DualPhotoPreview` (Modal: big photo + draggable pip, tap to swap), caption, tag sheet (page sheet; `InviteStep` when friends can't fill the slots), Post → `InviteShareSheet` when invites were used. Also `OpenTagsBanner` (who tagged you and the time left to answer) and the reactive-posting gate: a spinner while it loads, "No tags to answer" when closed. No microphone |
| `FeedScreen` | `src/screens/FeedScreen.tsx` | Feed from `useFeed()` (`get_feed`), FlashList; `FeedLockBanner` (flag `feed-lock-explainer`) on top; locked posts say "Answer a tag to see it", with a button only when you can post; dual-photo posts use `DraggablePip`; comments in a native page sheet; avatar → `UserProfileScreen` |
| `ProfileScreen` | `src/screens/ProfileScreen.tsx` | Own profile: stats, avatar (`AvatarPicker`), "Suggested for you" folded away by default, FlashList grid (≥9 squares, "Streak N" badges), `FollowListModal` page sheet, `PostDetailModal`, `SettingsPanel` (Blocked users, Delete account, Help = the welcome cards again, Log out; no rows without an action) |
| `UserProfileScreen` | `src/screens/UserProfileScreen.tsx` | Another person's profile, opened over Feed, search, notifications, messages, friends lists; swipe right (gesture-handler pan) to close; menu and report reasons via `ActionSheetIOS`; Message (spinner while the chat opens) |
| `MessagesScreen` | `src/screens/MessagesScreen.tsx` | Inbox from `useMessages()`; requests open `MessageRequestsScreen` (page sheet; Deny asks first) |
| `ConversationScreen` | `src/screens/ConversationScreen.tsx` | Thread; real-time via `useConversation`; request banner (Accept / Deny with confirm) |
| `NotificationsScreen` | `src/screens/NotificationsScreen.tsx` | Activity list (page sheet); `streak_lost` reads "You missed @x's tag. Your streak is back to 0." |

App-level overlays in `App.tsx`: `WelcomeCards` (flag `onboarding-welcome-cards` — one-time 3-card carousel in a Modal, once per account per device, and again from Settings → Help; rules in `src/lib/welcomeCards.ts`), `UpdateRequiredScreen` (forced-update gate), `ToastHost`.

---

## Streak

The streak is a number, not a calendar (reactive posting, above): profiles show the current tag streak
and the best one; posts show "Streak N" (hidden at 0). The streak calendar, rest days and training
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
        → <HorizontalNavigator />  + <WelcomeCards /> (once per account per device)

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
