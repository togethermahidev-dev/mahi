// Supabase for the staff portal — server only. The browser never talks to Supabase: it holds two
// httpOnly cookies (the staff member's own access and refresh tokens) and every read and action
// runs here, as that staff member, so the database's staff rules (RLS, require_staff) apply.
// Only the public anon key is used; the service-role key must never be added to this app.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const ACCESS_COOKIE = 'mahi_staff_at';
export const REFRESH_COOKIE = 'mahi_staff_rt';

function env(name: 'SUPABASE_URL' | 'SUPABASE_ANON_KEY'): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — copy staff/.env.example to staff/.env.local`);
  return value;
}

/** A client that acts as the person whose access token it is given (or as nobody). */
export function supabaseAs(accessToken?: string): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

/** Ends the session on Supabase too, so a stolen cookie stops working. Never throws. */
export async function revokeSession(accessToken: string): Promise<void> {
  try {
    await fetch(`${env('SUPABASE_URL')}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: { apikey: env('SUPABASE_ANON_KEY'), Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // The cookies are cleared anyway.
  }
}

// Refresh tokens last until used or revoked; the cookie is kept for a working week.
const WEEK_SECONDS = 7 * 24 * 60 * 60;

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: WEEK_SECONDS,
  };
}
