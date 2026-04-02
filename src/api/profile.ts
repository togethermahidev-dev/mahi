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

export type ProfileSearchResult = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'username' | 'display_name' | 'first_name' | 'last_name' | 'avatar_url' | 'streak_current'
>;

/** Search profiles by username, display name, or first/last name. */
export async function searchProfiles(
  query: string,
  limit = 20,
): Promise<{ data: ProfileSearchResult[] | null; error: Error | null }> {
  const q = query.trim();
  if (!q) return { data: [], error: null };

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, first_name, last_name, avatar_url, streak_current')
    .or(
      `username.ilike.%${q}%,display_name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`,
    )
    .limit(limit);

  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as ProfileSearchResult[], error: null };
}

/** Update a user's avatar URL in the profiles table. */
export async function updateAvatarUrl(userId: string, avatarUrl: string) {
  return supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', userId)
    .select('avatar_url')
    .single();
}
