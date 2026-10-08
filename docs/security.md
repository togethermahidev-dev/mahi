# Security rules

The one place for how Mahi stays safe. `CLAUDE.md` and `RULES.md` point here. Read it before any
database, server function, deep link, sign-in or staff portal change. Written after the full
review of 2026-10-08 (log at the bottom).

## How Mahi can be attacked

The app talks to Supabase directly with the public anon key and the person's sign-in token. There
is no backend server in between. So the database rules (row level security, RLS) and the
`security definer` functions are the only gate. Anyone can make an account, so "signed in" never
means "trusted": always ask what a stranger with a fresh account could read or write.

## Database

- **New table:** `enable row level security`, then `revoke all on <table> from anon, authenticated`
  and grant back only what the app needs. Supabase grants everything to `authenticated` by default,
  so a table with no revoke is open to every policy you write.
- **Writes go through server functions.** The app never inserts, updates or deletes rows that carry
  rules (posts, tags, follows, invites, messages, points, reports). A `security definer` function
  checks `auth.uid()` and the rules, then writes. A direct table write is allowed only for an
  owner-only row with no rules, and then with a column grant (`grant insert (col, col) …`), never a
  whole-table grant. The profile insert at sign-up is the model.
- **Private reads apply the visibility rule.** Posts, photos, locations, messages, contact matches
  and tokens are read through server functions, or through a policy that applies the same rule
  (`can_view_post`: follower, not blocked, not banned, feed lock). A policy that only checks
  `hidden_at`, or `using (true)`, is never enough for someone's content.
- **`security definer` functions:**
  - `set search_path = public`.
  - The caller comes from `auth.uid()`. Never trust a user id passed in.
  - `revoke execute … from public, anon`, then grant to the roles that need it. Internal helpers
    are revoked from `authenticated` too.
- **Storage:** buckets are private; the app shows files through signed URLs; the read policy
  applies the same visibility rule as the rows; uploads only into `<your user id>/`.
- **Old paths close with the new one.** When a server function replaces a direct table path,
  remove the old policy and grant in the same release, not "later". Before launch there are no
  store users, so there is nothing to wait for.
- **Every migration test proves both sides:** the owner's path works, AND a signed-in stranger is
  refused (error 42501 or zero rows). Red before the migration, green after (`scripts/db.sh local`).

## Server functions (supabase/functions)

- Each function checks its caller itself; never rely on the platform's JWT setting.
  - Functions acting for a person: read them from the Bearer token with `auth.getUser`. Never a
    user id from the request body.
  - Functions called by the database or cron (`send-push`, `moderate-content`): the
    `X-Internal-Secret` header, compared in constant time, refused when the secret is unset.
  - Webhooks (`didit-webhook`): check the signature over the raw body plus a time window; refuse
    when the secret is missing.
- The service role key stays on the server. Never `EXPO_PUBLIC_*` or `NEXT_PUBLIC_*`.
- **Codes** (sign-up, reset): store only the hash, expire in 10 minutes, and count tries on EVERY
  endpoint that checks a code (5 tries).
- **Accounts are created only by `complete-signup`.** It stamps the checked code
  (`otp_codes.signup_claimed_at`) right before creating the account, and the Before User Created
  hook refuses an email sign-up without a stamp from the last 5 minutes, so the public sign-up
  address can't be used to grab an email (20261008130000).
- **A password change signs out every session** (reset-password, and any future change-password).

## The app

