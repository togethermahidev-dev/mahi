# Adding a Full-Stack Feature

This is the canonical recipe for adding one feature end-to-end. **Copy the referenced files as
templates** so you never invent structure — every full-stack feature in Mahi follows the same
5-layer path (see the Layering Contract in [architecture.md](./architecture.md#layering-contract)).

Worked example: a **"saved posts / bookmarks"** feature.

> Dependency direction is strictly downward: `screen → hook → store → api → supabase`.
> The only legal sideways import is store→store for a documented cross-store effect.

---

## 1. Database (do this first)

Create the table + RLS, mirroring the existing `follows` table. Add a `SECURITY DEFINER` RPC **only**
if the operation must validate `auth.uid()` server-side or return aggregate counts (mirror
`get_follow_data`); a simple owner-scoped insert/delete can stay a direct table op guarded by RLS.

Every table needs owner-scoped `INSERT`/`UPDATE`/`DELETE` policies — RLS is the only authorization
layer (there is no backend server).

Schema changes go **only** through a migration file (`supabase migration new <name>`) with a matching
`supabase/rollbacks/<name>.rollback.sql` and a pgTAP test in `supabase/tests/` — red before the
migration, green after (`scripts/db.sh local`). Never the dashboard SQL editor. Applying it to
production is the owner's step ([supabase/README.md](../supabase/README.md)). Then regenerate types:

```bash
npx supabase gen types typescript --project-id <id> > ui/src/types/database.ts
```

## 2. API — copy `ui/src/api/follows.ts`

Create `ui/src/api/bookmarks.ts`. Mirror `followUser` / `unfollowUser`: idempotent `upsert` + `delete`,
returning the **standard contract** `{ data: T | null, error: Error | null }` (wrap any Postgrest error
via `new Error(error.message)`). If you added an RPC, mirror `getFollowData` (call `supabase.rpc(...)`,
unwrap `data[0]`). Pure and stateless — no React, no Zustand.

Barrel-export it: add `export * from './bookmarks';` to `ui/src/api/index.ts`.

## 3. Store — copy `ui/src/store/followStore.ts` (the canonical optimistic + realtime template)

Create `ui/src/store/bookmarkStore.ts`. Mirror exactly:

- `Record<string, boolean>` keyed state (`bookmarkedByMe`), like `followingByMe`.
- A `loadX` action that calls the API and `set()`s.
- A `toggleX` **optimistic** action: snapshot prev state → optimistic `set()` → `await api` → on error
  `console.log('[bookmarkStore] ...', error.message)` + roll back to the snapshot + `return { error }`.
- If realtime is needed, copy `subscribeToFollows` verbatim — the **module-level `Map` + `refCount`**
  channel registry and the unsubscribe closure are the pattern. **Never put channels in `set()` state.**
- A `reset()` that removes all channels and clears state.

Export it from `ui/src/store/index.ts` (follow the `export { useFollowStore } from './followStore';` line).

> ⚠ **CRITICAL — the step most often forgotten:** add `useBookmarkStore.getState().reset()` to the
> sign-out branch in `ui/App.tsx` (the `else` block alongside the other store resets). Omitting it leaks the
> previous user's state + live realtime channels into the next account on the same device — this was a
> real bug (`socialStore` shipped without it).

## 4. Hook — copy `ui/src/hooks/useNotifications.ts`

Create `ui/src/hooks/useBookmarks.ts`. Keep it **thin**: read `userId = useAuthStore(s => s.user?.id)`,
select store state, run a `[userId]`-keyed `useEffect` that `subscribe`s and returns `unsubscribe`, and
return `{ items, isLoading, toggle }` delegating to `useBookmarkStore.getState()` actions. **No business
logic in the hook** — it owns subscription lifecycle only.

## 5. Flag — add `saved-posts`

Add the key to `FEATURE_FLAGS` in `ui/src/lib/featureFlags.ts`, list it in [feature-flags.md](./feature-flags.md),
and gate the UI with `useFeatureFlag('saved-posts')`. Ask the owner to create it in PostHog at 100%
**before** the update ships — a key missing from PostHog reads as off once flags load.

## 6. UI — wire into a screen

Call `const { bookmarkedByMe, toggle } = useBookmarks()` and render the optimistic state. **Surface the
`{ error }`** the store action returns (don't swallow it). Every colour, size, spacing, radius, font,
opacity (`ALPHA`), animation (`DURATION`, `SPRING`), swipe (`SWIPE`), wait (`WAIT`) and layout share
(`LAYOUT`) comes from `ui/src/constants/tokens.ts` / `fonts.ts` — add a token if one is missing (the token
tests fail on raw values). Text is Inter only: pick a `FONTS` face, never `fontWeight`/`fontStyle`, no
italic, and only characters Inter can draw (`fonts.test.ts`). Colours that follow light/dark come from
`useAppTheme()` (or `themeColors(dark)`). Sentence-case labels, pop-ups and menus (`sentenceCase.test.ts`).
Put pure UI rules (wording, thresholds) in `ui/src/lib/` with a Jest test. A bottom-anchored sheet or composer ends with `<KeyboardInset />`; pop-ups are native page sheets.

## 7. Verify (red → green)

- `pnpm typecheck`, `pnpm test` and `pnpm lint` pass. (Prove the gate works: inject a failure, see it go red, then revert.)
- Optimistic path **and** rollback path: kill the network, confirm the UI reverts.
- Sign out → sign in as a different user → confirm **no state leaks** (this is what the `reset()` wiring guarantees).

---

### Reference map

| Layer | Copy this file |
|---|---|
| API shape | `ui/src/api/follows.ts` |
| Optimistic store | `ui/src/store/followStore.ts` |
| Realtime registry | `followStore.subscribeToFollows` (module-level `Map` + ref-count) |
| Thin hook (no subscription) | `ui/src/hooks/useFeed.ts` |
| Thin hook (with subscription) | `ui/src/hooks/useNotifications.ts` |
| Sign-out reset wiring | `ui/App.tsx` sign-out `else` block |
| Env access | `ui/src/lib/env.ts` (never read `process.env` directly) |
| Flag | `ui/src/lib/featureFlags.ts` + `useFeatureFlag` |
| Styles | `ui/src/constants/tokens.ts`, `ui/src/constants/fonts.ts`, `themeColors` in `ui/src/hooks/useAppTheme.ts` |
| Migration + rollback + test | `supabase/migrations/20261001100000_password_reset_codes.sql`, its rollback and `supabase/tests/password_reset_codes_test.sql` |
