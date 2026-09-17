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
| `app_config` | table, 1 row | `tag_window interval` 48 h, `unlock_window` 24 h, `answer_grace` 10 min, `daily_point_cap` 3, `quiet_start` 22:00, `quiet_end` 07:00, `feed_lock_enabled bool`, `invite_ttl` 7 days | read | `push` |
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
   backups). One helper, `scripts/db.sh`, needs no Docker; it reads the password from `~/.pgpass`:
   - `scripts/db.sh backup` — schema + data dump into `supabase/backups/` (gitignored). The guard
     refuses any push unless both files are under 60 minutes old.
   - `scripts/db.sh test` — runs every `supabase/tests/*.sql` with `psql`; each file is
     `begin; … rollback;`, so tests leave no rows behind.
   - `scripts/db.sh try <migration> <test>` — applies a migration and runs its test on production in
     one transaction that is always rolled back. Every migration is tried this way before it is pushed,
     which gives the red→green check on the real schema without leaving anything behind.
   - `scripts/db.sh push [--dry-run]` — the Supabase CLI push, with the connection built from
     `~/.pgpass`.
   - Every migration has its rollback file written and read over before it is pushed.
   - Migrations are expand-only until the version gate (Phase 3), so old app versions never break.
   - Push and deploy happen only when the owner says so in that session.
3. **Make the repo match production** — *done 2026-09-17*: the 31 live migrations were downloaded
   from `supabase_migrations.schema_migrations` (read-only) under their real names; the
   reconstructed `0001–0006` files were deleted. Every live table, column, function, trigger,
   policy, index and bucket was checked against the files; the only gap (the `avatars` bucket and
   its 3 policies, made in the dashboard) is recorded in `20260917105120_reconcile_drift.sql`, which
   is idempotent. New migrations are always named `<timestamp>_<name>.sql`, newest last.
4. **Day-boundary fix** — `20260917105829_timezone_postdate.sql`:
   - `profiles.timezone` (default `Europe/London`), checked against `pg_timezone_names` by a trigger
     (no extra RPC: the app updates its own profile row, which RLS already allows).
   - `posts.post_date`, backfilled in each user's zone (no duplicate days found in live data);
     a trigger sets `created_at` and `post_date` on insert and freezes both on update.
   - Unique `(user_id, post_date)` replaces the UTC-day index; the racy same-day check in the
     `posts_insert` policy is dropped because the index enforces it.
   - App: `updateTimezone()` in `src/api/profile.ts`; `App.tsx` `hydrateForUser` sends the phone's
     zone when it differs. Works with current app builds unchanged.
   - `app_config` moves to Phase 1, where its first setting (quiet hours) is used.
