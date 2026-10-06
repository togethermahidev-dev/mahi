import type { SupabaseClient } from '@supabase/supabase-js';

/** Usernames for a set of ids (staff and people), in one read of profiles. */
export async function usernames(db: SupabaseClient, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (!unique.length) return new Map();
  const { data } = await db.from('profiles').select('id, username').in('id', unique);
  return new Map((data ?? []).map((p: { id: string; username: string }) => [p.id, p.username]));
}
