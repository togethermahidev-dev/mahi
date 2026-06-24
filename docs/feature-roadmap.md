# Mahi — Feature Roadmap (Batched Build Spec)

This is the build spec for the current feedback round. It is **batched into phases** — do not one-shot.
Each feature is scaffolded against the existing architecture so it drops into the codebase the same way
every other feature does.

**Before building anything**, read these (they are the source of truth this doc builds on):
- [architecture.md → Layering Contract](./architecture.md#layering-contract) — the import rules per layer.
- [adding-a-feature.md](./adding-a-feature.md) — the copy-this-file recipe for any full-stack feature.

**Conventions used in every feature below:**
- **Layers touched** is filled per the contract. "none" means that layer is untouched.
- **Security/Privacy** is mandatory — every DB change names its RLS posture; every native capability names its permission + consent cache.
- **Verify (red→green)** — every feature ships with a flip test: make it fail first (RED), then pass (GREEN). A green never seen red is not trusted.
- **No `process.env`** — read config from `src/lib/env.ts`. **No hardcoded hex** — use `useAppTheme().colors`. **Every new store's `reset()` must be wired into the `App.tsx` sign-out branch.**

> ⚠ **Codebase fact that overrides any tooling suggestion:** this app uses **hand-rolled gesture navigation**
> (`HorizontalNavigator` × `VerticalNavigator`). There is **no `react-navigation`**. Do NOT introduce
> `useFocusEffect`, `@react-navigation/*`, or a router. "Focus" = the navigator's active-index changing.

---

## Phase Overview

| Phase | Theme | DB? | Native? | Risk | Features |
|---|---|---|---|---|---|
| **1** | Discoverability & Navigation | no | no | Low | Unified Rest-Days+Streak panel · Search in Messages · Split Messages row taps · Animated profile-open |
| **2** | Feed & Profile polish + 1 bug | no | no | Low | Like/Comment buttons · Avatar enlarge · Profile older-posts bug |
| **3** | Camera & Media | optional | yes | Med | Pinch-zoom · 0.5× ultra-wide · Landscape |
| **4** | Location | **yes** | **yes** | Med-High | Per-post location + consent cache + RLS |
| **5** | Suggested follows | **yes** | no | Med | `get_suggested_follows` RPC + store + hook + UI |

> Phases 4–5 require a DB migration. They depend on **backlog B1** (initialise `supabase/migrations/` +
> verify RLS) from [the architecture plan]. Do that first so these ship with version-controlled SQL.

---

# Phase 1 — Discoverability & Navigation

Goal: make existing features findable and fix navigation feel. All UI-only, no backend.

## 1.1 — Unified "Rest Days + Streak" panel

**Problem:** *"Ppl struggle to find / don't know to press streak tracker / set rest days — put them on one page, rest days on top, streak tracker underneath."*

**Current behavior:** `TrainingDaysScreen` ([src/components/TrainingDaysScreen.tsx](../src/components/TrainingDaysScreen.tsx#L35-L197)) and `StreakGridPanel` ([src/components/StreakGridPanel.tsx](../src/components/StreakGridPanel.tsx#L92-L381)) are two separate left-slide panels opened by two separate pills on `ProfileScreen` ([src/screens/ProfileScreen.tsx:84-90](../src/screens/ProfileScreen.tsx#L84-L90) and [:131-137](../src/screens/ProfileScreen.tsx#L131-L137)), gated by two booleans ([:21-22](../src/screens/ProfileScreen.tsx#L21-L22)). Both use identical spring params (`damping:22, stiffness:160, mass:0.9`).

**Approach:** new `src/components/RestDaysStreakPanel.tsx` = one slide-in panel with a vertical `ScrollView`: rest-day toggles (top) → streak grid (bottom). Lift the two existing UIs into two sections of one panel; keep the slide/spring/backdrop. Collapse `ProfileScreen`'s two booleans into one `restDaysStreakOpen`. Add a small chevron/“▲” affordance on the entry pill so it reads as openable.

**Layers touched** — DB: none · API: none · Store: none · Hook: none · UI: new `RestDaysStreakPanel.tsx`; edit `ProfileScreen.tsx` (state + render + pill affordance).

**Security/Privacy:** none.

**Risks:** the streak grid's Reanimated **pan gesture** ([StreakGridPanel.tsx:217-227](../src/components/StreakGridPanel.tsx#L217-L227)) must not fight the outer `ScrollView`. Mitigation: keep the grid at a fixed height (no inner pan) inside the scroll, **or** gate the scroll with `scrollEnabled` while the grid pan is active via `simultaneousHandlers`.

**Verify (red→green):** RED — open the panel, confirm you currently must close one to see the other. GREEN — after merge, one open gesture shows rest-day toggles and the streak grid is reachable by scrolling; saving rest days still calls `updateFitnessRoutine` and the streak grid still renders post history.

**Effort:** M.

**Open decisions:** (a) keep both pills (both open the same panel) or one merged pill? (b) does panel Close auto-save rest days, or keep an explicit Save? **Recommend:** one merged pill labelled "REST DAYS & STREAK ▲"; explicit Save for rest days, Close for the panel.

## 1.2 — Search for users from the Messages page

**Problem:** *"People don't know where to search for users — add it to messages."* (stated twice)

**Current behavior:** search lives **only** behind a pull-down gesture on `CameraScreen` → `GlobalSearchOverlay` ([mounted VerticalNavigator.tsx:318-322](../src/screens/VerticalNavigator.tsx#L318-L322), opens on `dy>80`). The overlay already does `searchProfiles()` and opens `UserProfileScreen`, and **already filters blocked users** ([GlobalSearchOverlay.tsx:141-143](../src/components/GlobalSearchOverlay.tsx#L141-L143)).

**Approach:** add a search entry point (a header search pill/icon) to `MessagesScreen` that mounts the **existing** `GlobalSearchOverlay` — reuse, don't rebuild. No new search logic.

**Layers touched** — DB/API/Store/Hook: none (reuses `searchProfiles`) · UI: edit `MessagesScreen.tsx` (header search trigger + mount `GlobalSearchOverlay`).

**Security/Privacy:** unchanged — reuses the block-filtered `searchProfiles`.

**Risks:** `GlobalSearchOverlay` was styled for the navigator overlay context; check z-index/insets when mounted from Messages.

**Verify (red→green):** RED — on Messages there is no way to search users. GREEN — tapping the new search affordance opens the overlay, typing a handle returns profiles, tapping one opens their profile; a blocked user does not appear.

**Effort:** S. **Open decision:** persistent header search bar vs icon-that-opens-overlay. **Recommend:** icon that opens the existing overlay (smallest change, consistent behavior).

## 1.3 — Split Messages row taps (avatar → profile, body → conversation)

**Problem:** *"In messages, tap their icon to open their profile, and tap the message itself to open the conversation."*

**Current behavior:** `ConvoRow` ([MessagesScreen.tsx:28-75](../src/screens/MessagesScreen.tsx#L28-L75)) wraps the **whole** row in one `TouchableOpacity` ([:50-74](../src/screens/MessagesScreen.tsx#L50-L74)) whose `onPress` opens the conversation. Avatar is not independently tappable.

**Approach:** split the touch targets — wrap the avatar in its own `TouchableOpacity` → opens `UserProfileScreen` (same overlay pattern used by FeedScreen/GlobalSearchOverlay); keep the rest of the row → opens `ConversationScreen`. Give each adequate `hitSlop`.

**Layers touched** — DB/API/Store/Hook: none · UI: refactor `ConvoRow` in `MessagesScreen.tsx`; add a `profileUserId` overlay state (mirror FeedScreen's local overlay state).

**Security/Privacy:** unchanged.

**Risks:** overlapping/dead touch zones — lay out avatar vs body as siblings, not nested pressables.

**Verify (red→green):** RED — tapping the avatar today opens the conversation (not the profile). GREEN — avatar tap opens the profile overlay; tapping name/preview/time opens the conversation; no dead zone between them.

**Effort:** M. **Open decision:** does avatar-tap open the full `UserProfileScreen` overlay (recommended, consistent) or a lightweight card?

## 1.4 — Animated profile-open from a notification (and unify overlay entry animation)

**Problem:** *"In notifications, when you press their icon, the profile should swipe in from the right instead of just appearing."*

**Current behavior:** notification avatar tap → `onOpenProfile(actor_id)` ([NotificationsScreen.tsx:114-118](../src/screens/NotificationsScreen.tsx#L114-L118)) → `setProfileUserId` ([VerticalNavigator.tsx:290-293](../src/screens/VerticalNavigator.tsx#L290-L293)) → `UserProfileScreen` renders **instantly** at `zIndex 510` with no entry animation. FeedScreen and GlobalSearchOverlay open it the same instant way. The swipe-right spring already exists in `HorizontalNavigator` ([:42-48](../src/screens/HorizontalNavigator.tsx#L42-L48)).

**Approach:** give `UserProfileScreen` a reusable entry animation — an `Animated.Value` translateX from `SCREEN_WIDTH`→0 on mount using the HorizontalNavigator spring params. Apply it to **all** overlay opens (notifications, feed, search) so the motion is consistent, not a one-off.

**Layers touched** — DB/API/Store/Hook: none · UI: add entrance animation to `UserProfileScreen.tsx`; (optional) ensure FeedScreen/GlobalSearchOverlay opens pass through the same component.

**Security/Privacy:** none.

**Risks:** the entrance animation can race the `PanResponder` if a swipe starts mid-animation — call `stopAnimation()` on gesture grant. (Animated is already imported; no new dep.)

**Verify (red→green):** RED — open a profile from a notification; it pops in with no motion. GREEN — it springs in from the right with the same feel as a horizontal page change; starting a swipe mid-animation doesn't jump.

**Effort:** M. **Open decision:** apply to all overlay opens (recommended) or notifications only?

---

# Phase 2 — Feed & Profile polish + 1 bug

## 2.1 — Like/Comment buttons: smaller icons, moved up, bigger hit area

**Problem:** *"Like and Comment too big — slightly smaller and moved up. The touch area struggles to open comments — make the hit area bigger while keeping the icons smaller."*

**Current behavior:** right-side action column on a feed post — Heart ~44px, Comment ~42px, `gap:4`, at `right:12, bottom:100`; comment already has `hitSlop:12` (commit `6dc083d`). Handlers `handleLike`/`handleCommentPress` ([FeedScreen.tsx:261-271](../src/screens/FeedScreen.tsx#L261-L271)); icons in [ScreenIcons.tsx:172-189](../src/components/ScreenIcons.tsx#L172-L189). Comment opens `CommentSheet`.

**Approach:** decouple **icon size** from **hit target**. Shrink icons to ~32px; raise the column (`bottom:100` → ~`140`); wrap each icon in a larger `Pressable` (e.g. 48×48 min target) and/or raise `hitSlop` to ~16–20. Keep the icons visually small while the tappable area grows.

**Layers touched** — DB/API/Store/Hook: none · UI: `FeedScreen.tsx` (`sideActionBtn` styles + column position + Pressable wrapper).

**Security/Privacy:** none.

**Risks:** the enlarged hit area must not overlap the draggable PiP / pills; verify against the PiP corner-snap zones. Don't shrink icons below ~30px (outdoor visibility).

**Verify (red→green):** RED — measure current misses: tapping just outside the comment glyph does nothing. GREEN — the same near-miss taps now open comments; icons are visibly smaller and sit higher; like still toggles.

**Effort:** S. **Open decision:** target icon size (32/30 vs 28/26) and new `bottom` offset (120 vs 140). **Recommend:** 32px icons, `bottom:140`, 48×48 hit target.

## 2.2 — Tap profile picture to enlarge

**Problem:** *"On the profile page, press the profile picture and it enlarges."*

**Current behavior:** the avatar is a plain `Image` with no `onPress` ([AvatarPicker.tsx:248-249](../src/components/AvatarPicker.tsx#L248-L249)); only the "＋" edit button is tappable ([:275-284](../src/components/AvatarPicker.tsx#L275-L284)).

**Approach:** wrap the avatar `Image` in a `TouchableOpacity` that opens a full-screen `Modal` showing the avatar large on a dim scrim; dismiss on tap/close. Keep the "＋" edit affordance separate (don't hijack its tap).

**Layers touched** — DB/API/Store/Hook: none · UI: `AvatarPicker.tsx` (tappable avatar + lightbox Modal).

**Security/Privacy:** read-only on already-visible content — none.

**Risks:** must not collide with the edit "＋" tap; ensure the lightbox is always dismissable.

**Verify (red→green):** RED — tapping the avatar does nothing. GREEN — tapping opens the enlarged avatar; the "＋" still opens the picker; the lightbox dismisses.

**Effort:** S. **Open decision:** fixed-size lightbox vs pinch-zoomable. **Recommend:** fixed full-screen + tap-to-dismiss (smallest correct version).

## 2.3 — BUG: swiping to profile sometimes doesn't show older posts

**Problem:** *"There's a glitch where sometimes swiping to your profile doesn't show older posts."*

**Current behavior / hypothesis:** `ProfileScreen` is **always mounted** in `HorizontalNavigator` ([:94](../src/screens/HorizontalNavigator.tsx#L94)) and never unmounts. `useProfilePosts` ([src/hooks/useProfilePosts.ts:10-12](../src/hooks/useProfilePosts.ts#L10-L12)) calls `sync()` once in a `userId`-keyed `useEffect`; `userId` is constant (own profile), so it runs **once on mount**. If that first sync raced (ran before profile/session was ready and returned empty) or the grid's `loadMore`/`onEndReached` isn't firing, older pages never (re)load.

**Approach (confirm root cause first, then minimal fix):**
1. **Reproduce + confirm** which failure it is (empty-first-sync vs loadMore-not-firing) — add a temporary log of `posts.length / hasMore / isSyncing` on profile focus.
2. **Fix using the existing nav**, NOT react-navigation: have `HorizontalNavigator` pass an `isActive` (or `focused`) prop to `ProfileScreen` when its index becomes the profile panel; `useProfilePosts` re-runs `sync()` (or resumes `loadMore`) when it transitions to active and the store is empty/stale. Review `profilePostsStore.sync()` for a `posts.length>0` skip-guard that prevents recovery after an empty first load.

**Layers touched** — DB: none · API: none · Store: `profilePostsStore.ts` (make `sync()` recoverable after an empty load; optional `reset`-on-resync) · Hook: `useProfilePosts.ts` (re-sync on active) · UI: `HorizontalNavigator.tsx` passes the active signal; `ProfileScreen.tsx` forwards it.

**Security/Privacy:** RLS already scopes posts to the owner — no change.

**Risks:** don't over-fetch on every swipe — only re-sync when the store is empty or stale (e.g. > N seconds). Avoid a sync/loadMore race resetting the cursor mid-page.

**Verify (red→green):** RED — reproduce the empty/partial profile grid (e.g. force the first sync to return empty), confirm older posts never appear on subsequent swipes. GREEN — after the fix, swiping back to profile reliably (re)loads and paginates the full history; the temporary logs show `posts.length` recovering.

**Effort:** S–M (mostly diagnosis). **Open decision:** re-sync on every focus vs only when empty/stale. **Recommend:** only when empty or stale (cheap + fixes the bug).

---

# Phase 3 — Camera & Media

Native capability work. Ship in this order (lowest risk first): **pinch-zoom → 0.5× lens → landscape.**

## 3.1 — Pinch-to-zoom on the photo (preview)

**Problem:** *"Zoom in on photos."*

**Current behavior:** `DualPhotoPreview` ([CameraScreen.tsx:181-506](../src/screens/CameraScreen.tsx#L181-L506)) shows the primary photo with `resizeMode:'cover'` ([:347-351](../src/screens/CameraScreen.tsx#L347-L351)); the PiP already uses RNGH pan+tap ([:271-308](../src/screens/CameraScreen.tsx#L271-L308)). No pinch anywhere.

**Approach:** wrap the primary photo in a `Gesture.Pinch()` (+ optional pan when zoomed) driving Reanimated shared values (`scale`, `transX`, `transY`); double-tap to reset. Reuse the gesture stack already in the file.

**Layers touched** — DB/API/Store/Hook: none · UI: `CameraScreen.tsx` (`DualPhotoPreview` primary image gestures). **Deps:** none (RNGH + Reanimated already present).

**Security/Privacy:** none.

**Risks:** pinch vs the existing PiP drag — compose with `Gesture.Simultaneous`/`Exclusive` so they don't fight; reset zoom when swapping primary/PiP.

**Verify (red→green):** RED — pinching the photo does nothing. GREEN — pinch zooms within bounds, double-tap resets, PiP drag still works.

**Effort:** M. **Open decision:** does zoom reset on PiP-swap? **Recommend:** yes, reset on swap.

## 3.2 — 0.5× ultra-wide lens

**Problem:** *"0.5 photos?"*

**Current behavior:** `<CameraView>` ([CameraScreen.tsx:1089](../src/screens/CameraScreen.tsx#L1089)) only passes `facing`. No zoom/lens props. `expo-camera ~55.0.10` supports `zoom` (0–1) and, on iOS, lens selection.

**Approach:** add `selectedLens` state + small lens toggle (0.5× / 1×) in the camera controls; wire to expo-camera's zoom/lens API. Handle iOS (lens types) vs Android (zoom factor) differences behind one helper.

**Layers touched** — UI: `CameraScreen.tsx` (lens state + control + `CameraView` prop). · **DB/API/Store: OPTIONAL** — only if you want to *persist & display* which lens a post used (add `posts.lens` text column + thread through `createPost`/`FeedPost`). **Recommend: skip persistence for v1** — it's pure capture config. · **Deps:** none.

**Security/Privacy:** none.

**Risks:** iOS/Android API divergence; ultra-wide distorts faces — default to 1×.

**Verify (red→green):** RED — no way to pick 0.5×; capture is always wide. GREEN — toggling 0.5× visibly widens the FoV and the captured photo reflects it on both platforms (or is gracefully hidden where unsupported).

**Effort:** M. **Open decision:** per-facing lens (0.5× back only) vs global; persist lens or not. **Recommend:** back-camera only, no persistence.

## 3.3 — Landscape photos

**Problem:** *"Landscape photos?"*

**Current behavior:** orientation locked portrait ([app.config.js:8](../app.config.js)). Capture pipeline `takePhoto()` ([CameraScreen.tsx:816-828](../src/screens/CameraScreen.tsx#L816-L828)) bakes EXIF orientation via `manipulateAsync`. PiP clamp math ([:209](../src/screens/CameraScreen.tsx#L209)) assumes portrait height.

**Approach:** allow landscape capture by tracking device orientation (RN `Dimensions`/`useWindowDimensions`, or `expo-screen-orientation` if a manual lock is needed) and making the PiP clamp + pill layout responsive to aspect ratio. **This is the heaviest media item** — the preview/PiP/feed all assume portrait.

**Layers touched** — Config: `app.config.js` orientation · UI: `CameraScreen.tsx` (orientation tracking + responsive PiP/pill math); verify `FeedScreen` renders non-portrait aspect ratios. · **Deps:** `expo-screen-orientation` *only if* manual locking is required.

**Security/Privacy:** none.

**Risks:** PiP math, pill spacing, and the 16:9 feed rendering all assume portrait — landscape touches several layout assumptions. Scope carefully; consider shipping after 3.1/3.2.

**Verify (red→green):** RED — rotating the device doesn't change capture; a landscape shot renders wrong in preview/feed. GREEN — a landscape capture previews and posts correctly, PiP stays in-bounds, and the feed renders the wider aspect without clipping.

**Effort:** M–L. **Open decision:** allow mixed portrait+landscape or force one? **Recommend:** allow both, but ship last in the phase.

---

# Phase 4 — Location (new full-stack, privacy-sensitive)

> **Depends on backlog B1** (migrations + RLS in repo). Build the DB change as a committed migration.

## 4.1 — Per-post location with consent cache

**Problem:** *"Add location? Native permission request on onboarding or when needed, local cache to remember the user's decision."*

**Current behavior:** posts created in `CameraScreen` `createPost()` ([:959-966](../src/screens/CameraScreen.tsx#L959-L966)) → `posts` table ([database.ts:314-350](../src/types/database.ts#L314-L350)) which has **no location columns**. Permission pattern to mirror: `useCameraPermissions` ([CameraScreen.tsx:764-765](../src/screens/CameraScreen.tsx#L764-L765)). Consent-cache pattern to mirror: `src/lib/otp.ts` (AsyncStorage). There is already a media map (`ProfileMediaMap` / `ProfileMediaMapModal`) location can feed.

**Approach (full-stack, follow [adding-a-feature.md](./adding-a-feature.md)):**
1. **DB (migration):** add `posts.latitude float8 null`, `posts.longitude float8 null` (nullable — posts without location stay valid). Update `get_feed_posts` only if location is shown in feed.
2. **Native + consent:** add `expo-location` + the iOS `NSLocationWhenInUseUsageDescription` plist string in `app.config.js`. New `src/lib/location.ts` (mirror `otp.ts`): `requestLocationPermission()`, `getCurrentLocation()`, and an AsyncStorage **consent cache** so the user is asked once (on first post attempt that uses location, not forced at onboarding).
3. **API:** extend `createPost(opts)` in `src/api/posts.ts` with optional `latitude?/longitude?`; thread into the insert.
4. **UI:** in `CameraScreen` post flow, if consent granted, attach coordinates; expose a per-post location toggle.

**Layers touched** — DB: `posts` (+2 cols, RLS unchanged but **review read exposure**) · lib: new `src/lib/location.ts` (consent cache) · API: `posts.ts createPost` · Store: none (consent in AsyncStorage) · UI: `CameraScreen` toggle; optionally surface on `ProfileMediaMap`. · **Deps:** `expo-location`.

**Security/Privacy (mandatory):** location is **per-post and inherits the post's public read RLS** — anyone who can see the post can see its coordinates. So: (a) **explicit opt-in per post**, never silent; (b) cache the consent decision locally; (c) consider rounding/truncating coordinates (e.g. ~city block) to avoid exact-home exposure; (d) document this in `RULES.md`. Do **not** request location at onboarding by default — request on first use.

**Risks:** GPS accuracy varies (omit if accuracy > ~100m); battery (one-shot fix, not watch); privacy backlash if location is on-by-default.

**Verify (red→green):** RED — deny permission → posting must still succeed with `latitude/longitude = null` and no crash; the consent prompt must appear only once (cache works). GREEN — grant permission → a post stores coordinates and renders on the map; revoking the OS permission later degrades gracefully to null.

**Effort:** M. **Open decisions:** always-on vs per-post (**recommend per-post opt-in**); coordinate precision/rounding; show in feed or only on the profile map.

---

# Phase 5 — Suggested follows (new full-stack)

> **Depends on backlog B1** (migrations + RLS). The RPC must be a committed migration.

## 5.1 — `get_suggested_follows` RPC + store + hook + UI

**Problem:** *"Suggested follow users?"*

**Current behavior:** none. The follow graph (`follows` table) + `get_follow_data` RPC ([follows.ts:78-94](../src/api/follows.ts#L78-L94)) and block set ([blockStore.ts:12-46](../src/store/blockStore.ts#L12-L46)) already exist as the building blocks.

**Approach (full-stack, copy the follow templates):**
1. **DB (migration):** `SECURITY DEFINER` RPC `get_suggested_follows(p_current_user_id uuid, p_limit int, p_offset int)` returning profile rows. Logic: **follow-of-follows** ranked by mutual count, **excluding** self, already-followed, and blocked (both directions). Optional fallback to "popular users" when the user has < 3 connections. Must be set-based SQL (self-joins on `follows`), not row-by-row — check the query plan for N+1.
2. **API:** add `SuggestedUser` type + `getSuggestedFollows()` to `src/api/follows.ts` (mirror `getFollowData`: `supabase.rpc(...)`, wrap errors).
3. **Store:** new `src/store/suggestStore.ts` — copy `followStore.ts` (optimistic toggle + `reset()`). **Wire `reset()` into `App.tsx` sign-out.**
4. **Hook:** new `src/hooks/useSuggestedFollows.ts` — copy `useFeed.ts` (thin; sync on mount).
5. **UI:** new `SuggestedFollowsStrip.tsx` (horizontal `FlashList`), render below the follow counts on `UserProfileScreen` / `ProfileScreen`.

**Layers touched** — DB: new RPC · API: `follows.ts` · Store: new `suggestStore.ts` (+ sign-out reset) · Hook: new `useSuggestedFollows.ts` · UI: new `SuggestedFollowsStrip.tsx`. · **Deps:** none.

**Security/Privacy:** `SECURITY DEFINER` lets the RPC read the follow graph + `user_blocks` safely; it must **exclude blocked users in both directions** and never leak private data — return only public profile fields (id, username, display_name, avatar_url). The RPC owns authorization since it runs definer-rights.

**Risks:** N+1 / bad query plan if not set-based; privacy leak if block exclusion is missed; empty results for new users (use the popularity fallback).

**Verify (red→green):** RED — call the RPC for a user who follows someone you've blocked / already follow / yourself → assert those IDs are **absent** from suggestions (a naive implementation returns them). GREEN — suggestions exclude self/followed/blocked, are ranked by mutual count, and a new user with no connections still gets the popularity fallback. Then the usual optimistic-follow + sign-out-no-leak checks from the recipe.

**Effort:** M. **Open decisions:** popularity fallback threshold; cache suggestions vs refetch per profile view (**recommend cache in-store, refresh on pull**).

---

## Cross-phase reference map

| Need | Copy / reference |
|---|---|
| Optimistic store + realtime | `src/store/followStore.ts` |
| API fn shape `{data,error}` | `src/api/follows.ts` |
| Thin hook (sync on mount) | `src/hooks/useFeed.ts` |
| Thin hook (subscription) | `src/hooks/useNotifications.ts` |
| Slide-in panel + spring | `src/components/StreakGridPanel.tsx` / `TrainingDaysScreen.tsx` (`damping:22, stiffness:160, mass:0.9`) |
| Swipe page spring | `src/screens/HorizontalNavigator.tsx:42-48` |
| Reusable search overlay | `src/components/GlobalSearchOverlay.tsx` (already block-filtered) |
| Profile overlay open pattern | `src/screens/FeedScreen.tsx` avatar→`UserProfileScreen` |
| AsyncStorage consent cache | `src/lib/otp.ts` |
| Env access | `src/lib/env.ts` (never `process.env`) |
| Theme colors | `useAppTheme().colors` (never hardcoded hex) |
| Sign-out reset wiring | `App.tsx` sign-out `else` block |
