/**
 * Profile API
 *
 * Currently backed by direct Supabase Postgres queries.
 * When the Next.js backend is ready, swap each function body to call your
 * Next.js API routes (e.g. GET /api/profile/:id) — screens stay untouched.
 */

import { supabase } from '@/lib/supabase';
import type { Database } from '@/types';

type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];

/** Check whether a username is already taken. */
export async function checkUsername(username: string) {
  return supabase
    .from('profiles')
    .select('username')
    .eq('username', username)
    .maybeSingle();
}

/** Insert a new profile row after account creation. */
export async function insertProfile(profile: ProfileInsert) {
  return supabase.from('profiles').insert(profile);
}

/** Fetch the full profile for an authenticated user. */
export async function getProfile(userId: string) {
  return supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
}
