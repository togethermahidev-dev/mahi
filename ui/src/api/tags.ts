/**
 * Tag challenges API — reads only. Tags are created by `createPost` (one server call).
 */
import { supabase } from '@/lib/supabase';

export type TaggableFriend = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  /** Can't be tagged now: you tagged them and they haven't answered, or they tagged you. */
  has_open_tag: boolean;
  /** They tagged you and your post answers it, so you can't tag them back. */
  tagged_you?: boolean;
  /** Their Mahi points (the server sends `streak_current` under this name). */
  points: number;
  /** When anyone last tagged them; null if never. */
  last_tagged_at: string | null;
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

export type TagRules = {
  tagCount: number;
  tagsRequired: boolean;
  nudgeDays: number;
  inviteLinksEnabled: boolean;
};

/** People you may tag (they follow you back), filtered by `query`. */
export async function getTaggableFriends(
  query = '',
  limit = 50
): Promise<{ data: TaggableFriend[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_taggable_friends', {
    p_query: query,
    p_limit: limit,
  });
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data: (data ?? []) as TaggableFriend[], error: null };
}

/** Tags waiting for your post, soonest deadline first. */
export async function getOpenTags(): Promise<{ data: OpenTag[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_open_tags');
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data: (data ?? []) as OpenTag[], error: null };
}

/** One of your tags whose 48 hours are running: a mate on the clock to answer you. */
export type MateOnClock = {
  challenge_id: string;
  user_id: string;
  username: string;
  expires_at: string;
  /** Server clock at read time, so countdowns don't trust the phone's clock. */
  server_now: string;
};

/**
 * Your mates on the clock, soonest first (`get_mates_on_clock`, 20261007275000). Read fresh each
 * time the waiting camera shows; never kept on the phone (tags end).
 */
export async function getMatesOnClock(): Promise<{
  data: MateOnClock[] | null;
  error: Error | null;
}> {
  const { data, error } = await supabase.rpc('get_mates_on_clock');
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data: (data ?? []) as MateOnClock[], error: null };
}

/** How many tags a post needs, as the server enforces it. */
export async function getTagRules(): Promise<{ data: TagRules | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('app_config')
    .select('tag_count, tags_required, nudge_days, invite_links_enabled')
    .single();
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return {
    data: {
      tagCount: data.tag_count,
      tagsRequired: data.tags_required,
      nudgeDays: data.nudge_days,
      inviteLinksEnabled: data.invite_links_enabled,
    },
    error: null,
  };
}
