# Tag Loop — Implementation Plan

Builds the PRD "Mahi PRD — Tag 3 Friends" (tag 3 friends → 48-hour deadline → points → feed lock).
Phases run in order; each one ships, is verified red→green, and is committed before the next starts.

Read first: [HANDOVER.md](./HANDOVER.md) (rules, goal loop), [architecture.md](./architecture.md#layering-contract)
(layering contract), [adding-a-feature.md](./adding-a-feature.md) (copy-this recipe).

> **Decisions:** [decisions.md](./decisions.md) records every choice, the options not taken, and where
> this plan uses each one. Parked: #1 streak rule and #10 existing streaks (ask before Phase 5),
> #12 success targets (ask before Phase 8). Numeric rules (48 h, 24 h, cap, quiet hours, grace) live
> in one `app_config` row, not in code.

---

## 1. Principles (apply to every phase)

1. **The server decides.** Every rule that touches streaks, tags, points, deadlines, feed access or
   pushes runs inside one `SECURITY DEFINER` Postgres function, in one transaction. The phone only
   renders what the server returns. The client never sends a date, a streak value, a point or a
   deadline.
2. **One write path per action.** Posting = `create_post()`. Messaging = `send_message()`. Direct
   client `INSERT/UPDATE/DELETE` on those tables is revoked once the new path ships.
3. **No races, by construction:**
   - Per-user writes lock the caller's `profiles` row first (`SELECT … FOR UPDATE`), so two taps or
     two devices run one after the other.
   - Every client-initiated write carries a client-generated `client_id uuid` with a `UNIQUE`
     constraint. A retry returns the existing row instead of creating a second one.
   - Invariants are constraints, not checks: one post per user per local day, one open tag per
     tagger→friend pair, one point per (tag, user). A lost race fails on the constraint.
   - Deadlines are stored (`expires_at`) and compared with `now()` at read and write time. No job has
     to run on time for a rule to be correct; jobs only send pushes.
   - Background workers claim rows with `FOR UPDATE SKIP LOCKED`, so two workers never send the same
     push.
4. **Transactional outbox for pushes.** The same transaction that creates a tag also inserts its
   pushes (now, 24 h left, 2 h left) into `push_outbox`. Answering or cancelling the tag deletes
   the unsent ones in that same transaction. A push can never outlive the fact it announces.
5. **Expand, then contract.** Each phase first adds new tables/functions alongside the old ones
   (old app versions keep working). A later "contract" migration revokes the old path only after
   the new app version is out.
6. **Nothing expiring is stored on the phone.** Feed items, signed image URLs and open tags live in
   memory (Zustand, no persistence). Screens show a loading state, then fresh server data.
7. **Zero bloat.** No new server, queue service, or SDK beyond `expo-notifications`. Postgres
   (`pg_cron`, `pg_net`) + one Edge Function for pushes. Reuse existing stores and hooks; extend,
   don't fork.

---

## 2. Current state that the plan fixes

### Live database (checked against prod, 2026-09-17)

- The Supabase MCP, `.mcp.json` and `.env` all point at `pzepodsppqtvptzmwxzs` — the only project on
  the account, region eu-west-2, Postgres 17. It had been paused; the owner restored it the same day.
- Migration history: **31 timestamped migrations** (`20260224124711_create_profiles` …
  `20260625080354_restrict_suggested_follows_to_authenticated`). None of the repo's
  `0001–0006` files are in that history — the repo files are a reconstruction, not the record.
- Extensions: `plpgsql`, `pg_stat_statements`, `uuid-ossp`, `pgcrypto`, `supabase_vault`.
  **`pg_cron` and `pg_net` are not installed** (Phase 1 enables them).
- Triggers that exist live but not in the repo: `notify_on_like`, `notify_on_comment`,
  `notify_on_follow`, `notify_on_tag` (these create in-app notifications), `handle_new_block`,
  `handle_unblock`, `handle_profile_updated_at`, `update_convo_updated_at`.
- `get_feed_posts` returns **every** user's posts (minus blocked both ways and banned users) — no
  follow filter. Confirmed.
- `posts` bucket is public. `notifications.type` CHECK allows `like, comment, follow, tag`.
- Data: 22 profiles, 16 have posted, 45 posts (2 Apr – 5 May 2026), 6 tags, 44 follows.

### In the code

Found on 2026-09-17. Each is fixed in the phase shown.

| Problem | Where | Fixed in |
| --- | --- | --- |
| Posting is 4 separate client calls (upload → `recordUpload` → insert post → insert tags). A failure midway leaves the streak raised with no post, or a post with no tags. | `src/screens/CameraScreen.tsx:1286-1360` | P2 |
| The client sends the streak date, so a modified client can backdate or forge streaks. | `src/api/streaks.ts` `recordUpload(userId, date)` | P2 |
| One-post-per-day is a UTC day on the server but a local day on the phone. | live migration `one_post_per_user_per_day` vs `CameraScreen.tsx:1040` | P0 |
| The feed returns everyone's posts, always. | live `get_feed_posts` | P4 |
| The `posts` storage bucket is public: any photo URL works for anyone, forever. A feed lock is impossible while this holds. | live migration `create_posts_storage_bucket` | P4 |
| No push notifications at all. | `package.json` (no `expo-notifications`) | P1 |
| Chat loads every message at once; optimistic messages are matched to server rows by "latest temp from same sender", which mismatches on fast double-sends. | `src/hooks/useConversation.ts` | P6 |
| `useConversation` imports the Supabase client and the API layer directly, breaking the layering contract. | `src/hooks/useConversation.ts:2-3` | P6 |
| Repo migrations `0001–0006` were reconstructed from types and don't match the 31 live migrations. | `supabase/migrations/` | P0 |
| No guard hook enforcing "never write to production". | `.claude/` (no `hooks/`) | P0 |

---

## 3. Target data model (all phases)

New or changed objects, by migration. Every table has RLS enabled; "no client writes" means no
INSERT/UPDATE/DELETE policy — only `SECURITY DEFINER` functions write.

| Object | Kind | Key columns / constraints | Client access | Migration |
| --- | --- | --- | --- | --- |
| `app_config` | table, 1 row | `tag_window interval` 48 h, `unlock_window` 24 h, `answer_grace` 10 min, `daily_point_cap` 3, `quiet_start` 22:00, `quiet_end` 07:00, `feed_lock_enabled bool`, `invite_ttl` 7 days | read | `timezone_postdate` |
| `profiles` | +cols | `timezone text not null default 'Europe/London'`, `points int not null default 0`, `visits int not null default 0`, `streak_weeks int`, `last_post_week date` | read; timezone via RPC | `timezone_postdate`, `points_streak` |
| `posts` | +cols | `client_id uuid unique`, `post_date date not null` (server local date), `image_path text`, `pov_image_path text`; unique `(user_id, post_date)` replaces the UTC index | read via RPC | `timezone_postdate`, `tag_challenges`, `feed_lock` |
| `push_tokens` | table | `token text pk`, `user_id`, `platform`, `updated_at` | own rows via RPC | `push` |
| `push_outbox` | table | `id`, `user_id`, `kind`, `payload jsonb`, `send_after timestamptz`, `dedupe_key text unique`, `claimed_at`, `sent_at`, `ticket_id`, `error` | none | `push` |
| `tag_challenges` | table | `id`, `post_id`, `tagger_id`, `tagged_id` (null while invited), `invite_id`, `created_at`, `expires_at`, `answered_post_id`, `answered_at`, `cancelled_at`; partial unique `(tagger_id, tagged_id) where answered_at is null and cancelled_at is null` | read own (as tagger or tagged) | `tag_challenges` |
| `point_events` | table | `id`, `user_id`, `challenge_id`, `role` (`answerer`/`tagger`), `local_date`, `created_at`; unique `(challenge_id, user_id)` | read own | `points_streak` |
| `invites` | table | `token text pk` (random 128-bit), `inviter_id`, `challenge_id`, `created_at`, `expires_at`, `claimed_by`, `claimed_at` | none (RPC only) | `invites` |
| `notifications` | +types | CHECK adds `tag_answered`, `tag_missed`, `invite_joined`, `message` | unchanged | `tag_challenges` |
| `conversation_reads` | table | `(conversation_id, user_id) pk`, `last_read_at` | own via RPC | `messages` |
| `messages` | +col | `client_id uuid unique` | read; write via RPC | `messages` |
| `posts` bucket | storage | `public = false`; SELECT policy `can_view_post_object(name)` | signed URLs | `feed_lock` (policy), `private_bucket` (flip) |

Derived, never stored: tag state (`open` / `answered` / `missed` / `cancelled` from the timestamps),
feed unlock (`max(post.created_at) + unlock_window > now()`).

---

## 4. Phases

Each phase lists: goal · migrations · server functions · Edge Functions · client layers (API → store →
hook → UI) · verification · **Owner says go** (steps that wait for the owner's go-ahead in that
session; credentials, store releases and website hosting are done by the owner). File paths are new
unless marked *edit*.

### Phase 0 — Ground work

**Goal:** safe working on the live database, a schema that matches production, and the
day-boundary bug fixed.

1. **Guard hook** — `.claude/hooks/guard.cjs` + `.claude/hooks/guard.config.cjs`, wired as a
   `PreToolUse` hook in `.claude/settings.json` (*edit*). Config: `prodMarkers:
   ['pzepodsppqtvptzmwxzs', '--profile production', '--channel production']`, `prodMcpServers:
   ['supabase']`. Per decision #13, production schema changes are allowed, but only as
   `supabase db push` of a committed migration file, and only after that session's backup exists
   (next item). It denies `apply_migration`, `deploy_edge_function` and `merge_branch` through the
   MCP, writes through `execute_sql`, and also denies: DDL through `execute_sql`, migration files
   not named `<14-digit timestamp>_<snake_case>.sql` or not newest-last, edits to a migration that
   is already in the live history, `git add -A/./-u`, `git commit -a`, and AI attribution in commit
   messages. It asks first for `git push` and `eas build`. Unit-test the hook
   (`.claude/hooks/guard.test.cjs`). Flip-test: attempt a blocked call → hook refuses (red) →
   read-only call passes (green).
2. **Working on production safely** (decision #13: free plan, no preview branches, no automatic
   backups):
   - Before every `supabase db push`: `supabase db dump --linked -f supabase/backups/<ts>_schema.sql`
     and `supabase db dump --linked --data-only -f supabase/backups/<ts>_data.sql`.
     `supabase/backups/` is added to `.gitignore` (it holds real user data).
   - Every migration has its rollback file (item 5) written and read over before it is pushed.
   - Migrations are expand-only until the version gate (Phase 3), so old app versions never break.
   - pgTAP tests run inside a transaction that is rolled back, so they leave no rows behind.
     Concurrency checks use two dedicated test accounts and delete what they create.
   - Push, deploy and `db push` still happen only when the owner says so in that session.
3. **Make the repo match production** — the live history is the record, so the repo adopts it:
   - `supabase link --project-ref pzepodsppqtvptzmwxzs`, then `supabase migration fetch` downloads
     the 31 applied migrations into `supabase/migrations/` under their real timestamped names
     (read-only against production).
   - Delete the reconstructed `0001–0006` files (git history keeps them). Update
     `supabase/README.md` and the `docs/architecture.md` schema notes to point at the real files.
   - `supabase db diff --linked` must come back empty; if it doesn't, the drift (dashboard edits)
     becomes one `…_reconcile_drift.sql` that the owner marks applied with
     `supabase migration repair --status applied`.
   - From here on every migration is made with `supabase migration new <name>` (timestamp prefix),
     so local and live history can never disagree.
4. **Day-boundary fix** — ships in this phase because Phase 2 depends on it.
   - `timezone_postdate` migration: add `profiles.timezone`, `posts.post_date`, backfill
     `post_date` from `created_at at time zone 'Europe/London'`, add unique `(user_id, post_date)`,
     drop `posts_user_day_unique`, replace the posts INSERT RLS same-day check to use `post_date`.
     Add `app_config` and seed its row.
   - RPC `set_timezone(p_tz text)`: validates against `pg_timezone_names`, updates own profile.
   - Client: `src/api/profile.ts` (*edit*) `setTimezone()`; `App.tsx` (*edit*) calls it in
     `hydrateForUser` with `Intl.DateTimeFormat().resolvedOptions().timeZone`.
5. **Rollbacks and production deploys** — every migration gets a matching
   `supabase/rollbacks/<name>.rollback.sql`, written with it. Add
   `.github/workflows/db-deploy.yml`: manual trigger only, the owner must type `DEPLOY-TO-PROD`,
   GitHub environment approval, then `supabase db push`, `supabase functions deploy`, and a type
   regeneration check. This is the owner's one button for every "Owner-only: apply …" step below.
6. **Test harness** — `supabase/tests/*.sql` (pgTAP; the `pgtap` extension is added by the
   `timezone_postdate` migration), run with `supabase test db --linked`. Each file wraps itself in
   `begin; … rollback;`.

**Verify:** pgTAP — insert two posts for one user at 23:30 and 00:30 London time on the same UTC day →
both succeed (red before `timezone_postdate`, green after); two at 09:00 and 18:00 local → second fails.

**Owner says go:** `supabase link` (needs the database password) + `supabase migration fetch`;
`supabase migration repair` only if drift was found; backup, then push `timezone_postdate`.

---

### Phase 1 — Push notifications

**Goal:** the server can reach any user, reliably, once, and never at night.

**Migration `push`**
- `push_tokens`, `push_outbox` (see §3); index `push_outbox (send_after) where sent_at is null`.
- `register_push_token(p_token, p_platform)` — upsert on `token`, moving it to the caller if another
  account owned it (shared device).
- `unregister_push_token(p_token)` — called on sign-out.
- `enqueue_push(p_user, p_kind, p_payload, p_send_after, p_dedupe_key)` — internal, not granted to
  clients. Shifts `send_after` out of the recipient's quiet hours (their `profiles.timezone`).
  `ON CONFLICT (dedupe_key) DO NOTHING`.
- `claim_push_batch(p_limit)` — service role only:
  `UPDATE … SET claimed_at = now() WHERE id IN (SELECT id … WHERE sent_at IS NULL AND send_after <= now()
  AND (claimed_at IS NULL OR claimed_at < now() - interval '5 min') ORDER BY send_after
  FOR UPDATE SKIP LOCKED LIMIT p_limit) RETURNING …`. Stale claims are retried.
- `create extension if not exists pg_cron; create extension if not exists pg_net;` (neither is
  installed live).
- `pg_cron` job every minute: `pg_net.http_post` to the `send-push` Edge Function. The URL and a
  shared secret come from `vault.decrypted_secrets`; the function checks the
  `X-Internal-Secret` header with a constant-time compare.
- `enqueue_push` skips: the recipient is the actor, the pair is blocked either way, or either user
  is banned.
- Trigger on `notifications` INSERT → `enqueue_push` for like/comment/follow, so existing activity
  also pushes (one path for every push).

**Edge Function `supabase/functions/send-push/index.ts`**
- Auth: the shared `X-Internal-Secret` only (`verify_jwt: false`, matching the project rule in
  `RULES.md`); any other caller gets 401.
- Claims a batch, groups rows by user and minute ("@joe and 2 others tagged you"), sends to the Expo
  Push API in chunks of 100, writes `sent_at` + `ticket_id`, deletes tokens that return
  `DeviceNotRegistered`.
- Receipts: a second cron (every 15 min) calls the same function with `?receipts=1` to check
  tickets older than 15 min and prune bad tokens.

**Client**
- Deps: `expo-notifications` (Expo SDK-matched version via `npx expo install`).
- `app.config.js` (*edit*): `expo-notifications` plugin, notification icon/colour.
- `src/lib/push.ts`: `getPushPermission()`, `requestPushPermission()`, `getExpoPushToken()` (uses the
  EAS project id from `env`), `onNotificationOpened(cb)` — no store, no React.
- `src/api/push.ts`: `registerPushToken()`, `unregisterPushToken()`; barrel-export in
  `src/api/index.ts` (*edit*).
- `src/hooks/usePushRegistration.ts`: `[userId]`-keyed effect — if permission is granted, get the token
  and register it; on token refresh, re-register. No state.
- `src/hooks/useNotificationRouting.ts`: maps a tapped push (`payload.route`) to the navigator
  (camera for tags, conversation for messages, post detail for likes/comments).
- `App.tsx` (*edit*): mount both hooks once signed in; sign-out branch calls `unregisterPushToken`
  before `supabase.auth.signOut`.
- Sign-up (`src/components/CreateAccountSheet.tsx`, *edit*): a step explaining "friends will tag you"
  then `requestPushPermission()`. Existing users: a one-time prompt on the camera screen.
- Flag: `push-core` in `src/lib/featureFlags.ts` (*edit*) hides the prompts only; the server keeps
  queueing.

**Verify:** pgTAP — enqueue at 23:00 London → `send_after` = 07:00 next day; duplicate `dedupe_key`
→ one row; two concurrent `claim_push_batch` calls → disjoint rows. Device — like a post from a second
account → push arrives once; sign out → no more pushes to that device.

**Owner says go:** APNs key + FCM credentials in EAS; the `send-push` URL and shared secret in Vault and
as a function secret; deploy `send-push`; apply `push`; a new development build (native module added).

---

### Phase 2 — Tag challenges (the core loop)

**Goal:** posting is one atomic server call that records the post, the streak, the 3 tags, their
deadlines and their pushes, and answers any tags the poster holds.

**Migration `tag_challenges`**
- `posts.client_id`, `posts.image_path`, `posts.pov_image_path`; `tag_challenges` (§3);
  `notifications` CHECK widened.
- `get_taggable_friends(p_query text, p_limit int)` — mutual follows, excluding blocked (both
  directions) and anyone already holding an open tag from the caller. Returns
  `id, username, display_name, avatar_url, has_open_tag bool`.
- **`create_post(p_client_id, p_image_path, p_pov_image_path, p_caption, p_tagged_ids uuid[],
  p_invite_count int, p_lat, p_lng)`** — the single write path:
  1. If a post with `p_client_id` exists for the caller → return it (idempotent retry).
  2. Lock, in one `SELECT … ORDER BY id FOR UPDATE`, the caller's profile row and the profile
     rows of every tagger whose open tag this post will answer. One statement, fixed order: two
     concurrent posts can wait on each other but never deadlock. Compute `v_today` = now in the
     caller's `profiles.timezone`.
  3. Validate: both paths start with `auth.uid()/` and exist in `storage.objects`; tag count +
     invite count = 3 (or fewer only when the caller has fewer than 3 taggable friends — until
     Phase 5 ships); every tagged id is taggable (same rules as `get_taggable_friends`).
  4. Insert the post with `post_date = v_today` (unique constraint rejects a second post today).
  5. Update streak/visits (Phase 4 rule; until then, the existing `record_upload_streak` logic moved
     inside, using `v_today`).
  6. **Answer open tags:** `UPDATE tag_challenges SET answered_post_id, answered_at = now() WHERE
     tagged_id = caller AND answered_at IS NULL AND cancelled_at IS NULL AND expires_at +
     answer_grace > now() RETURNING …`. For each: notification `tag_answered` to the tagger;
     delete that challenge's unsent reminder pushes; enqueue "posted Xh after your tag".
  7. **Create new tags:** one `tag_challenges` row per friend (`expires_at = now() + tag_window`),
     `post_tags` rows (keeps the existing bubbles/caption code working), notification `tag`, and
     three outbox rows: `tag:{id}:sent` now, `tag:{id}:24h`, `tag:{id}:2h`.
  8. Create `p_invite_count` invite challenges (Phase 5 fills in tokens; until then the argument
     must be 0).
  9. Return `{ post, streak, answered: [{tagger, seconds}], invites: [] }`.
- `get_open_tags()` — caller's open tags: tagger profile, `expires_at`, plus `server_now` so the
  phone's countdown doesn't trust the device clock.
- `get_post_response(p_post_ids uuid[])` — for feed cards: the oldest answered tag per post
  (`tagger username`, `seconds`). Folded into the Phase 4 feed RPC; standalone until then.
- `cancel_tags_on_block` — extend the existing `on_user_block()` trigger: cancel open challenges
  between the pair and delete their unsent pushes.
- Trigger on `posts` DELETE → cancel that post's open challenges + delete unsent pushes.
- `pg_cron` every 5 min: `mark_missed_tags()` — for challenges past `expires_at + answer_grace`
  with no answer and no `tag_missed` notification yet → insert notification + push to the tagger.
  Correctness never depends on this job; it only announces.
- Grants: `create_post`, `get_taggable_friends`, `get_open_tags` to `authenticated`; revoke from
  `anon`/`public` (as in `restrict_suggested_follows_to_authenticated`).

**Client**
- `src/api/posts.ts` (*edit*): `createPost()` becomes one `supabase.rpc('create_post', …)` call with
  a `clientId`; remove the separate tag insert. `src/api/streaks.ts` (*edit*): drop `recordUpload`
  (contract migration later revokes the RPC).
- `src/api/tags.ts`: `getTaggableFriends()`, `getOpenTags()`.
- `src/store/tagStore.ts` (copy `followStore.ts` shape): `openTags`, `serverOffsetMs`, `sync()`,
  `reset()`. No persistence. Wire `reset()` into `App.tsx` sign-out (*edit*).
- `src/hooks/useOpenTags.ts` (copy `useFeed.ts`): syncs on mount, on app foreground, and when a
  `tag` push arrives.
- `src/screens/CameraScreen.tsx` (*edit*):
  - Upload order: generate `clientId` once per capture → upload both photos to
    `{uid}/{clientId}_rear.jpg` / `_pov.jpg` (`upsert: true`, so a retry overwrites instead of
    duplicating) → `createPost`. On failure: keep the photos and the `clientId` so "Try again" is the
    same post.
  - Remove the client streak increment and the direct `supabase` import (move storage upload into
    `src/api/storage.ts`).
  - `TagSheet`: source = `getTaggableFriends`; exactly 3 required (POST disabled until 3, with
    the fewer-than-3 exception); `MAX_TAGS` → 3.
  - Open-tags banner above the shutter: "@joe tagged you · 31:12:04 left" from `useOpenTags`.
  - After-post screen (`MidnightCountdown`) shows the answered tags returned by `create_post`.
- `src/components/OpenTagsBanner.tsx`, `src/lib/countdown.ts` (pure, unit-tested: remaining time from
  `expires_at` + server offset).
- `src/screens/NotificationsScreen.tsx` (*edit*): captions for `tag_answered`, `tag_missed`.
- Flag: `tag-challenges` — hides the banner and the 3-tag requirement in the UI. The server rule is
  switched by `app_config` if it ever needs turning off.

**Verify (pgTAP, all red first):**
- Same `client_id` twice → one post. Two concurrent `create_post` calls, different `client_id`, same
  day → exactly one succeeds.
- Tag a non-mutual / a blocked user / yourself → rejected.
- Tag the same friend twice while open → rejected by the partial unique index.
- Friend posts at `expires_at + 5 min` → answered; at `+ 11 min` → not answered.
- Friend posts; tagger deletes their post in a concurrent transaction → the tag ends either answered
  or cancelled, never both (row lock order: profile → challenge).
- Answering deletes the 24h/2h outbox rows; cancelling deletes them too.
- Jest: `countdown.ts`.
- Device: A tags B → B gets a push → B posts → A gets "posted Xh after your tag".

**Owner says go:** apply `tag_challenges`; publish the app build (JS + native from Phase 1).

---

### Phase 3 — Contract the old posting path

**Goal:** once the Phase 2 build is the minimum supported version, nothing can post around the rules.

**Migration `contract_posting`**
- Revoke `INSERT` on `posts` and `post_tags` from `authenticated` (drop those RLS policies).
- Revoke `record_upload_streak` from `authenticated`.
- Minimum app version: `app_config.min_app_version`; `get_app_status()` returns it. Client
  (`App.tsx`, *edit*) shows a blocking "Update Mahi" screen when below it.

**Verify:** pgTAP — authenticated direct insert into `posts` → permission denied; `create_post` still
works.

**Owner says go:** raise `min_app_version` only after the Phase 2 build is live in the store; apply `contract_posting`.

---

### Phase 4 — Feed lock and private photos

**Goal:** you see friends' posts only if you posted in the last 24 hours, enforced by the server
for both the post data and the image files.

**Migration `feed_lock` (expand)**
- Backfill `image_path` / `pov_image_path` from the existing public URLs.
- `viewer_unlocked_until(p_viewer uuid) returns timestamptz` — `max(created_at) + unlock_window`
  of the viewer's posts (null = never). Index `posts (user_id, created_at desc)`.
- `can_view_post(p_viewer, p_post_owner) returns bool` — owner = viewer, OR (not blocked either way
  AND viewer follows owner AND (`not feed_lock_enabled` OR `viewer_unlocked_until > now()`)).
- **`get_feed(p_limit, p_cursor_ts, p_cursor_id)`** replaces `get_feed_posts`: returns
  `{ locked bool, unlocked_until, server_now, items[] }`. Items = posts from people the caller
  follows (plus own), newest first, excluding banned authors, with likes/comments/tags/response
  time. When locked, items
  carry poster, time and `image_path = null` — enough for the blurred "who posted" view, nothing to
  leak.
- `get_user_posts(p_user, p_limit, p_cursor…)` — same `can_view_post` gate for other people's
  profiles; own profile always visible.
- Storage: SELECT policy on `storage.objects` for bucket `posts`:
  `can_view_post_object(name)` → owner folder, or a post with that path passes `can_view_post`.
- No extra signing function: the client signs the paths the feed returned with `createSignedUrls`
  (one batch call per page), and the storage policy re-checks access.
- Likes/comments: `toggle_like` and comment insert also require `can_view_post` (a locked user
  can't interact with what they can't see).

**Migration `private_bucket` (contract, after the version gate covers this build)**
- `update storage.buckets set public = false where id = 'posts'`. Old public URLs stop working.
- Revoke `get_feed_posts`.

**Client**
- `src/api/posts.ts` (*edit*): `getFeed()` (RPC), `getUserPosts()` → RPC, `signMediaPaths(paths)`
  (`createSignedUrls`, expiry = `min(1 h, unlocked_until - now)`).
- `src/store/feedStore.ts` (*edit*): state gains `locked`, `unlockedUntil`, `serverOffsetMs`; `sync()`
  signs the page's paths before `set()` so a card never renders without its image; drop the
  `posts.length > 0` skip-guard for a staleness check (unlock can expire while the app is open).
  A request generation counter drops responses from superseded requests, and `loadMore` drops
  duplicate ids. In-memory only.
- `src/hooks/useFeed.ts` (*edit*): re-sync on foreground and when `unlockedUntil` passes (single
  timer, cleared on unmount).
- `src/screens/FeedScreen.tsx` (*edit*): `LockedFeed` state — blurred avatars of who posted, open
  tags (`useOpenTags`), "Post to unlock" → navigates to camera. Loading state until the first
  `sync()` resolves (never show last session's items).
- `src/store/profilePostsStore.ts`, `src/screens/UserProfileScreen.tsx`,
  `src/components/ProfileMediaMap.tsx` (*edit*): use `getUserPosts` + signed URLs; locked profiles show
  the same "Post to unlock".
- `src/components/PostDetailModal.tsx` (*edit*): fetch through the gated RPC.
- Flag: `feed-lock` (UI only); server switch = `app_config.feed_lock_enabled`.

**Verify (pgTAP, red first):**
- Viewer with no post in 24 h → `get_feed.items[*].image_path` all null; storage SELECT on a
  friend's object → denied.
- Viewer posts → items have paths; SELECT allowed; at `+24 h + 1 s` → denied again.
- Non-follower → post absent. Blocked either way → absent and object denied.
- `feed_lock_enabled = false` → unlocked for followers.
- Device: fresh account → locked feed → post → unlocked; old public URL (after `private_bucket`) → 400.

**Owner says go:** apply `feed_lock`; ship the build; after adoption (Phase 3 version gate), apply `private_bucket`.

---

### Phase 5 — Points and the new streak

**Goal:** points and streaks are counted once, on the server, in the posting transaction.

**Migration `points_streak`**
- `point_events`, `profiles.points/visits/streak_weeks/last_post_week`.
- Inside `create_post` step 6, for each answered challenge: insert `point_events` for the answerer
  and the tagger (`ON CONFLICT DO NOTHING`), skipping any user who already has
  `daily_point_cap` events for their local date (both profile rows are already locked by step 2).
  Increment `profiles.points` only for inserted rows.
- Streak step 5: **ask the owner decisions #1 and #10 before writing this migration.** Whatever the
  rule, it runs inside `create_post` from `v_today` only, and `visits += 1` on every post. If #1 is
  the weekly streak: `week = date_trunc('week', v_today)`; `last_post_week = week` → unchanged;
  `= week - 7 days` → `streak_weeks += 1`; else → `1`; best kept in `streak_highest`.
- `get_feed`, `get_user_posts`, `searchProfiles` (`src/api/profile.ts`) and `get_taggable_friends`
  return `points`.
- Drop `fitness_routine` from the streak rule (the column stays until a later cleanup).

**Client**
- `src/types/database.ts` regenerated.
- `src/components/PointsBadge.tsx` (fire icon + count, theme tokens) used on feed cards, profiles,
  search rows, tag sheet rows.
- `src/components/RestDaysStreakPanel.tsx` (*edit*): remove rest-day toggles; grid shows posted days
  and the week streak. `src/components/TrainingDaysScreen.tsx` and `updateFitnessRoutine` removed.
- `src/components/CreateAccountSheet.tsx` (*edit*): drop the training-days step.
- Flag: `mahi-points`.

**Verify (pgTAP):** answering 5 tags in one day → 3 points; concurrent answer of the same challenge →
one event; weekly streak across a skipped week → resets to 1; timezone Sunday/Monday boundary
correct for `Europe/London` and `America/New_York`.

**Owner says go:** apply `points_streak`; ship the build.

---

### Phase 6 — Messages hardening

**Goal:** chat is paginated, idempotent, pushes on new messages, and has server-side unread counts.

**Migration `messages`**
- `messages.client_id uuid unique`; `conversation_reads`.
- `send_message(p_conversation_id, p_client_id, p_content)` — checks participant, not blocked,
  conversation not `blocked`, content length 1–2000; `ON CONFLICT (client_id)` returns the existing
  row; enqueues a `message` push (dedupe per conversation per minute, so a burst is one push).
- `get_messages(p_conversation_id, p_before timestamptz, p_limit)` — newest page first.
- `mark_conversation_read(p_conversation_id)` — upsert `last_read_at = now()`.
- `get_inbox()` — conversations with last message, other profile and `unread_count` in one query
  (replaces the two-query merge in `src/api/messages.ts`).
- Contract later (`contract_messages`, after the version gate covers this build): revoke direct
  `INSERT` on `messages`.

**Client**
- `src/api/messages.ts` (*edit*): `sendMessage(clientId)` → RPC, `getMessages(before)`, `getInbox()`,
  `markRead()`.
- `src/store/conversationStore.ts` (copy `socialStore.ts` channel registry): messages per
  conversation, `loadOlder()`, optimistic send keyed by `client_id` (the realtime INSERT replaces the
  row with the same `client_id`, so fast double-sends can't swap), `reset()` wired into `App.tsx`.
- `src/hooks/useConversation.ts` (*edit*): becomes a thin wrapper over `conversationStore` (removes the
  direct `supabase`/`api` imports).
- `conversationStore` re-fetches the newest page when the realtime channel reconnects and when the
  app returns to the foreground, so a dropped connection never leaves a gap (no polling).
- `src/screens/ConversationScreen.tsx` (*edit*): load older on scroll; mark read on open and on new
  message while open. `MessagesScreen.tsx` (*edit*): unread dots from `unread_count`.
- Flag: existing `messaging-core`.

**Verify:** pgTAP — same `client_id` twice → one message; blocked sender → rejected; unread count
after read = 0. Device — airplane-mode send, reconnect, retry → one message; two quick sends keep
their order and content.

**Owner says go:** apply `messages`; ship the build.

---

### Phase 7 — Invite links

**Goal:** tagging someone not on Mahi sends a link; when they sign up, their 48-hour tag starts.

**Migration `invites`**
- `invites` (§3). `create_post` step 8 creates `p_invite_count` challenges with `tagged_id = null`,
  `expires_at = null`, and one invite each (`token = encode(gen_random_bytes(16), 'hex')`,
  `expires_at = now() + invite_ttl`); returns the tokens.
- `claim_invite(p_token)` — caller must be signed up within the last 24 h (stops existing users
  farming); locks the invite row; if unclaimed and unexpired → sets `claimed_by`, auto-follows both
  ways, sets the challenge's `tagged_id` and `expires_at = now() + tag_window`, enqueues the tag
  pushes and an `invite_joined` notification to the inviter. Idempotent for the same user.
- `get_invite_preview(p_token)` — `anon` allowed: inviter display name + avatar only (for the
  landing page and the sign-up screen). Rate-limited by token entropy; returns nothing for unknown
  tokens.
- Cron: invites past `expires_at` with no claim → challenge cancelled (for tidy counts only).

**Links**
- Format: `https://togethermahi.com/i/<token>`. Landing page (outside this repo) shows the inviter,
  App Store / Play buttons, and "Already have Mahi? Open" (universal link / app link).
- Through install without a third-party SDK: the landing page also shows a short code
  (`invites.code`, 6 characters, unique index on `lower(code)`); `claim_invite` accepts the token or
  the code. Sign-up has "Got an invite code?" pre-filled when the app was opened by the link.
- `app.config.js` (*edit*): `associatedDomains` (iOS) and `intentFilters` (Android) for
  `togethermahi.com/i/*`.

**Client**
- `src/lib/inviteLink.ts`: parse token from a URL (pure, unit-tested).
- `src/api/invites.ts`: `claimInvite()`, `getInvitePreview()`.
- `src/hooks/useInviteLink.ts`: listens to `Linking` URLs, holds the pending token in memory (and
  in `signUpStore` during sign-up, which already persists mid-flow), claims after sign-up.
- `CameraScreen.tsx` TagSheet (*edit*): "Invite someone" fills a slot; after `create_post`, open the
  share sheet with the returned links.
- `CreateAccountSheet.tsx` (*edit*): invite preview + code field.
- Flag: `invite-links`. Remove the fewer-than-3 exception from `create_post` once this ships.

**Verify:** pgTAP — two users claim the same token concurrently → one wins; expired token → rejected;
an account older than 24 h → rejected; claim starts the 48-hour clock. Jest — `inviteLink.ts`.
Device — share link → install → sign up with code → tag appears with 48 h left; inviter gets
"joined".

**Owner says go:** host the landing page and `apple-app-site-association` / `assetlinks.json` on
`togethermahi.com`; apply `invites`; ship the build.

---

### Phase 8 — Beta

- PostHog events (client, after the server confirms): `tag_sent`, `tag_answered` (with seconds),
  `tag_missed`, `invite_shared`, `invite_claimed`, `feed_unlocked`, `push_opened`.
  Server-truth dashboard from SQL views (`tag_challenges`, `point_events`) — the numbers of record.
- Inner circle runs the loop for 2 weeks; compare against the PRD success targets.

---

## 5. What similar apps taught (patterns only, no code copied)

Mahi keeps its own shape: Postgres RPCs called from `src/api/`, Zustand stores, no TanStack Query,
no action-router Edge Functions. From a read-only review of similar apps, these patterns are adopted:

| Pattern | Used in |
| --- | --- |
| Expiry checked at read time (`expires_at > now()`), never dependent on a job | P2, P4 |
| Banned and blocked (both ways) excluded inside every read function | P2, P4, P6 |
| Feed never shows cached rows: skeleton, then fresh page; generation counter drops stale responses | P4 |
| Push via Vault secret + `X-Internal-Secret` constant-time check; one owner per device token | P1 |
| `app_config` holding the minimum app version for forced updates | P3 |
| Invite codes with a case-insensitive unique index, redeemable only during onboarding | P7 |
| Guard hook enforcing migration naming/order and blocking production writes | P0 |
| Manual, typed-confirmation production deploy workflow | P0 |

Where Mahi goes further than similar apps: server-side idempotency (`client_id`) for posts and
messages, Expo receipt checks and dead-token cleanup, quiet hours and grouped pushes, and pgTAP tests
for every rule.

---

## 6. Migration order (summary)

Names only — each file gets its timestamp from `supabase migration new <name>` on the day it is
written, so the order below is the order they are created and applied.

| Order | Name | Phase | Type |
| --- | --- | --- | --- |
| 1 | `reconcile_drift` (only if `db diff` finds drift) | P0 | match production |
| 2 | `timezone_postdate` | P0 | expand |
| 3 | `push` | P1 | expand |
| 4 | `tag_challenges` | P2 | expand |
| 5 | `contract_posting` | P3 | contract |
| 6 | `feed_lock` | P4 | expand |
| 7 | `points_streak` | P5 | expand |
| 8 | `messages` | P6 | expand |
| 9 | `invites` | P7 | expand |
| 10 | `private_bucket`, `contract_messages` | once the version gate covers the P4 and P6 builds | contract |

Every migration that replaces a live function ends with `NOTIFY pgrst, 'reload schema';`.

Rules: never edit a migration once it has been pushed; each one is written with its rollback and
pgTAP test, backed up for, pushed to production with `supabase db push` when the owner says so, then
tested with `supabase test db --linked`. Regenerate `src/types/database.ts` after each.

## 7. New and changed hooks (summary)

| Hook | Phase | Kind | Wraps |
| --- | --- | --- | --- |
| `usePushRegistration` | P1 | effect only | `lib/push` + `api/push` |
| `useNotificationRouting` | P1 | effect only | `lib/push` → navigator |
| `useOpenTags` | P2 | sync on mount/foreground | `tagStore` |
| `useFeed` (*edit*) | P4 | sync + unlock timer | `feedStore` |
| `useProfilePosts` (*edit*) | P4 | sync | `profilePostsStore` |
| `useConversation` (*edit*) | P6 | subscription | `conversationStore` |
| `useMessages` (*edit*) | P6 | subscription | `messagesStore` |
| `useInviteLink` | P7 | Linking listener | `api/invites`, `signUpStore` |
| Claude `guard` hook | P0 | PreToolUse | blocks production writes |

Every new store's `reset()` is added to the `App.tsx` sign-out branch in the same commit.
After code changes, rebuild the graph (see `CLAUDE.md`).