5. **Rollbacks** — `supabase/rollbacks/<same name>.rollback.sql` for every migration. (A GitHub
   deploy workflow was dropped: with decision #13, `scripts/db.sh` is the single path.)
6. **Test harness** — `20260917105328_pgtap.sql` adds pgTAP; tests live in `supabase/tests/`.

**Verify:** `supabase/tests/timezone_postdate_test.sql` — the server sets the local date; a second
post the same local day is refused; yesterday's local post on the same UTC day doesn't block today's;
posts can't be re-dated; invalid zones are refused; the UTC index is gone. Red: run after the `pgtap`
push and before `timezone_postdate`. Green: after.

**Owner says go:** add the database password to `~/.pgpass`; then backup → push `reconcile_drift`
and `pgtap` → test (red) → backup → push `timezone_postdate` → test (green); release an app build
with the time-zone sync.

---

### Phase 1 — Push notifications

**Goal:** the server can reach any user, reliably, once, and never at night.

*Built 2026-09-17, not live.* Files: `supabase/migrations/20260917111346_push.sql` (+ rollback),
`supabase/tests/push_test.sql`, `supabase/functions/send-push/index.ts`.

**Migration `push`**
- Enables `pg_net` and `pg_cron` (neither was installed).
- `app_config` (one row) is created here with its first settings, `quiet_start` 22:00 and
  `quiet_end` 07:00. Later phases add their own columns.
- `push_tokens` (one owner per token) and `push_outbox` (`dedupe_key` unique, `claimed_at`,
  `sent_at`, `tickets jsonb` = `[{ticket, token}]`, `receipts_checked_at`). No client access at all:
  privileges revoked, RPCs only.
- `push_send_time(at, tz)` moves a send inside quiet hours to their end, in the recipient's zone.
- `enqueue_push(user, actor, kind, body, data, send_after, dedupe_key)` — internal only. Skips
  self-actions, blocked pairs (either way) and banned users; `ON CONFLICT (dedupe_key) DO NOTHING`.
  The server writes the push text.
- `register_push_token(token, platform)` (validates the Expo token format; a token re-registered
  on a shared phone moves to the new account) and `unregister_push_token(token)` — `authenticated`.
- Worker RPCs, `service_role` only: `claim_push_batch(limit)` (`FOR UPDATE SKIP LOCKED`, stale
  claims retried after 5 min, returns each row with the user's tokens), `complete_push(results)`,
  `remove_push_tokens(tokens)`, `pending_push_receipts(limit)` (tickets 15 min–24 h old),
  `mark_push_receipts_checked(ids)`.
- Trigger `push_on_notification` on `notifications` INSERT → `enqueue_push` with dedupe key
  `notification:<id>`, so likes, comments, follows and tags push through the same path.
- `invoke_send_push(mode)` + two cron jobs (`send-push` every minute, `push-receipts` every 15
  minutes). It skips the HTTP call when nothing is due, and does nothing until the Vault secrets
  `send_push_url` and `send_push_secret` exist.

**Edge Function `send-push`**
- Accepts only POST with a matching `X-Internal-Secret` (function secret `SEND_PUSH_SECRET`,
  constant-time compare); `verify_jwt: false` like every function here.
- `{"mode":"send"}`: claims up to 500 rows, groups them per user into one message ("… (+N more)"),
  sends to Expo in chunks of 100, records tickets/errors, removes `DeviceNotRegistered` tokens. A
  failed Expo call leaves its rows claimed-but-unsent, so they are retried after the claim expires.
- `{"mode":"receipts"}`: checks receipts in chunks of 1000 and removes dead tokens.
- Type-checked with `deno check`.

**Client**
- `expo-notifications ~57.0.19`; `app.config.js` plugin (`color`, `defaultChannel: 'default'`).
- `src/lib/push.ts` — permission, Expo token (Android channel set first), token-rotation and
  tap listeners (includes the push that launched the app), the once-per-device explainer flag.
- `src/api/push.ts` — `registerPushToken()`, `unregisterPushToken()`.
- `src/store/pushStore.ts` — `register()`, `requestAndRegister()`, `reset()` (wired into sign-out).
- `src/hooks/usePushRegistration.ts` and `src/hooks/usePushRouting.ts`, both mounted in
  `VerticalNavigator`. A tapped push marks its notification read and opens the actor's profile
  (follows) or the notifications list (everything else).
- `src/api/auth.ts` `signOut()` unregisters the token first, while still signed in.
- Permission is asked with a one-time explainer alert for new and existing users alike, instead of a
  new sign-up step (keeps `CreateAccountSheet.tsx` untouched).
- Flag `push-core` hides that prompt only; the server keeps queueing.

**Verify:** `supabase/tests/push_test.sql` (19 checks) — quiet-hours times for London and New York;
no push for self, blocked or banned; dedupe; a follow queues a push with the right text; token
format, ownership move and client lockout; claim-once; completion; dead-token removal. True
concurrency of two workers is covered by `SKIP LOCKED` and is not testable in one transaction.
Device: like a post from a second account → one push; sign out → no more pushes to that device.

**Owner says go:** APNs key + FCM credentials in EAS; set function secret `SEND_PUSH_SECRET`; add
Vault secrets `send_push_url` (the function URL) and `send_push_secret` (same value); deploy
`send-push`; backup → push the `push` migration → run `push_test.sql`; a new development build
(native module added).

---

### Phase 2 — Tag challenges (the core loop)

*Built 2026-09-17, not live.* Files: `supabase/migrations/20260917112413_tag_challenges.sql`
(+ rollback), `supabase/tests/tag_challenges_test.sql` (28 checks). Differences from the design below:

- **Answering is a trigger** (`answer_tags_on_post`, AFTER INSERT on `posts`), not a step inside
  `create_post`, so a post from an older app build also answers tags.
- **Tag pushes reuse the existing path:** `create_post` inserts `post_tags`; the live `notify_on_tag`
  trigger makes the notification; `push_on_notification` sees the challenge and writes
  "@x tagged you. You have 48 hours to post." (route `camera`). No double push. `create_post` only
  queues the 24 h and 2 h reminders (dropped if quiet hours would push them past the deadline).
- **Outbox rows and notifications carry `challenge_id`** (cascade), so answering, cancelling or
  deleting a challenge removes its unsent pushes in the same transaction.
- **Expired tags** get `missed_at` (from `mark_missed_tags` every 5 min, or from `create_post` for the
  caller's own pairs) so the one-open-tag-per-pair index frees up.
- **Server switches:** `app_config.tag_count` (3), `tags_required`, `tag_window` (48 h),
  `answer_grace` (10 min). `create_post` builds `image_url` from `app_config.storage_public_url`
  until Phase 4 moves to paths.
- **Locks:** only the caller's profile row is locked; answer/cancel races are settled by row locks on
  `tag_challenges` (the loser's `UPDATE … WHERE answered_at IS NULL AND cancelled_at IS NULL` matches
  nothing). Phase 5 adds the tagger lock for points.
- **App:** `src/api/tags.ts` (`getTaggableFriends`, `getOpenTags`, `getTagRules`, `getPostResponses`),
  `src/api/posts.ts` (`uploadPostPhotos`, `removePostPhotos`, `createPost` → RPC; `recordUpload`
  removed), `src/store/tagStore.ts` (+ sign-out reset), `src/hooks/useOpenTags.ts`,
  `src/components/OpenTagsBanner.tsx`, `src/lib/countdown.ts` (+ unit test, flip-tested).
  `CameraScreen`: `expo-crypto` client ids, tag sheet lists friends who follow back (max 3, already-
  tagged greyed out), POST reads "TAG N MORE" until the requirement is met, answered-tag toast, open-
  tags banner (flag `tag-challenges`). Feed cards show "ANSWERED @x IN 3H" (`getFeedPosts` merges
  `get_post_responses`). A tapped tag push opens the camera.


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
- Tag pushes: `create_post` queues its own 48-hour tag pushes, so `push_on_notification` must skip
  `type = 'tag'` from this migration on (otherwise a tag pushes twice).
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

*Expand step built 2026-09-17, not live:* `supabase/migrations/20260917113302_app_version_gate.sql`
(+ rollback, `supabase/tests/app_version_gate_test.sql`) adds `app_config.min_app_version`
(default `0.0.0`, x.y.z only). The app reads it once per sign-in and shows
`src/components/UpdateRequiredScreen.tsx` when `isBelowVersion(app version, minimum)`
(`src/lib/appVersion.ts`, unit-tested, flip-tested); a failed check never blocks. No separate
`get_app_status()` RPC — `app_config` is already readable.

*Contract step parked:* `supabase/deferred/contract_posting.sql` sits outside `migrations/` so a push
can't apply it early. It becomes a migration only after the create_post build is in both stores and
`min_app_version` is raised to that build's `version` (bump `version` in `app.config.js` for that
release — it is still `0.1.0`).


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

*Expand step built 2026-09-17, not live:* `supabase/migrations/20260917114517_feed_lock.sql`
(+ rollback, `supabase/tests/feed_lock_test.sql`, 20 checks, flip-tested by disabling the lock rule).
Differences from the design below:

- `get_feed` / `get_user_posts` return `jsonb` built by one shared `feed_item(post, viewer, hide)`;
  a hidden item keeps poster, time and streak day but has no photo paths, caption or location.
  Response times come in the same read (`get_post_responses` was dropped).
- Visibility lives in `viewer_is_locked` + `can_view_post`; `can_view_post_object` is ready for the
  storage policy. Banned and blocked (both ways) are excluded; profiles of people you don't follow
  are hidden too; your own posts never are.
- Server switches: `app_config.unlock_window` (24 h), `feed_lock_enabled`.
- The live photo read policy (`posts_storage_select`: any signed-in user) and the public bucket are
  unchanged here, so older builds keep working. Their replacement, plus gating likes/comments and
  revoking `get_feed_posts`, is parked in `supabase/deferred/private_bucket.sql` (applies cleanly on
  top of everything in the local replay).
- Found and fixed on the way: the live `toggle_like` never checked the caller, so anyone could like
  or unlike as another user — `20260917105130_secure_toggle_like.sql` (+ test, red on the live
  schema, green after). Safe to ship ahead of everything else.
- The reconcile migration also records that the `posts` bucket was made public in the dashboard.
- **App:** `getFeed` / `getUserPosts` (RPC + one `createSignedUrls` batch per page, 1-hour links);
  `feedStore` holds `locked`, `unlockedUntil`, `serverOffsetMs`, drops stale responses with a
  generation counter and duplicate ids on `loadMore`, and has a `loaded` flag so the screen shows a
  loading state instead of last session's posts. `useFeed` re-reads on foreground and when the
  unlock ends. `FeedScreen` renders `LockedPostItem` (who, when, "POST TO UNLOCK" → camera).
  Posting re-reads the feed. Locked profile tiles show the placeholder and don't open.
- Local checks: `scripts/db.sh local` replays all 39 migrations on Postgres 17 and runs 83 pgTAP
  checks (all pass).


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

*Points built 2026-09-17, not live; the streak half waits for decisions #1 and #10.*
`supabase/migrations/20260917115316_points.sql` (+ rollback, tested by applying it locally;
`supabase/tests/points_test.sql`, 10 checks, flip-tested by removing the cap). Differences from the
design below:

- **No stored counter.** `point_events` holds one row per point; `public.points(profile)` counts them
  on read and is exposed as a PostgREST computed column (`select('*, points')`). No transaction
  updates a shared total, so there is no profile lock to deadlock on (two friends answering each
  other's tags at the same moment was the risk).
- **Daily cap as a constraint:** `unique (user_id, local_date, slot)` with `slot ≤
  app_config.daily_point_cap`; `award_point` tries slots in order. `unique (challenge_id, user_id)`
  stops double pay. Awards run in user-id order inside `answer_tags_on_post`, so any post from any
  app build pays out. Banned users earn nothing; points survive a deleted challenge.
- `get_taggable_friends` and `feed_item` return points.
- **App:** `PointsBadge` ("🔥 N", flag `mahi-points`) on feed cards, tag-sheet rows and search rows
  (search's fire icon used to show the streak); a "🔥 POINTS" stat on both profile screens;
  `getProfile` / `searchProfiles` select `points`; `userStore.refresh()` re-reads the profile after a
  post answers tags.


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

*Built 2026-09-17, not live.* `supabase/migrations/20260917120414_messages.sql` (+ rollback,
`supabase/deferred/contract_messages.sql`; `supabase/tests/messages_test.sql`, 21 checks, red before
the migration, green after). Differences from the design below:

- **A live bug fixed on the way:** blocking someone you had messaged failed outright — the block
  trigger writes `status = 'blocked'` but the CHECK only allowed `requested` and `active`.
  (Checked against prod: 13 conversations, 0 blocks — nobody had hit it yet.) The same migration
  makes a block hold: it stops `send_message` and the old direct `INSERT` alike.
- **Only the receiver can accept a request.** The live `conversations_update` policy ended in a
  catch-all `OR (participant_one = auth.uid() OR ...)`, so a requester could accept their own.
  `update_convo_updated_at` became `SECURITY DEFINER` so the tighter policy can't break an old
  build's direct insert.
- **One inbox function, two lists:** `get_inbox(p_status)` serves both the inbox and the request
  list, and replaces the two-query merge in `src/api/messages.ts`.
- **No `message` notification type.** `send_message` enqueues the push itself, so chat never fills
  the in-app notifications list. Dedupe is per sender per conversation per minute.
- **App:** `conversationStore` (messages per conversation, `loadOlder`, optimistic send keyed by
  `client_id`, re-reads the newest page on realtime reconnect and on foreground);
  `useConversation` is now a thin wrapper with no `supabase`/`api` imports; unread dots on
  `MessagesScreen` in the accent token; a failed send puts the text back in the box.
  `src/store/__tests__/conversationStore.test.ts` (4 checks) covers the message-swap bug —
  flip-tested by keying the merge on `id` again (2 red).

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

*Built 2026-09-17, not live, and the landing page is not hosted.*
`supabase/migrations/20260917121508_invites.sql` (+ rollback,
`supabase/deferred/contract_invites.sql`; `supabase/tests/invites_test.sql`, 27 checks, red before
the migration, green after). Differences from the design below:

- **`app_config.invite_links_enabled` gates decision #8** instead of a code change. While it is
  false, too few friends still excuses fewer than 3 tags, so every old app build keeps posting.
  The contract step is one line (`update app_config set invite_links_enabled = true`), run after
  the version gate covers the build that can invite.
- **One direction of link:** `invites.challenge_id`, not the `tag_challenges.invite_id` of §3.
  `tag_challenges.tagged_id` and `expires_at` became nullable — a challenge waiting on an invite
  has neither, and every rule compares against `now()`, which a null never matches, so a waiting
  invite is never answered, never missed and is in nobody's open tags.
- **Claiming reuses the live tag path:** `claim_invite` inserts the `post_tags` row, so the
  existing `notify_on_tag` trigger makes the notification and the "you've been tagged" push. Only
  the two reminders and the inviter's `invite_joined` are enqueued directly.
- **Codes** are 6 characters from a 32-letter alphabet with no `0`, `O`, `1` or `I`, re-rolled
  against the unique index; tokens stay 16 random bytes as hex. `claim_invite` and
  `get_invite_preview` take either. `pgcrypto` lives in the `extensions` schema on this project,
  so `gen_random_bytes` is called qualified.
- **App:** `src/lib/inviteLink.ts` (pure, 8 Jest checks), `src/api/invites.ts`,
  `src/store/inviteStore.ts` (token in memory only — invites expire), `src/hooks/useInviteLink.ts`
  wired once in `App.tsx`. The tag sheet's slot counter counts invites; posting hands each link to
  the share sheet in turn, because a link is for one person and works once. Sign-up shows who
  invited you, or a code field when the app wasn't opened by the link. Flag `invite-links`.
- **Not built:** a screen listing invites you've already sent. A link skipped in the share sheet
  stays on the server with no way back to it from the app.

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
| `usePushRegistration` | P1 | effect only | `lib/push` + `pushStore` |
| `usePushRouting` | P1 | effect only | `lib/push` → navigator |
| `useOpenTags` | P2 | sync on mount/foreground | `tagStore` |
| `useFeed` (*edit*) | P4 | sync + unlock timer | `feedStore` |
| `useProfilePosts` (*edit*) | P4 | sync | `profilePostsStore` |
| `useConversation` (*edit*) | P6 | subscription | `conversationStore` |
| `useMessages` (*edit*) | P6 | subscription | `messagesStore` |
| `useInviteLink` | P7 | Linking listener | `api/invites`, `signUpStore` |
| Claude `guard` hook | P0 | PreToolUse | blocks production writes |

Every new store's `reset()` is added to the `App.tsx` sign-out branch in the same commit.
After code changes, rebuild the graph (see `CLAUDE.md`).
