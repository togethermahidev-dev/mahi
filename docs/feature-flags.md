# Feature Flags (PostHog)

Every feature — shipped or upcoming — is gated behind a PostHog feature flag. All flags are currently rolled
out **100% to existing and new users** (default-on); they exist so we can flip a feature off (kill-switch) or
do a gradual rollout later, and so each goal in the loop ([HANDOVER §4](./HANDOVER.md#4-the-goal-loop-goal-driven-development-process))
ships behind a flag that's already live.

PostHog project: **EU region, `project_id=130791`**.

## Reading a flag in the app

```ts
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

const showSuggestions = useFeatureFlag('follows-suggestions');
if (!showSuggestions) return null;
```

- Keys are the typed `FeatureFlag` union in [`src/lib/featureFlags.ts`](../src/lib/featureFlags.ts) — the single
  source of truth. Add a key there when you add a flag in PostHog.
- The hook is a thin `useSyncExternalStore` wrapper over the shared `posthog` singleton (no `PostHogProvider`),
  re-rendering whenever flags (re)load. `App.tsx` calls `posthog.reloadFeatureFlagsAsync()` after `identify`, and
  `posthog.reset()` on sign-out clears flags (so no sign-out reset wiring is needed — guardrail #6 is satisfied).
- **Default-on:** `resolveFlag` returns `true` when PostHog isn't configured (no key) or while flags haven't
  loaded yet, so a feature is never hidden by analytics being slow or absent. Only an explicit `false` hides it.
  This pure logic is unit-tested in [`src/lib/__tests__/featureFlags.test.ts`](../src/lib/__tests__/featureFlags.test.ts).
- Reference gate: the notifications bell in [`src/components/AppHeader.tsx`](../src/components/AppHeader.tsx) is
  gated by `notifications-core`.

## The flags

**Roadmap goals — Phases 1–5** (keys map to [feature-roadmap.md](./feature-roadmap.md) items):
`nav-rest-streak-unified` (1.1) · `messaging-search-entry` (1.2) · `messaging-row-split-taps` (1.3) ·
`nav-profile-entry-animation` (1.4) · `feed-action-buttons-polish` (2.1) · `profile-avatar-lightbox` (2.2) ·
`profile-posts-recovery-fix` (2.3) · `camera-pinch-zoom` (3.1) · `camera-ultrawide-lens` (3.2) ·
`camera-landscape` (3.3) · `posts-location-tagging` (4.1) · `follows-suggestions` (5.1)

**Shipped-surface kill-switches:**
`feed-core` · `messaging-core` · `camera-capture` · `follows-core` · `notifications-core` ·
`moderation-core` · `streaks-core` · `auth-otp-signup`

## Creating / managing flags

Flags are managed through the project-scoped **PostHog MCP** (`.mcp.json`, see below). Create a flag at 100% for
everyone: `active: true`, one release condition with `rollout_percentage: 100` and no property filters.

REST equivalent (used to seed the current set), `POST` to
`https://eu.posthog.com/api/projects/130791/feature_flags/` with `Authorization: Bearer <personal-api-key>`:

```json
{ "key": "my-flag", "name": "My flag", "active": true,
  "filters": { "groups": [{ "properties": [], "rollout_percentage": 100 }] } }
```

## MCP scoping & keys (project-specific)

Both backend MCPs are defined **only** in this repo's gitignored `.mcp.json` and enabled only in
`.claude/settings.json` — they do **not** load in any other project, and Mahi's `~/.claude.json` entry has no
user-scoped servers.

- **Supabase MCP** — pinned to `--project-ref=pzepodsppqtvptzmwxzs` (the Mahi project); it cannot reach any other
  Supabase project.
- **PostHog MCP** — `mcp-remote` to `https://mcp.posthog.com/mcp?project_id=130791`, authenticated with a
  **personal API key (`phx_…`)** passed via the `POSTHOG_AUTH_HEADER` env var. PostHog has a single MCP host
  (`mcp.posthog.com`) that auto-routes to your data region (EU here) from the key — there is **no**
  `eu.mcp.posthog.com` (that hostname has no DNS record). `?project_id=130791` pins the Mahi project.

**Two PostHog keys, two purposes — never mix them:**
- The app SDK uses the **public project key** (`phc_…`) via `EXPO_PUBLIC_POSTHOG_API_KEY` (safe to ship).
- The MCP uses the **personal API key** (`phx_…`), which lives **only** in `.mcp.json`. It must **never** go in
  `EXPO_PUBLIC_*` / `.env` — those are bundled into the shipped app.

**Hard project-lock for PostHog:** a personal API key reaches the whole PostHog org unless restricted. For a true
guarantee that this key only touches project 130791, scope it in PostHog → Settings → Personal API keys to that
project with `feature_flag:read` + `feature_flag:write` scopes only. Rotate the seed key before launch.
