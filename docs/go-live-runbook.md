# Go-live runbook — the database changes

For the owner to run, on their own machine. Nobody else touches production.

> **Status (checked against prod 2026-10-01):** done. The owner pushed these twelve on 2026-09-23
> (161 checks rehearsed, then re-run live), and every later migration since — through
> `20261001100100_account_delete_cascade` — the same way. Steps 0–4 stay here as the procedure for the
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
| 9 | `points` | Mahi points, capped at 3 a day. |
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
   `20261001120100_drop_rest_days` only once every phone has the new app (old builds still insert
   `fitness_routine` at sign-up and read the dropped columns).
1. **Push notification credentials** — upload the Apple push key and Google FCM credentials in
   EAS (`eas credentials`). Then set `SEND_PUSH_SECRET`, add the Vault secrets `send_push_url` and
   `send_push_secret`, and deploy `send-push` (not deployed yet). Only then create the `push-core`
   flag in PostHog — it is deliberately absent (off) until push works.
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
