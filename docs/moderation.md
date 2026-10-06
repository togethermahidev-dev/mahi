# Moderation

How reports, staff actions and the automatic check work on the server. This is the contract the
app and the staff portal build against. Server files: migration
`supabase/migrations/20261006100000_moderation.sql` (undo in `supabase/rollbacks/`, test
`supabase/tests/moderation_test.sql`), function `supabase/functions/moderate-content/`, rules for
the automatic check in `supabase/functions/_shared/moderation.ts`. Modelled on pingmee-v2's
moderation (staff list, `is_staff`, audit log, `moderate-*` functions), adapted to Mahi's tables.

**Status: written and tested, not on production.** The owner's steps are at the end.

## What it does, in short

- Anyone can report a person, a post, a comment or a message, with a reason and an optional note.
  One report per person per thing; reporting again just says "already reported".
- Reports go on a list that only staff can read. Staff can dismiss a report, hide a post, remove a
  comment, warn someone, suspend them for some days, or (admins only) ban and unban them. Every
  action needs a reason and is written to an audit log.
- A hidden post or removed comment is kept (so a mistake can be undone) but nobody except staff
  sees it: it's left out of the feed, profiles, comment lists and comment counts.
- An automatic check reads every new post (caption and photos) and comment with OpenAI's free
  moderation model, and puts anything worrying on the staff list. It does nothing until the owner
  sets an OpenAI key and deploys the function.

## The data

| Table | What it holds | Who can read it |
| --- | --- | --- |
| `staff_users` | Staff: `user_id`, `role` (`admin` or `moderator`) | You: your own row. Nobody writes it from an app; the owner adds rows in a migration |
| `user_reports` | Every report (people's and the automatic check's) | You: your own reports. Staff: all |
| `user_sanctions` | Warnings, suspensions and bans, with their reasons | You: your own. Staff: all |
| `moderation_actions` | The audit log: one row per staff (or automatic) action | Staff |
| `moderation_scans` | The automatic check's queue and results | Staff |
| `posts.hidden_at`, `hidden_by`, `hidden_reason` | A hidden post | Hidden posts can be read only by staff |
| `post_comments.removed_at`, `removed_by`, `removed_reason` | A removed comment | Removed comments can be read only by staff |
| `app_config.ai_auto_hide` | Switch: should the automatic check hide things by itself? Starts **off** | — |

`profiles.is_banned` stays the one switch every rule already reads (feed, profiles, posting,
pushes, invites). A suspension or ban sets it; `user_sanctions` says why and until when.

### A report (`user_reports`)

