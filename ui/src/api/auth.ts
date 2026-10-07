/**
 * Auth API
 *
 * Currently backed by Supabase Auth + the `complete-signup` Edge Function.
 * When the Next.js backend is ready, swap each function body to call your
 * Next.js API routes (e.g. POST /api/auth/login) and remove the Supabase
 * imports — screens and components stay untouched.
 */

import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { reportError } from '@/lib/sentry';
import { unregisterPushToken } from './push';

const SUPABASE_URL = env.supabaseUrl;

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  // Must run while still signed in; a failure must not block signing out.
  await unregisterPushToken()
    .then(({ error }) => {
      if (error) reportError(error, { flow: 'push', action: 'unregister', level: 'warning' });
    })
    .catch((err) => reportError(err, { flow: 'push', action: 'unregister', level: 'warning' }));
  return supabase.auth.signOut();
}

/**
 * POST to an Edge Function; `{ error }` carries the server's own message when it refuses, `data`
 * the reply on success.
 */
async function callFunction(
  name: string,
  body: Record<string, string>,
  accessToken?: string
): Promise<{ error: Error | null; data?: Record<string, unknown> }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.supabaseAnonKey,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { error: null, data };
    }
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: new Error(json.error ?? 'Something went wrong. Please try again.') };
  } catch {
    return { error: new Error('No connection. Check your internet and try again.') };
  }
}

/**
 * Password reset, step 1: email a 6-digit code. The server answers the same whether or not the
 * email has an account.
 */
export async function sendResetCode(email: string) {
  return callFunction('send-reset-code', { email: email.toLowerCase().trim() });
}

/**
 * Password reset, step 2: the code and the new password. On success the password is changed;
 * log in with it next.
 */
export async function resetPassword(email: string, code: string, password: string) {
  return callFunction('reset-password', { email: email.toLowerCase().trim(), code, password });
}

/**
 * Delete the signed-in account for good (photos, then Apple's access is revoked for an Apple
 * account, then the account; every row cascades), then sign out on this phone only — the server
 * session is already gone. App.tsx's onAuthStateChange resets every store and shows the welcome
 * screen. A failed Apple revoke never stops the deletion; it is reported as a warning.
 */
export async function deleteAccount(): Promise<{ error: Error | null }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { error: new Error('Log in again, then try again.') };
  const { error, data: reply } = await callFunction('delete-account', {}, token);
  if (error) return { error };
  const apple = reply?.apple;
  if (apple === 'failed' || apple === 'not_configured') {
    reportError(new Error(`Apple revoke on account deletion: ${apple}`), {
      flow: 'account',
      action: 'appleRevoke',
      level: 'warning',
    });
  }
  await supabase.auth.signOut({ scope: 'local' });
  return { error: null };
}

/**
 * After Sign in with Apple: hand Apple's one-time authorization code to the server, which keeps
 * Apple's refresh token so deleting the account can revoke Apple's access (App Store guideline
 * 5.1.1(v)). Never throws and never blocks sign-in: a failure is reported as a warning.
 */
export async function saveAppleToken(code: string | null | undefined): Promise<void> {
  if (!code) return;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const { error } = await callFunction('apple-token', { code }, token);
    if (error) reportError(error, { flow: 'auth', action: 'appleSaveToken', level: 'warning' });
  } catch (err) {
    reportError(err, { flow: 'auth', action: 'appleSaveToken', level: 'warning' });
  }
}

/**
 * Complete signup: verify the OTP and create a confirmed auth user.
 *
 * Body: { email, password, code }
 * - email: user's email
 * - password: user's password (8+ chars)
 * - code: OTP sent to the email
 *
 * The Edge Function verifies the code server-side before creating the auth
 * user with email_confirm: true, then deletes the OTP record. This makes OTP
 * verification mandatory and server-authoritative.
 */
export async function completeSignup(email: string, password: string, code: string) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/complete-signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, code }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? 'Signup failed');
  }

  return response.json();
}
