/**
 * Sign in with Apple — the pure rules (no native imports, so they're unit-tested in
 * src/lib/__tests__/appleSignIn.test.ts). The native side is in src/lib/appleAuthModule.ts and
 * src/hooks/useAppleSignIn.ts.
 */
import { authErrorText } from '@/lib/account';

/**
 * Whether the Apple button shows on the welcome screen: the owner's switch `auth-apple-signin`
 * is on, this is an iPhone, the build has the native module (build 13+; OTAs also reach builds
 * 10 to 12, which don't) and the phone says Apple sign-in works (`available` is null until it
 * answers, so the button never appears and then vanishes).
 */
export function appleSignInShown(input: {
  flagOn: boolean;
  platform: string;
  hasModule: boolean;
  available: boolean | null;
}): boolean {
  return input.flagOn && input.platform === 'ios' && input.hasModule && input.available === true;
}

const MIN_NONCE_BYTES = 16;

/**
 * A one-time nonce for one sign-in. Apple gets the SHA-256 (hex) of the raw nonce and puts it in
 * the identity token; Supabase gets the raw nonce, hashes it and checks the two match, so a
 * stolen token can't be replayed. `bytes` come from the phone's secure random source.
 */
export async function appleNonce(
  bytes: Uint8Array,
  sha256Hex: (s: string) => Promise<string>
): Promise<{ raw: string; hashed: string }> {
  if (bytes.length < MIN_NONCE_BYTES) throw new Error('Nonce needs at least 16 random bytes');
  const raw = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return { raw, hashed: await sha256Hex(raw) };
}

/** expo-apple-authentication's code when the person closes Apple's sheet. */
export const APPLE_CANCELED = 'ERR_REQUEST_CANCELED';

const APPLE_FAILED = 'Couldn’t sign you in with Apple. Try again, or use your email.';

/**
 * What to show when Apple sign-in fails: nothing when the person cancelled, the usual connection
 * line for a lost connection, else one plain line (never Apple's or the server's own words).
 */
export function appleSignInError(raw: unknown): string | null {
  const e = (raw ?? {}) as { code?: unknown; message?: unknown };
  if (e.code === APPLE_CANCELED) return null;
  const message = typeof e.message === 'string' ? e.message : '';
  const connection = authErrorText(message, 'login');
  if (connection === authErrorText('network', 'login')) return connection;
  return APPLE_FAILED;
}

/** Apple's name parts (from the credential) or the copy kept in the account's user metadata. */
type NameParts = {
  givenName?: string | null;
  familyName?: string | null;
  middleName?: string | null;
  given_name?: unknown;
  family_name?: unknown;
};

/**
 * The name to pre-fill the profile step with. Apple gives it on the first sign-in only, so it is
 * also kept on the account (user metadata) and read back from there.
 */
export function appleName(parts: NameParts | null | undefined): {
  firstName: string;
  lastName: string;
  displayName: string;
} {
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const firstName = text(parts?.givenName) || text(parts?.given_name);
  const lastName = text(parts?.familyName) || text(parts?.family_name);
  return { firstName, lastName, displayName: [firstName, lastName].filter(Boolean).join(' ') };
}

/** True when the signed-in account was made with, or is linked to, Apple. */
export function isAppleUser(
  user: { app_metadata?: { provider?: string; providers?: string[] } } | null | undefined
): boolean {
  const meta = user?.app_metadata;
  if (!meta) return false;
  return meta.provider === 'apple' || (meta.providers ?? []).includes('apple');
}

/** What the first profile read found. */
export type ProfileStatus = 'loading' | 'present' | 'missing' | 'error';

/**
 * What a signed-in person sees. An Apple account with no profile row yet goes through the same
 * profile steps as an email sign-up; while its profile is loading, a plain wait, so the camera
 * never shows and then swaps away. Email accounts are unchanged: their sign-up sheet saves the
 * profile itself. A failed read never blocks.
 */
export function profileStep(input: {
  apple: boolean;
  status: ProfileStatus;
  hasProfile: boolean;
}): 'app' | 'wait' | 'profile' {
  if (!input.apple || input.hasProfile) return 'app';
  if (input.status === 'loading') return 'wait';
  if (input.status === 'missing') return 'profile';
  return 'app';
}