| Column | Meaning |
| --- | --- |
| `id` | uuid |
| `reporter_id` | Who reported (null for the automatic check) |
| `target_type` | `user`, `post`, `comment` or `message` |
| `target_id` | The id of that person, post, comment or message |
| `target_owner_id` | Whose it is (the person, the post's or comment's author, the message's sender) |
| `reported_user_id` / `reported_post_id` / `reported_comment_id` / `reported_message_id` | The same target in its own column (a comment report also has its post) |
| `reason` | A reason code (below) |
| `description` | The reporter's note, up to 500 characters |
| `snapshot` | A copy of what was reported when it was reported (caption and photo paths, comment or message text, or the person's name), kept even if it's deleted later |
| `source` | `user` or `ai` |
| `status` | `open`, `reviewing`, `actioned` or `dismissed` |
| `ai_labels`, `ai_scores` | For the automatic check: which categories it found and the scores |
| `reviewed_by`, `reviewed_at`, `resolution_note` | Who closed or took it, when, and their note |
| `created_at`, `updated_at` | Times |

### Report reasons

The app shows the label; it sends the code.

| Code | Label for people |
| --- | --- |
| `spam` | Spam |
| `harassment` | Bullying or harassment |
| `hate_speech` | Hate speech |
| `sexual_content` | Nudity or sexual content |
| `violence` | Violence or threats |
| `self_harm` | Self-harm or suicide |
| `scam` | Scam or fraud |
| `impersonation` | Pretending to be someone else |
| `underage` | May be under 13 |
| `inappropriate_content` | Something else that's not OK (kept for apps already on phones) |
| `other` | Something else |

### Statuses

| Status | Means | Set by |
| --- | --- | --- |
| `open` | New, nobody has looked yet | Reporting |
| `reviewing` | A staff member has taken it | `staff_review_report` |
| `actioned` | Something was done (post hidden, comment removed, person warned, suspended or banned) | The staff actions |
| `dismissed` | Looked at, nothing wrong | `staff_dismiss_report` |

An action closes every open or reviewing report on the same thing as `actioned`, not just the
one it came from.

### Staff roles

| Role | Can |
| --- | --- |
| `moderator` | Read the list and the log; review, dismiss; hide/unhide posts; remove/restore comments; warn; suspend |
| `admin` | All of that, plus ban and unban |

Staff can't suspend or ban other staff from the portal. To add someone (the owner, in a new
migration): `insert into public.staff_users (user_id, role) values ('<their user id>', 'admin');`

## Calls for the app

All are Supabase RPCs (`supabase.rpc(name, args)`) for a signed-in person.

### Reporting

| Call | Arguments | Returns |
| --- | --- | --- |
| `report_user` | `p_user_id uuid`, `p_reason text`, `p_details text` (optional) | `{ report_id, already_reported }` |
| `report_post` | `p_post_id uuid`, `p_reason`, `p_details` | same |
| `report_comment` | `p_comment_id uuid`, `p_reason`, `p_details` | same |
| `report_message` | `p_message_id uuid`, `p_reason`, `p_details` | same |

- A repeat returns the first report with `already_reported: true` (no error), so the app can say
  "You've already reported this".
- Errors (Postgres code, message): `22023 unknown reason`, `22023 details are at most 500
  characters`, `22023 that does not exist` (including a message from a conversation you're not
  in), `22023 you cannot report yourself`, `P0001 too many reports today` (30 a day),
  `42501 not signed in`.
- The app's existing report (an insert into `user_reports` with `reporter_id`, `reported_user_id`
  or `reported_post_id`, `reason`, `description`, and error `23505` = "Already reported") keeps
  working unchanged for apps already on phones. New app code should use the calls above.

### Your standing

| Call | Arguments | Returns |
| --- | --- | --- |
| `get_my_standing` | — | `{ status: 'ok' \| 'suspended' \| 'banned', until: timestamp \| null, reason: text \| null, warnings: [{ id, reason, created_at }] }` |
| `mark_warnings_seen` | — | nothing; the warnings stop appearing in `get_my_standing` |

`warnings` lists warnings not yet marked seen. `until` is set only for a suspension. While
suspended or banned, a person can't post, comment, claim invites or get pushes, and nobody sees
their posts (all existing `is_banned` rules). A suspension or ban also signs them out on every
phone (their sessions and refresh tokens are deleted, `20261006160000_sign_out_on_ban`; the
current access token lasts at most an hour). They can sign in again and then see they're banned.

### Follow back

`get_follow_data(p_current_user_id, p_target_user_id)` now returns a fourth column,
`follows_you boolean`: they follow you. With `is_following = false` and `follows_you = true` the
profile can say "Follow back". The first three columns are unchanged
(`20261006110000_follow_back`).

## Calls for the staff portal

The portal signs staff in with Supabase Auth like the app. Every call below raises
`42501 staff only` for someone not in `staff_users` (and `42501 admins only` for a moderator
calling ban/unban). Every action needs a non-empty `p_reason` (`22023 a reason is needed`); the
reason is kept in the audit log, and for warnings, suspensions and bans it's what the person sees.