- **Links and hand-offs are untrusted:** universal links, `mahi://` links, the App Clip handover,
  the share extension, push payloads, Spotlight, Siri and Control Centre. They may open a screen or
  fill something in. Anything that writes (claim an invite, follow, post, delete, accept) needs an
  on-screen confirm that says what will happen (for invites: "you'll automatically follow each
  other"). Not now = nothing written.
- **No personal data to PostHog or Sentry:** the account id only. No email, phone number, contacts,
  tokens, codes, search text or messages, and no city or postcode (`$geoip_disable`).
- **Unreleased features start off:** their switch is in `DEFAULT_OFF_FLAGS` and off in PostHog, and
  the iPhone side reads a missing switch as off.
- **The sign-in session lives in the keychain** (`ui/src/lib/sessionStorage.ts`, build 13+); never put
  tokens in AsyncStorage or any other plain storage.
- Show only what the server returned. Never build a photo address from a stored path yourself;
  ask the server for a signed URL.

## Staff portal (staff/)

- Every page and every server action calls `requireStaff()` itself. A layout check doesn't protect
  actions.
- Return paths after sign-in go through `safeNext` only.
- Anon key only; staff rights come from the staff functions in the database.

## Secrets

- Nothing secret in tracked files. Public by design: the Supabase anon key, PostHog `phc_` keys,
  Sentry DSNs. `.env` files are git-ignored; only `.env.example` is tracked.
- Production secrets are set by the owner (`supabase secrets set`, EAS environments).

## Reviews

- Run a full review (`/security-review`, whole repo: server functions, database, staff portal,
  app, website, secrets) before each native build and before launch.
- Each finding is checked by a second agent before it counts. Fixes follow the TDD and migration
  rules, and get a line in the log below.

## Known and accepted

- `check-email` says whether an email has an account. Sign-up needs it.
- Contacts are matched with unsalted SHA-256 hashes. The server doesn't keep them, and only the
  matched accounts come back.
- Invite codes are 6 characters; guessing is limited by rate limits.
- The `avatars` bucket is public: a profile photo opens by its address without signing in. Only the
  owner can list or change their folder, and `avatar_url` must point into it (20261008140000).

## Review log

### 2026-10-08: full review (server functions, database, staff portal, app, website, secrets)

| Finding | How bad | Fix | State |
|---|---|---|---|
| Any signed-in person could read every post row (caption, photo path, location) and every file; the feed lock and follows were checked only inside the feed functions | High | Posts policy applies `can_view_post`; posts bucket private with the same rule on files; `get_feed_posts` closed | Live 2026-10-08 (20261008100000) |
| Anyone could tag any non-friend on their post by writing to `post_tags`, and push-notify them | Medium | Direct writes to `post_tags` closed; tag notification skips blocked pairs and banned people | Live 2026-10-08 |
| Someone polling the public sign-up address could take an email while its owner was part-way through sign-up; a password reset didn't sign them out | Medium | Sign-up hook requires `complete-signup`'s stamp on the checked code; `complete-signup` counts code tries; `reset-password` signs out every session | Live 2026-10-08 (database + functions) |
| An invite link made a signed-in new account Friends with the sender with no confirm | Low–medium | Confirm sheet (Accept / Not now) before claiming; unread badge ignores blocked people | Next OTA |
| Direct writes to `posts` skipped `create_post` (bans, reactive posting, 3 tags, own media) | Low (game rules) | Direct post inserts closed | Live 2026-10-08 |
| A new account could set its own points and account age at sign-up | Low (game rules) | Profile insert limited to the sign-up columns | Live 2026-10-08 |
| `message_reactions_json` callable signed out; `get_suggested_follows` trusted a passed-in id; `check-email` read only the first 50 accounts | Low | Revoked; uses `auth.uid()`; looks the email up directly | Live 2026-10-08 |
| The sign-in session sat in plain app storage (AsyncStorage) | Low | Kept in the keychain (expo-secure-store, readable after first unlock, this device only); an old session moves over on first read | Committed; needs build 13 (builds 10–12 keep AsyncStorage) |
| Staff sign-in return path accepted a tab or newline (browsers drop them, turning it into another site's address) | Low | `safeNext` refuses control characters | Committed; live when the staff portal is hosted |
| Second review: reporting a post or comment you can't see showed you its copy; comment-like lists ignored the post's rule; comments and likes were readable on any post | Medium | Report copies staff-only; `get_comment_likes` / `get_comment_likers` and the comment and like read rules follow the post | Live 2026-10-08 (20261008120000, 20261008130000) |
| Live Supabase check 2026-10-08: the app could still write `follows` directly (follow across a block, follow-spam pushes); `avatar_url` could point anywhere (tracking image, someone else's photo); anyone could list every avatar file; signed-out callers could call the message reaction functions; anon kept table rights in `public` and authenticated kept truncate/references/trigger; the old direct report insert rule was still there; `answered_by_post` / `post_invites` (invite links) were callable by anyone | Medium | Follows only through `set_following` and no follow notice across a block or from a banned person; `avatar_url` must be this project's avatars address in your own folder; avatar files listable only by their owner (bucket stays public for image links); reaction functions signed-in only; anon has no table rights, authenticated no truncate/references/trigger (also for new tables); reports only through `report_*`; the two helpers internal; the unused direct follow and report calls removed from the app | Built; not pushed (20261008140000). Phones older than OTA 12.20 lose Follow once live |
