// Who may use the staff portal, and what each role may do. Pure functions with no packages so
// node's test runner can check them (guard.test.ts). The server is the real gate: every staff
// RPC refuses non-staff ("42501 staff only") and moderators calling ban/unban ("42501 admins
// only"); these rules decide what the portal shows and who it lets in. See docs/moderation.md.

export type StaffRole = 'admin' | 'moderator';

export type StaffAction =
  | 'review_report'
  | 'dismiss_report'
  | 'hide_post'
  | 'unhide_post'
  | 'remove_comment'
  | 'restore_comment'
  | 'warn_user'
  | 'suspend_user'
  | 'ban_user'
  | 'unban_user';

const ADMIN_ONLY: ReadonlySet<StaffAction> = new Set(['ban_user', 'unban_user']);

/** The value of my_staff_role(), checked: only 'admin' or 'moderator' count. */
export function parseRole(value: unknown): StaffRole | null {
  return value === 'admin' || value === 'moderator' ? value : null;
}

/** What to do with a request: let it in, send to sign-in, or sign a non-staff person out. */
export function accessFor(input: { signedIn: boolean; role: StaffRole | null }): 'allow' | 'sign-in' | 'sign-out' {
  if (!input.signedIn) return 'sign-in';
  return input.role ? 'allow' : 'sign-out';
}

export function canDo(role: StaffRole | null, action: StaffAction): boolean {
  if (!role) return false;
  return role === 'admin' || !ADMIN_ONLY.has(action);
}

export const HOME = '/reports';

/** Where to go after signing in: only a path on this site, never back to the sign-in page. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return HOME;
  if (next === '/login' || next.startsWith('/login?')) return HOME;
  return next;
}

/** True when a Supabase access token ends within a minute (or can't be read) and needs refreshing. */
export function tokenExpiresSoon(token: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp !== 'number' || payload.exp - nowSeconds < 60;
  } catch {
    return true;
  }
}