| Call | Arguments | Returns |
| --- | --- | --- |
| `my_staff_role` | — | `'admin'`, `'moderator'` or null. Use it to gate the portal |
| `is_staff` | — | boolean |
| `staff_get_queue` | `p_status` (default `'open'`; null = all), `p_target_type` (null = all), `p_limit` (default 50, max 200), `p_before timestamptz` (paging: the last item's `created_at`) | A list of report items, newest first |
| `staff_get_report` | `p_report_id` | One report item plus `other_reports` (on the same thing or anything of the same person), `sanctions` (the person's warnings, suspensions, bans), `actions` (audit rows on the report, the thing and the person), `scans` (automatic checks of the thing) |
| `staff_review_report` | `p_report_id` | The report item, now `reviewing` |
| `staff_dismiss_report` | `p_report_id`, `p_note` (optional) | The report item, now `dismissed` |
| `staff_hide_post` | `p_post_id`, `p_reason`, `p_report_id` (optional) | `{ ok, reports_closed }` |
| `staff_unhide_post` | `p_post_id`, `p_reason` | `{ ok, reports_closed: 0 }` |
| `staff_remove_comment` | `p_comment_id`, `p_reason`, `p_report_id` (optional) | `{ ok, reports_closed }` |
| `staff_restore_comment` | `p_comment_id`, `p_reason` | `{ ok, reports_closed: 0 }` |
| `staff_remove_message` | `p_message_id`, `p_reason`, `p_report_id` (optional) | `{ ok, reports_closed }` |
| `staff_restore_message` | `p_message_id`, `p_reason` | `{ ok, reports_closed: 0 }` |
| `staff_warn_user` | `p_user_id`, `p_reason`, `p_report_id` (optional) | `{ ok, reports_closed }` |
| `staff_suspend_user` | `p_user_id`, `p_reason`, `p_days` (1–365), `p_report_id` (optional) | `{ ok, reports_closed }` |
| `staff_ban_user` (admin) | `p_user_id`, `p_reason`, `p_report_id` (optional) | `{ ok, reports_closed }` |
| `staff_unban_user` (admin) | `p_user_id`, `p_reason` | `{ ok, reports_closed: 0 }`; lifts every suspension and ban |

A **report item** is:

```json
{
  "id": "uuid", "status": "open", "source": "user", "reason": "harassment",
  "details": "text or null", "created_at": "…", "updated_at": "…",
  "reviewed_by": null, "reviewed_at": null, "resolution_note": null,
  "ai_labels": null, "ai_scores": null,
  "target_type": "comment", "target_id": "uuid",
  "snapshot": { "content": "what it said when reported", "created_at": "…" },
  "reporter": { "id": "uuid", "username": "sam" },
  "owner": { "id": "uuid", "username": "alex", "display_name": "Alex", "avatar_url": "…", "is_banned": false },
  "target": { "id": "uuid", "post_id": "uuid", "content": "…", "created_at": "…", "removed_at": null, "removed_reason": null },
  "open_reports_on_target": 2
}
```

`target` is the thing as it is now (null if deleted; use `snapshot`):
post `{ id, caption, image_path, pov_image_path, rear_media_type, front_media_type, created_at,
hidden_at, hidden_reason }`; comment `{ id, post_id, content, created_at, removed_at,
removed_reason }`; message `{ id, conversation_id, content, created_at, removed_at, removed_reason }`; user `{ id, username,
display_name, avatar_url, is_banned }`. Photo paths are in the `posts` storage bucket; staff may
open any post's files (the storage read rule allows staff once the bucket is made private).
Staff see a message only when it has been reported; they can't read conversations.

Staff can also read the tables directly (`user_reports`, `user_sanctions`, `moderation_actions`,
`moderation_scans`) for lists like "everything done this week".

### The audit log (`moderation_actions`)

`id, staff_id, action, target_type, target_id, report_id, reason, metadata, created_at`.
`action` is one of `review_report`, `dismiss_report`, `hide_post`, `unhide_post`,
`remove_comment`, `restore_comment`, `remove_message`, `restore_message`, `warn_user`, `suspend_user` (metadata `{ ends_at }`),
`ban_user`, `unban_user`, and for the automatic check `ai_hide_post`, `ai_remove_comment`
(`staff_id` null, metadata `{ scan_id }`).

Suspensions end on their own: a job every 5 minutes (`lift_ended_suspensions`) lifts any that
have run out and clears `is_banned` unless a ban or another suspension is still running.

## The automatic check

1. Every new post and comment adds a row to `moderation_scans` (`pending`). This never stops
   anyone posting.
2. Every minute, a job (`invoke_moderate_content`) wakes the `moderate-content` function — but
   only if checks are waiting **and** the owner has set the Vault secrets `moderate_content_url`
   and `moderate_content_secret`. Until then nothing leaves the database.
3. The function takes up to 20 checks (`claim_moderation_batch`). **If `OPENAI_API_KEY` isn't
   set it checks nothing:** it closes them as `skipped` and logs
   "OPENAI_API_KEY is not set: N check(s) skipped".
4. With the key, it sends the caption or comment text, and each photo (a 10-minute private link),
   to OpenAI's `omni-moderation-latest` model (free). Videos are not sent (the model reads text and
   images only); a video post's caption still is.
5. It turns the scores into `clean`, `flag` or `block` with the thresholds in
   `supabase/functions/_shared/moderation.ts` (copied from pingmee-v2; strict on sexual content).
   `flag` and `block` put an AI report (`source: 'ai'`, `reporter` null, `ai_labels`,
   `ai_scores`, reason picked from the strongest category) on the staff list.
6. Only if `app_config.ai_auto_hide` is switched on does a `block` also hide the post or remove
   the comment at once (logged as `ai_hide_post` / `ai_remove_comment`). It starts **off**: the
   check only flags, people decide.
7. A failed check is tried again (3 tries), then closed as `error`. Checks waiting more than
   7 days are closed as `skipped` rather than run late. Checks skipped for want of a key are not
   re-run once the key is set; only new posts and comments are checked from then on.

## Owner steps to put it live

**Done 2026-10-06:** all of these are applied to production (through `20261006170000_signed_in_reads`), and the three staff admins are added. What remains is step 5 (the automatic check, waiting for an OpenAI key). The steps stay here as the record. Run from the repo root. Four new migrations go in order, after the
two that are already waiting (`20261002190000_tag_and_feed_pushes`, `20261003120000_tag_slots`):

```
20261006100000_moderation            reports, staff, actions, hiding, the automatic check's queue
20261006110000_follow_back           "follows you" on the profile
20261006120000_push_deadline_wording push words with a day and time, worked out when sent
20261006130000_private_details       date of birth and phone number readable only by their owner
```

1. **Dry run** (applies everything and runs the tests in one transaction on production, then
   rolls it all back):
   ```
   scripts/db.sh try supabase/migrations/20261002190000_tag_and_feed_pushes.sql \
     supabase/migrations/20261003120000_tag_slots.sql \
     supabase/migrations/20261006100000_moderation.sql \
     supabase/migrations/20261006110000_follow_back.sql \
     supabase/migrations/20261006120000_push_deadline_wording.sql \
     supabase/migrations/20261006130000_private_details.sql \
     supabase/tests/private_details_test.sql supabase/tests/profile_update_columns_test.sql \
     supabase/tests/moderation_test.sql supabase/tests/follow_back_test.sql \
     supabase/tests/push_deadline_wording_test.sql supabase/tests/tag_feed_pushes_test.sql \
     supabase/tests/tag_slots_test.sql supabase/tests/feed_lock_test.sql
   ```
   Every line should start `ok`; it ends with no `not ok` and no `ERROR`.
2. **Backup:** `scripts/db.sh backup`
3. **Push:** `scripts/db.sh push --dry-run` (check the list), then `scripts/db.sh push`.
4. **Add staff** (yourself first) in a new migration, then push it:
   `insert into public.staff_users (user_id, role) values ('<your user id>', 'admin');`
5. **The automatic check** (skip to leave it off — reports and staff actions work without it):
   1. Make a long random secret: `SECRET=$(openssl rand -hex 32)`.
   2. Function secrets:
      `supabase secrets set MODERATE_CONTENT_SECRET="$SECRET" OPENAI_API_KEY=<key> --project-ref pzepodsppqtvptzmwxzs`
      (leave out `OPENAI_API_KEY` to deploy it switched off: it then only logs and skips).
   3. Deploy: `supabase functions deploy moderate-content --no-verify-jwt --project-ref pzepodsppqtvptzmwxzs`
      (with `SUPABASE_ACCESS_TOKEN` set to the Mahi token).
   4. Let the database call it — two Vault secrets, typed in like the push ones
      (`docs/go-live-runbook.md`, "Let the database call it"), never written into a migration:
      ```bash
      psql "host=aws-1-eu-west-2.pooler.supabase.com port=5432 dbname=postgres user=postgres.pzepodsppqtvptzmwxzs sslmode=require" \
        -v ON_ERROR_STOP=1 -v secret="$SECRET" <<'SQL'
      select vault.create_secret('https://pzepodsppqtvptzmwxzs.supabase.co/functions/v1/moderate-content', 'moderate_content_url');
      select vault.create_secret(:'secret', 'moderate_content_secret');
      SQL
      ```
   5. Check after a new post: `select status, decision, error from public.moderation_scans order by id desc limit 5;`
      `done` = working; `skipped` with "no OPENAI_API_KEY" = deployed but switched off.
   6. To let it hide things by itself (not recommended until you trust it), a one-line
      migration: `update public.app_config set ai_auto_hide = true;`
6. **To switch the check off again:** remove `OPENAI_API_KEY`
   (`supabase secrets unset OPENAI_API_KEY --project-ref pzepodsppqtvptzmwxzs`) — checks are then
   skipped — or delete the Vault secrets so nothing is sent at all:
   `psql "<same connection as step 5.4>" -c "delete from vault.secrets where name in ('moderate_content_url','moderate_content_secret');"`
7. **Undo** (each in reverse order): `supabase/rollbacks/20261006130000_private_details.rollback.sql`,
   `…20261006120000_push_deadline_wording.rollback.sql`,
   `…20261006110000_follow_back.rollback.sql`, `…20261006100000_moderation.rollback.sql`.

Safe for every app already on phones: their report button, feed, profiles and comments keep
working. The only change they see is that a hidden post or removed comment disappears. After
`private_details`, sign-up still saves the date of birth and phone number (moved to a private
table only the person can read); other people's profiles simply come back without them.

## Not covered

- A ban doesn't stop the person signing in again (they then see they're banned). To lock them
  out of signing in, ban them in Supabase Auth as well (dashboard → Authentication → user → Ban).
- A removed message disappears from a conversation that's already open only when it reloads.
- Staff see a message only when it's reported; there's no list of a person's messages.
- Videos and profile photos aren't checked automatically.
- The `posts` storage bucket is still public, so a hidden post's photo link keeps working for
  anyone who already has it, until `supabase/deferred/private_bucket.sql` goes in.

## Added 2026-10-06 (applied to production the same day)

- `20261006150000_staff_remove_message`: staff remove (and restore) a reported message. It's
  kept, but left out for both people: `get_messages`, the inbox's last message and unread count,
  and direct reads of `messages`. Logged as `remove_message` / `restore_message`. In the portal,
  "Remove message" shows on a message report. Test `tests/staff_remove_message_test.sql`.
- `20261006160000_sign_out_on_ban`: suspending or banning someone signs them out (see "Your
  standing"). Test `tests/sign_out_on_ban_test.sql`.
- `20261006170000_signed_in_reads`: `get_feed_posts` and `get_follow_data` are for signed-in
  callers only (the app never calls them signed out). Test `tests/signed_in_reads_test.sql`.

Undo files for each are in `supabase/rollbacks/`. The `posts` bucket stays public on purpose
(older builds need it; `supabase/deferred/private_bucket.sql` waits for the update gate).
