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
layer (there is no backend server). Then regenerate types:

```bash
npx supabase gen types typescript --project-id <id> > src/types/database.ts
```

## 2. API — copy `src/api/follows.ts`

Create `src/api/bookmarks.ts`. Mirror `followUser` / `unfollowUser`: idempotent `upsert` + `delete`,
returning the **standard contract** `{ data: T | null, error: Error | null }` (wrap any Postgrest error
via `new Error(error.message)`). If you added an RPC, mirror `getFollowData` (call `supabase.rpc(...)`,
unwrap `data[0]`). Pure and stateless — no React, no Zustand.

Barrel-export it: add `export * from './bookmarks';` to `src/api/index.ts`.

## 3. Store — copy `src/store/followStore.ts` (the canonical optimistic + realtime template)

Create `src/store/bookmarkStore.ts`. Mirror exactly:

- `Record<string, boolean>` keyed state (`bookmarkedByMe`), like `followingByMe`.
- A `loadX` action that calls the API and `set()`s.
- A `toggleX` **optimistic** action: snapshot prev state → optimistic `set()` → `await api` → on error
  `console.log('[bookmarkStore] ...', error.message)` + roll back to the snapshot + `return { error }`.
- If realtime is needed, copy `subscribeToFollows` verbatim — the **module-level `Map` + `refCount`**
  channel registry and the unsubscribe closure are the pattern. **Never put channels in `set()` state.**
- A `reset()` that removes all channels and clears state.

Export it from `src/store/index.ts` (follow the `export { useFollowStore } from './followStore';` line).

> ⚠ **CRITICAL — the step most often forgotten:** add `useBookmarkStore.getState().reset()` to the
> sign-out branch in `App.tsx` (the `else` block alongside the other store resets). Omitting it leaks the
> previous user's state + live realtime channels into the next account on the same device — this was a
> real bug (`socialStore` shipped without it).

## 4. Hook — copy `src/hooks/useNotifications.ts`

Create `src/hooks/useBookmarks.ts`. Keep it **thin**: read `userId = useAuthStore(s => s.user?.id)`,
select store state, run a `[userId]`-keyed `useEffect` that `subscribe`s and returns `unsubscribe`, and
return `{ items, isLoading, toggle }` delegating to `useBookmarkStore.getState()` actions. **No business
logic in the hook** — it owns subscription lifecycle only.

## 5. UI — wire into a screen

Call `const { bookmarkedByMe, toggle } = useBookmarks()` and render the optimistic state. **Surface the
`{ error }`** the store action returns (don't swallow it). Use `useAppTheme().colors` — never hardcode hex.

## 6. Verify (red → green)

- `pnpm typecheck` passes. (Prove the gate works: inject a type error, see it go red, then revert.)
- Optimistic path **and** rollback path: kill the network, confirm the UI reverts.
- Sign out → sign in as a different user → confirm **no state leaks** (this is what the `reset()` wiring guarantees).

---

### Reference map

| Layer | Copy this file |
|---|---|
| API shape | `src/api/follows.ts` |
| Optimistic store | `src/store/followStore.ts` |
| Realtime registry | `followStore.subscribeToFollows` (module-level `Map` + ref-count) |
| Thin hook (no subscription) | `src/hooks/useFeed.ts` |
| Thin hook (with subscription) | `src/hooks/useNotifications.ts` |
| Sign-out reset wiring | `App.tsx` sign-out `else` block |
| Env access | `src/lib/env.ts` (never read `process.env` directly) |
