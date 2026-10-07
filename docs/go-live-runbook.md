# Go-live runbook — the database changes

For the owner to run, on their own machine. Nobody else touches production.

> **Status (checked against prod 2026-10-06):** done. Production is current through
> `20261006201000_optional_non_user_tags`; the Q1–Q10 changes were backed up, rehearsed and applied
> before OTA 12.16. Steps 0–4 stay here as the procedure for the
> next database change (back up → `try` → `push --dry-run` → `push` → `test`). What's left is under
> **After this**.

Twelve database changes were written, tested and committed before any of them went live. This is
the order they were applied in, the exact commands, and what to check after each one.

**Read this first.** Do **not** paste the SQL into the Supabase dashboard's SQL editor. The
dashboard doesn't record what it ran, so production and this repo drift apart — that drift is
what Phase 0 spent a day untangling. The commands below apply the same files *and* write them
into the migration history, so next time anyone asks "what's live?", the answer is accurate.

---

## What you are applying

In this order (the tool sorts by the timestamp in the filename — you don't choose):

| # | Change | What it does |
| --- | --- | --- |
| 1 | `reconcile_drift` | Records the one setting made by hand in the dashboard (profile-photo storage). Changes nothing else. |
| 2 | `secure_toggle_like` | **Security fix.** Today any signed-in person can like or unlike as someone else. |
| 3 | `pgtap` | Adds the test framework the checks below run on. |
| 4 | `timezone_postdate` | Dates each post (`post_date`) in the person's own time zone; stats, points and the feed use it. |
| 5 | `push` | Push notifications: queue, quiet hours, the job that sends them. |
| 6 | `tag_challenges` | The core loop: posting in one step, 3 tags, 48-hour deadlines, reminders. |
| 7 | `app_version_gate` | Lets you ask old app versions to update. |
| 8 | `feed_lock` | Friends-only feed, locked until you post. |
| 9 | `points` | The first points system (a point for tagger and answerer, 3 a day). Replaced on 2026-10-02 by `20261002170000_mahi_points`: one Mahi point per answering post, back to 0 on a missed tag. |
| 10 | `messages` | One send path for chat, unread counts — and fixes blocking, which fails today. |
| 11 | `invites` | Invite links for people not on Mahi. |
| 12 | `stats_views` | The tables of numbers for judging the beta. Read-only. |

All twelve are safe for the app people have on their phones today. Nothing here removes anything
the current app uses — those steps are deliberately held back until a new app build is in the
stores (see `supabase/deferred/`).

---

## Step 0 — one time only: the password

Supabase → your project → Project Settings → Database → Database password. If you don't have it,
"Reset database password" on that page is safe: nothing in the app uses it. The app connects with
a separate API key.

In Terminal:

```bash
echo 'aws-1-eu-west-2.pooler.supabase.com:5432:postgres:postgres.pzepodsppqtvptzmwxzs:YOUR_PASSWORD' >> ~/.pgpass
chmod 600 ~/.pgpass
```

That file is the standard place Postgres tools look. It stays in your home folder, readable only
by you, and is never part of this repo. When you're done you can delete the line.

Then, in Terminal, move into the project:

```bash
cd ~/workspace/mahi
```

Every command below is run from there.

---

## Step 1 — take a backup

```bash
./scripts/db.sh backup
```

**Expect:** two files listed, both with today's date, in `supabase/backups/` — one `_schema.sql`
and one `_data.sql`. They are not committed to the repo.

**If it fails:** usually the password. Check for a typo in the line you added to `~/.pgpass`.

Don't skip this. The push refuses to run without a backup less than an hour old.

---

## Step 2 — rehearse every change on production

This applies all twelve changes to the real database, runs one set of checks, then **undoes
everything**. Nothing is left behind. It's the difference between "works on a copy" and "works on
your actual data".

```bash
for t in supabase/tests/*.sql; do
  echo "== $t"
  ./scripts/db.sh try supabase/migrations/20260917*.sql supabase/migrations/20260923*.sql "$t" \
    || { echo "STOPPED — $t failed"; break; }
done
```

It runs ten times, once per set of checks. Expect a minute or so each.

**Expect:** each block ends with lines starting `ok 1`, `ok 2`, … and no line starting `not ok`.
160 checks in total across the ten.

**If anything says `not ok` or `STOPPED`:** stop here and send me the output. Nothing has been
applied — every rehearsal rolls itself back. Do not carry on to Step 3.

---

## Step 3 — apply them

First see what it intends to do, without doing it:

```bash
./scripts/db.sh push --dry-run
```

**Expect:** a list of the twelve filenames, and nothing else.

If that list is right:

```bash
./scripts/db.sh push
```

**Expect:** it works through the twelve in order and finishes without an error.

**If one of them fails partway:** the ones before it are already applied — they don't undo
themselves. Stop, don't retry, and send me the output. Each change has a matching undo file in
`supabase/rollbacks/`, and I'll tell you which to run. This is why Step 1 and Step 2 come first.

---

## Step 4 — check it landed

```bash
./scripts/db.sh test
```

**Expect:** the same 160 `ok` lines, this time against the live database with everything applied.
These checks create their own temporary data and undo it, so they leave nothing behind.

Then open the app on your phone — the one currently in the store — and check the ordinary things
still work: the feed loads, you can like a post, you can send a message. All twelve changes are
built to leave the current app untouched, and this is how we confirm it.

---

## After this

The database is ready. The app runs on the preview lane (native build 10, OTA updates since); nothing
is in the stores yet. Still to do, in order:

0. **Reactive posting** (not pushed yet; rules in [architecture.md](./architecture.md#reactive-posting)),
   in this order: push `20261001120000_reactive_posting` (Steps 1–4 above) → publish the OTA → push
   `20261001170000_drop_rest_days` only once every phone has the new app (old builds still insert
   `fitness_routine` at sign-up and read the dropped columns).
1. **Push notifications** — the ordered steps are in
   [Switching push notifications on](#switching-push-notifications-on) below. No new native build
   is needed for iPhone. `push-core` stays absent from PostHog (off) until step 6 there.
2. **Invite landing page** — host `/i/<token>`, `/.well-known/apple-app-site-association` and
   `/.well-known/assetlinks.json` on `togethermahi.com` (the domain doesn't resolve yet). Until then
   invite links open nothing; the 6-character code works.
3. **The next native build** — remove the unused microphone text from `app.config.js`, add
   `expo-symbols`. Test it on a device before any store release.
4. **Store release**, then raise the minimum version. Before any build, run:

   ```bash
   pnpm release:check
   ```

   It refuses if a migration would set the minimum app version higher than the version you're
   shipping — which would put every user behind an update screen with no update to install.
   CI runs it too.
5. **The held-back steps** in `supabase/deferred/` (`contract_posting`, `contract_messages`,
   `private_bucket`) — only once that build is in both stores.

---

## Switching push notifications on

For the owner to run, in this order. Written 2026-10-02; nothing here has been run.

**Does it need a new native build? No, not for iPhone.** Build 10 already contains the
notifications module and Apple's push permission: checked 2026-10-02 in the build file itself
(EAS build `2b2d870f`, 2026-09-30, commit `a98e627` — it carries `ExpoNotifications` and is signed
with `aps-environment: production`; `expo-notifications` has been in `package.json` since
`dcc1b79`, 2026-09-17). The app side — the "turn on notifications" page and the camera's reminder
line — is JavaScript only, so it goes out as an OTA update. Android is separate: it needs Google's
FCM credentials and its own first build.

**What is on production today** (checked against prod 2026-10-02, read-only):

| Piece | State |
| --- | --- |
| `send-push` function | Not deployed (7 other functions are live) |
| Vault secrets `send_push_url`, `send_push_secret` | Neither exists (the Vault is empty) |
| Function secret `SEND_PUSH_SECRET` | Can't be read from outside; treat as not set |
| `pg_cron` 1.6.4, `pg_net` 0.19.5 | Installed |
| Jobs `send-push` (every minute), `push-receipts` (every 15 minutes) | Active, and doing nothing: they skip until both Vault secrets exist |
| `push_tokens` | 0 rows — no phone has registered |
| `push_outbox` | 18 rows, none ever sent, 15 already due (likes, follows, tags, reminders, a message since 2026-10-01) |
| Latest migration | `20261002170000_mahi_points`; `20261002190000_tag_and_feed_pushes` is waiting |
| PostHog `push-core` | Does not exist, so it reads as off |

The 18 queued pushes are old news. They are not sent when push goes live: step 2's migration
makes the sender close anything more than an hour overdue instead of sending it.

### 1. Apple push key (EAS)

```bash
npx -y eas-cli@24.7.0 whoami          # must say togethermahi
npx -y eas-cli@24.7.0 credentials -p ios
```

Pick the `preview` profile. Under **Push Notifications** it should show a key (a Key ID, team
`733RLXDJNY`) — EAS made one during the first preview build. If it says none: choose
**Push Notifications: Manage your Apple Push Notifications Key** → **Set up a new key** and let EAS
create it. The key lives on Expo's servers, so adding it needs no rebuild. Nothing is needed for
Google until there is an Android build.

### 2. Database: try → backup → push

```bash
cd ~/workspace/mahi
scripts/db.sh try supabase/migrations/20261002190000_tag_and_feed_pushes.sql \
  supabase/migrations/20261003120000_tag_slots.sql supabase/tests/tag_slots_test.sql \
  supabase/tests/tag_feed_pushes_test.sql supabase/tests/push_test.sql \
  supabase/tests/tag_challenges_test.sql supabase/tests/invites_test.sql \
  supabase/tests/reactive_posting_test.sql supabase/tests/mahi_points_test.sql \
  supabase/tests/feed_lock_test.sql supabase/tests/video_posts_test.sql supabase/tests/stats_test.sql
scripts/db.sh backup
scripts/db.sh push --dry-run          # expect exactly: 20261002190000_tag_and_feed_pushes.sql
                                      #            and: 20261003120000_tag_slots.sql
scripts/db.sh push
```

The push sends every waiting migration, so the tag slots change (2026-10-03, switch `tag-slots`)
goes with this one; it is built on top of it. It changes nothing for the app on phones until
`tag-slots` is turned on — except that a post can no longer fill a slot with an invite while a
friend is free to tag (the owner's friends-first rule).

**Expect** from `try`: only `ok` lines (nothing is kept — it rolls itself back). Any `not ok` or
`ERROR`: stop and send the output. (Checked against prod 2026-10-03: all ten files passed.)
Undo, newest first: `supabase/rollbacks/20261003120000_tag_slots.rollback.sql`, then
`supabase/rollbacks/20261002190000_tag_and_feed_pushes.rollback.sql`.

### 3. The function and its secret

```bash
export SUPABASE_ACCESS_TOKEN=<Mahi token: Edge Functions and Secrets, read-write>
SECRET=$(openssl rand -hex 32)        # keep this Terminal window open until step 4 is done
supabase secrets set --project-ref pzepodsppqtvptzmwxzs SEND_PUSH_SECRET="$SECRET"
supabase functions deploy send-push --no-verify-jwt --project-ref pzepodsppqtvptzmwxzs

# It is live and refuses strangers (expect 401):
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://pzepodsppqtvptzmwxzs.supabase.co/functions/v1/send-push
# ...and answers the secret. Expect {"claimed":0} or {"claimed":N,...,"messages":0,...};
# "messages":0 means nothing went to a phone:
curl -s -X POST -H "X-Internal-Secret: $SECRET" -H "Content-Type: application/json" \
  -d '{"mode":"send"}' https://pzepodsppqtvptzmwxzs.supabase.co/functions/v1/send-push
```

The function's other two secrets, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, are built in.

### 4. Let the database call it (Vault)

The every-minute job reads two Vault secrets. They hold a secret value, so they are typed in
here, never written into a migration:

```bash
psql "host=aws-1-eu-west-2.pooler.supabase.com port=5432 dbname=postgres user=postgres.pzepodsppqtvptzmwxzs sslmode=require" \
  -v ON_ERROR_STOP=1 -v secret="$SECRET" <<'SQL'
select vault.create_secret('https://pzepodsppqtvptzmwxzs.supabase.co/functions/v1/send-push', 'send_push_url');
select vault.create_secret(:'secret', 'send_push_secret');
select name from vault.secrets order by name;   -- expect send_push_secret, send_push_url
SQL
```

From the next minute the job calls the function whenever something is due. With no phone
registered, nothing reaches anyone yet.

### 5. The app update

The page and the reminder line ship as an OTA update (`/version-control` skill; JavaScript only).
Publish it to preview and open the app twice on the phone so it lands. Nothing shows yet:
`push-core` is still off.

### 6. Turn push on for everyone, then test one push

1. In PostHog create the flag `push-core` (boolean, active) for **everyone, 100%** — never for
   one account first (owner, 2026-10-07: switches go on for everyone).
2. Force-quit and reopen Mahi. The page "When do you post on Mahi?" appears (after the welcome
   cards if you haven't closed them). Tap **Allow**, then **Allow** on the phone's own question.
3. Check a phone registered (a read-only query, with the `psql` connection from step 4):
   `select count(*) from public.push_tokens;` → 1.
4. Between 07:00 and 22:00 (quiet hours hold pushes until 07:00), from a second account like one
   of your posts. Within about a minute your phone shows **Mahi — @them liked your post**. Tap it:
   the notifications list opens.
5. From the second account, post and tag yourself: **You've just been tagged by @them. 48 hours
   left to post your Mahi!** Tap it: the camera opens.
6. Check it was recorded (read-only, same connection):
   `select kind, body, sent_at, error from public.push_outbox order by id desc limit 5;`
   → `sent_at` filled, `error` empty. `InvalidCredentials` means the Apple push key (step 1);
   `no_tokens` means the phone didn't register (look in Sentry for flow `push`);
   `DeviceNotRegistered` means that phone turned notifications off.

### 7. Everyone

Edit `push-core` in PostHog: remove the email condition, 100% of everyone. Update the
`push-core` line in the `#feature-flags` summary and post in `#push-notifications`.

### Settings you can change later

All in `app_config`, each a one-line migration (for example
`update public.app_config set feed_locked_push = false;`):

| Setting | Default | What it does |
| --- | --- | --- |
| `feed_lock_warning_push` | on | "Your feed locks in 1 hour…" |
| `feed_lock_warning_lead` | 1 hour | How long before the lock the warning goes; the words follow it |
| `feed_locked_push` | on | "Your feed is locked…" |
| `push_stale_after` | 1 hour | A push more overdue than this is closed, not sent |
| `quiet_start` / `quiet_end` | 22:00 / 07:00 | Quiet hours, in each person's own time zone |

### Rolling back

- **Stop asking people:** switch `push-core` off in PostHog. Phones that already allowed keep
  getting pushes.
- **Stop sending:** remove the Vault secrets; the job goes back to skipping.
  `psql "<same connection as step 4>" -c "delete from vault.secrets where name in ('send_push_url','send_push_secret');"`
  Pushes keep being queued; when sending is switched back on, anything more than an hour overdue
  is closed rather than sent.
- **Only the feed pushes:** the two switches above.
- **The wording and the feed pushes altogether:**
  `supabase/rollbacks/20261002190000_tag_and_feed_pushes.rollback.sql`.
- **The function:** `supabase functions delete send-push --project-ref pzepodsppqtvptzmwxzs`
  (after removing the Vault secrets, or the job logs a failed call every minute).
