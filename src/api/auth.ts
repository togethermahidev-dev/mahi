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

const SUPABASE_URL = env.supabaseUrl;

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
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
