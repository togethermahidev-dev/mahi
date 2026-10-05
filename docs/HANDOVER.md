# Mahi — Engineering Handover & Operating Manual

The single entry point for continuing work on Mahi. Read this first. It encodes **what's built**, the
**rules that never change**, the **patterns to copy**, and the **goal-driven loop** every new feature runs through.

---

## 1. Where things stand

**Architecture (stable — do not rewrite).** React Native + Expo talking directly to Supabase, no backend server.
5 layers, dependencies flow downward only:

```
screens/components → hooks → stores (Zustand, optimistic) → api ({data,error}) → lib → supabase
                                                                                   (db · RLS · RPCs · edge fns · storage · realtime)
```

Full data flow + the per-layer import contract: [architecture.md](./architecture.md#layering-contract).

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

**State on 2026-10-05 (newest first; older notes below):**
- **Phones:** build 12 (there is no build 11 — the numbers went 10 → 12) on the preview iPhones and
  TestFlight, both on the `preview` channel; latest update 12.06. Build 12 carries everything the
  notes below call "build 11" (video, Apple icons, hold to preview, Didit, RevenueCat, tap to focus)
  plus the phone's own tab bar.
- **Navigation:** one row of swipe pages, Camera ⇄ Feed ⇄ Profile ⇄ Messages, sideways only, with the
  tab bar on build 12 in the same order (decisions #60–#64). Search: the magnifier on the Profile
  screen, in Messages, and "Find friends" on an empty feed.
- **This round (12.04–12.06):** pinch to zoom on post photos (no switch), profile picture as a circle
  (tap outside to close), smooth swipe off a profile, like/comment higher, live countdown on the open
  feed, a "No tags to answer" card, invites that carry their code, refused posts keep their photos.
- **Waiting on the database push (owner):** `20261002190000_tag_and_feed_pushes` and
  `20261003120000_tag_slots` go together ([go-live-runbook.md](./go-live-runbook.md) step 2). The
  tag-slots screen stays behind `tag-slots` (off) until then.
- **Waiting on the team:** Q1–Q8 in Slack #questions-and-answers (decisions #65–#72); the invite-guard
  database change is held until they're answered.
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
  Changes ship as OTA updates (history in `src/constants/ota.ts`); see the `/version-control` skill.
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
- **Earlier hardening still in force:** typed `src/lib/env.ts`, `ErrorBoundary`, every store reset on
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
  - *Didit:* make an account at business.didit.me; build a workflow (ID document + liveness + face match,
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
  - *RevenueCat + App Store Connect:* sign the Paid Apps Agreement (banking and tax) in App Store Connect;
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
5. **Config through `src/lib/env.ts`.** Never read `process.env.*` directly.
6. **Every new store's `reset()` is wired into the `App.tsx` sign-out branch.** (Forgetting this is the exact bug that leaked one user's state into the next.)
7. **Security is server-side.** RLS is the only authorization layer — every new table/RPC must have correct, owner-scoped policies, version-controlled in `supabase/migrations/`. Anything a malicious client could forge (verification, counts, ownership) lives in an RLS policy or a `SECURITY DEFINER` RPC, never in the client.
8. **Styles from tokens** — every colour, size, spacing, radius, opacity, motion, swipe, wait and font from
   `src/constants/tokens.ts` / `fonts.ts` (`designTokens.test.ts` and `fonts.test.ts` fail otherwise). Inter
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

| Need | Copy |
|---|---|
| API function | `src/api/follows.ts` |
| Optimistic store + realtime registry | `src/store/followStore.ts` |
| Thin hook (sync on mount) | `src/hooks/useFeed.ts` |
| Thin hook (subscription lifecycle) | `src/hooks/useNotifications.ts` |
| DB table + RLS + RPC | `follows` table + `get_follow_data` in `supabase/migrations/` |
| User-facing failure feedback | `useToastStore.getState().show(...)` |
| Native page sheet | `BlockedUsersSheet.tsx` (`<Modal presentationStyle="pageSheet">`) |
| Page swipe / spring | `HorizontalNavigator.tsx` + `src/lib/swipeRules.ts` (`SPRING.page`, `SWIPE` in tokens) |
| Pure, tested UI rules | `src/lib/feedLock.ts` + `src/lib/__tests__/feedLock.test.ts` |
| Gate a feature behind a flag | `useFeatureFlag('flag-key')` (keys in `src/lib/featureFlags.ts`; see [feature-flags.md](./feature-flags.md)) |

---

## 4. The Goal Loop (goal-driven development process)

We work as a **loop over specific goals** — one goal at a time, each taken to "done" through the same pipeline
before the next starts. A "goal" = one roadmap item (e.g. *"1.3 Split Messages row taps"*) or one backlog item.

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

```bash
pnpm typecheck      # tsc --noEmit (CI gate; supabase/ is excluded — it's Deno)
pnpm test           # jest (pure-logic tests, design-token, font and sentence-case guards)
pnpm test:scripts   # script, guard-hook and email-token tests
pnpm tokens:email   # regenerate the code email's tokens after a token change (then redeploy its functions)
scripts/db.sh local # replay every migration on a throwaway local Postgres and run the pgTAP tests
pnpm lint           # eslint src
pnpm format         # prettier --write src
pnpm start          # expo
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
