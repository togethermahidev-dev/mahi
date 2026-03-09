# Hooks

Custom hooks live in `src/hooks/`. They wrap library clients or encapsulate reusable logic.

## Current Hooks

### `useAppTheme` — `src/hooks/useAppTheme.ts`

Resolves the effective colour scheme (light/dark) from the user's stored preference and the system setting. Returns an `AppTheme` object.

```ts
import { useAppTheme } from '@/hooks/useAppTheme';

const { dark, colorScheme, colors } = useAppTheme();
```

**Return shape:**

| Field | Type | Description |
|---|---|---|
| `mode` | `'light' \| 'dark' \| 'system'` | Stored user preference |
| `colorScheme` | `'light' \| 'dark'` | Resolved effective scheme |
| `dark` | `boolean` | `true` when effective scheme is dark |
| `colors.bg` | `string` | `#1C1C19` (dark) / `#FFFFFF` (light) |
| `colors.text` | `string` | `#E8E8E3` (dark) / `#1A1A17` (light) |
| `colors.offWhite` | `string` | `#E8E8E3` |
| `colors.offBlack` | `string` | `#1A1A17` |

**Navigation usage:**

- `NavigationDots` uses `dark` to set dot colour: `dark ? '#FFFFFF' : '#1A1A17'`. Camera screen (always a dark background) passes `dark={true}` regardless of theme preference.
- `CameraScreen` uses `dark` to set shutter ring/fill colour.
- `VerticalNavigator` uses `dark` to select the correct background palette (`SCREEN_BG_DARK` vs `SCREEN_BG_LIGHT`) for off-screen placeholder slots.
- Navigation components should use `dark` (boolean) rather than `colorScheme` (string) for contrast decisions.

---

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
