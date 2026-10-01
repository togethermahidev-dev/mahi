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
  return supabase.from('profiles').select('username').eq('username', username).maybeSingle();
}

/** Insert a new profile row after account creation. */
export async function insertProfile(profile: ProfileInsert) {
  return supabase.from('profiles').insert(profile);
}

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

/** A profile plus its Mahi points (`points` is a computed column on the server). */
export type ProfileWithPoints = ProfileRow & { points: number };

/** Fetch the full profile, with points. */
export async function getProfile(
  userId: string
): Promise<{ data: ProfileWithPoints | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, points')
    .eq('id', userId)
    .single();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as unknown as ProfileWithPoints, error: null };
}

export type ProfileSearchResult = Pick<
  ProfileRow,
  'id' | 'username' | 'display_name' | 'first_name' | 'last_name' | 'avatar_url' | 'streak_current'
> & { points: number };

/** Search profiles by username, display name, or first/last name. */
export async function searchProfiles(
  query: string,
  limit = 20
): Promise<{ data: ProfileSearchResult[] | null; error: Error | null }> {
  const q = query.trim();
  if (!q) return { data: [], error: null };

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, first_name, last_name, avatar_url, streak_current, points')
    .or(
      `username.ilike.%${q}%,display_name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`
    )
    .limit(limit);

  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as unknown as ProfileSearchResult[], error: null };
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

/** Save the phone's time zone (IANA name). The server dates every post in this zone. */
export async function updateTimezone(
  userId: string,
  timezone: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('profiles').update({ timezone }).eq('id', userId);
  return { error: error ? new Error(error.message) : null };
}

/** Update a user's training-day routine (comma-separated full day names). */
export async function updateFitnessRoutine(userId: string, routine: string | null) {
  return supabase
    .from('profiles')
    .update({ fitness_routine: routine })
    .eq('id', userId)
    .select('fitness_routine')
    .single();
}
