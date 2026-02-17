# State Management

Mahi Fitness uses [Zustand](https://github.com/pmndrs/zustand) v5 for global client state. Stores live in `src/store/`.

## Stores

### `useAuthStore` — `src/store/authStore.ts`

Manages Supabase authentication state.

| Field | Type | Description |
|---|---|---|
| `session` | `Session \| null` | Active Supabase session |
| `user` | `User \| null` | Derived from session |
| `isLoading` | `boolean` | True while session is being resolved (starts `true`) |

| Action | Description |
|---|---|
| `setSession(session)` | Sets session and auto-derives `user` from it |
| `setUser(user)` | Sets user directly |
| `setIsLoading(bool)` | Updates loading flag |
| `reset()` | Clears auth state on sign-out |

**Usage:**
```ts
const { session, user, isLoading } = useAuthStore();
const setSession = useAuthStore((s) => s.setSession);
```

---

### `useUserStore` — `src/store/userStore.ts`

Manages the user's app profile (fetched from Supabase after auth).

| Field | Type | Description |
|---|---|---|
| `profile` | `UserProfile \| null` | User's display name and avatar |

| Action | Description |
|---|---|
| `setProfile(profile)` | Sets profile after DB fetch |
| `reset()` | Clears profile on sign-out |

**UserProfile shape:**
```ts
{
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}
```

**Usage:**
```ts
const profile = useUserStore((s) => s.profile);
```

---

## Barrel Export

```ts
// src/store/index.ts
import { useAuthStore, useUserStore } from '@/store';
```

## Conventions

- Always select only what you need with a selector to avoid unnecessary re-renders: `useAuthStore((s) => s.user)`
- Call `reset()` on both stores when a user signs out
- `isLoading` in `authStore` defaults to `true` — guard screens behind this before routing
