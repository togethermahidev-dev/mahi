/**
 * Auth API
 *
 * Currently backed by Supabase Auth + the `complete-signup` Edge Function.
 * When the Next.js backend is ready, swap each function body to call your
 * Next.js API routes (e.g. POST /api/auth/login) and remove the Supabase
 * imports — screens and components stay untouched.
 */

import { supabase } from '@/lib/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

/**
 * Creates a confirmed auth user via the admin API (Edge Function),
 * then immediately signs them in to obtain a session.
 */
export async function completeSignup(email: string, password: string) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/complete-signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? 'Signup failed');
  }

  return response.json();
}
