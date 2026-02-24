# Hooks

Custom hooks live in `src/hooks/`. They wrap library clients or encapsulate reusable logic.

## Current Hooks

### `useSupabase` — `src/hooks/useSupabase.ts`

Returns the shared Supabase client singleton.

```ts
import { useSupabase } from '@/hooks/useSupabase';

function MyComponent() {
  const supabase = useSupabase();
  // supabase.from('table').select(...)
}
```

Prefer this hook over importing `supabase` directly from `src/lib/supabase` inside components, so the client stays swappable and testable.

---

## Planned Hooks (TBD)

| Hook | Purpose |
|---|---|
| `useSession` | Subscribe to Supabase auth state changes, sync to `useAuthStore` |
| `useProfile` | Fetch and cache user profile from DB into `useUserStore` |
| `useWorkouts` | Fetch/mutate workout data |

---

## Root Orchestrator Pattern

`App.tsx` does not use `useSupabase()`. The root component uses the `supabase` singleton directly for the one-time auth subscription in `useEffect`. `useSupabase()` is for use inside components and hooks, not the app root.

---

## Conventions

- Hooks are named `use<Feature>` and live in `src/hooks/`
- Hooks that read from a store use selectors, not the full store object
- Async hooks should expose `{ data, isLoading, error }` shape
