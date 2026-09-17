/**
 * Tag challenges API — reads only. Tags are created by `createPost` (one server call).
 */
import { supabase } from '@/lib/supabase';

export type TaggableFriend = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  /** You already tagged them and they haven't answered yet. */
  has_open_tag: boolean;
  points: number;
};

export type OpenTag = {
  challenge_id: string;
  tagger_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  expires_at: string;
  /** Server clock at read time, so countdowns don't trust the phone's clock. */
  server_now: string;
};

export type TagRules = { tagCount: number; tagsRequired: boolean };

/** People you may tag (they follow you back), filtered by `query`. */
export async function getTaggableFriends(
  query = '',
  limit = 50
): Promise<{ data: TaggableFriend[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_taggable_friends', {
    p_query: query,
    p_limit: limit,
  });
  if (error) return { data: null, error: new Error(error.message) };
  return { data: (data ?? []) as TaggableFriend[], error: null };
}

/** Tags waiting for your post, soonest deadline first. */
export async function getOpenTags(): Promise<{ data: OpenTag[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_open_tags');
  if (error) return { data: null, error: new Error(error.message) };
  return { data: (data ?? []) as OpenTag[], error: null };
}

/** How many tags a post needs, as the server enforces it. */
export async function getTagRules(): Promise<{ data: TagRules | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('app_config')
    .select('tag_count, tags_required')
    .single();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: { tagCount: data.tag_count, tagsRequired: data.tags_required }, error: null };
}
