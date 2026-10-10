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
const BASE_COLUMNS =
  'id, username, display_name, first_name, last_name, fitness_goals, avatar_url, streak_current, streak_highest, has_posted_before, is_banned, timezone, created_at, updated_at';
/** Settings → Security and privacy → Privacy controls (20261008170000_private_accounts). */
const CONTROLS_COLUMNS = 'is_private, posts_visibility, tag_permission, privacy_chosen_at';
const PROFILE_COLUMNS = `${BASE_COLUMNS}, ${CONTROLS_COLUMNS}` as const;

/** Postgres "column does not exist": the database change hasn't reached this server yet. */
const UNDEFINED_COLUMN = '42703';

export type PublicProfile = Omit<ProfileRow, 'date_of_birth' | 'contact_number'>;

/**
 * Fetch a profile (anyone's, including your own). Mahi points are `streak_current` (best:
 * `streak_highest`); the server keeps the old column names so apps already on phones keep working.
 * A server without the Controls columns yet is read without them (they come back missing).
 */
export async function getProfile(
  userId: string
): Promise<{ data: PublicProfile | null; error: Error | null }> {
  const read = (columns: string) =>
    supabase.from('profiles').select(columns).eq('id', userId).single();
  let { data, error } = await read(PROFILE_COLUMNS);
  if (error?.code === UNDEFINED_COLUMN) ({ data, error } = await read(BASE_COLUMNS));
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data: data as unknown as PublicProfile, error: null };
}

/** "No such function" (PostgREST, Postgres): the database change hasn't reached this server yet. */
const MISSING_FUNCTION = ['PGRST202', '42883'];

/** What a profile's header shows beside the profile row (`get_profile_about`). */
export type ProfileAbout = {
  /** Their bio; null when they have none, or when the server keeps it back (a block, a ban). */
  bio: string | null;
  /** The caller may open this person's follower and following lists (always true for your own). */
  listsOpen: boolean;
};

/**
 * A profile's bio and whether its lists are open to you (20261010110000_profile_bio). The bio is
 * not on the profile row: the server returns it only to someone who may see it. `data: null` with
 * no error means this server has no bios yet (the app update arrived before the database change):
 * the profile then shows no bio line at all.
 */
export async function getProfileAbout(
  userId: string
): Promise<{ data: ProfileAbout | null; error: Error | null }> {
  // Not in the generated types until its migration is live.
  const { data, error } = await supabase.rpc(
    'get_profile_about' as never,
    { p_user: userId } as never
  );
  if (error) {
    if (MISSING_FUNCTION.includes(error.code)) return { data: null, error: null };
    return { data: null, error: new Error(error.message, { cause: error }) };
  }
  const row = data as { bio?: unknown; lists_open?: unknown } | null;
  if (!row || typeof row !== 'object' || !('bio' in row)) return { data: null, error: null };
  return {
    data: {
      bio: typeof row.bio === 'string' && row.bio !== '' ? row.bio : null,
      listsOpen: row.lists_open === true,
    },
    error: null,
  };
}

/**
 * Save your own bio (`set_bio`; the server takes the caller from the session, tidies the words
 * and refuses more than 150 characters). Returns the bio as saved; null means none.
 */
export async function setBio(
  bio: string
): Promise<{ data: { bio: string | null } | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('set_bio' as never, { p_bio: bio } as never);
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  const row = data as { bio?: unknown } | null;
  if (!row || typeof row !== 'object' || !('bio' in row)) {
    return { data: null, error: new Error('set_bio returned no answer') };
  }
  return {
    data: { bio: typeof row.bio === 'string' && row.bio !== '' ? row.bio : null },
    error: null,
  };
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
