/**
 * Profile API
 *
 * Currently backed by direct Supabase Postgres queries.
 * When the Next.js backend is ready, swap each function body to call your
 * Next.js API routes (e.g. GET /api/profile/:id) — screens stay untouched.
 */

import { supabase } from '@/lib/supabase';
import type { Database } from '@/types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

/**
 * The profile columns anyone signed in may read. Date of birth and phone number are private
 * (server: profile_private, read back only by their owner) and are never asked for here.
 */
const PROFILE_COLUMNS =
  'id, username, display_name, first_name, last_name, fitness_goals, avatar_url, streak_current, streak_highest, is_banned, timezone, created_at, updated_at' as const;

export type PublicProfile = Omit<ProfileRow, 'date_of_birth' | 'contact_number'>;

/**
 * Fetch a profile (anyone's, including your own). Mahi points are `streak_current` (best:
 * `streak_highest`); the server keeps the old column names so apps already on phones keep working.
 */
export async function getProfile(
  userId: string
): Promise<{ data: PublicProfile | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .single();
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data, error: null };
}

export type ProfileSearchResult = Pick<
  ProfileRow,
  'id' | 'username' | 'display_name' | 'first_name' | 'last_name' | 'avatar_url' | 'streak_current'
>;

/** Search profiles by username, display name, or first/last name. */
export async function searchProfiles(
  query: string,
  limit = 20
): Promise<{ data: ProfileSearchResult[] | null; error: Error | null }> {
  const q = query.trim();
  if (!q) return { data: [], error: null };

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, first_name, last_name, avatar_url, streak_current')
    .or(
      `username.ilike.%${q}%,display_name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`
    )
    .limit(limit);

  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data, error: null };
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
  return { error: error ? new Error(error.message, { cause: error }) : null };
}
