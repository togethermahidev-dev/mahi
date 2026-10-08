import { supabase } from '@/lib/supabase';
import { getBlockedIds } from './moderation';
import type { Database } from '@/types';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];
type ProfRow = Database['public']['Tables']['profiles']['Row'];

export type NotificationWithActor = NotificationRow & {
  actor: Pick<ProfRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
};

export async function getNotifications(
  userId: string,
  limit: number = 50
): Promise<{ data: NotificationWithActor[] | null; error: Error | null }> {
  const { data: notifs, error: notifsErr } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (notifsErr) return { data: null, error: new Error(notifsErr.message, { cause: notifsErr }) };
  if (!notifs || notifs.length === 0) return { data: [], error: null };

  const actorIds = [...new Set(notifs.map((n) => n.actor_id))];

  const { data: profiles, error: profilesErr } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', actorIds);

  if (profilesErr)
    return { data: null, error: new Error(profilesErr.message, { cause: profilesErr }) };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const merged: NotificationWithActor[] = notifs.flatMap((n) => {
    const actor = profileMap.get(n.actor_id);
    if (!actor) return [];
    return [{ ...n, actor }];
  });

  return { data: merged, error: null };
}

/**
 * The unread number on the badge. Notifications from anyone blocked either way are left out, as
 * the list leaves them out, so a blocked person can't make the badge go up. The blocks are read
 * here rather than taken from blockStore, which may not have loaded yet when this runs.
 */
export async function getUnreadCount(
  userId: string
): Promise<{ data: number | null; error: Error | null }> {
  const { data: blocks, error: blocksErr } = await getBlockedIds(userId);
  if (blocksErr || !blocks) return { data: null, error: blocksErr };
  const blocked = [...new Set([...blocks.blockedByMe, ...blocks.blockedMe])];

  let query = supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  if (blocked.length > 0) query = query.not('actor_id', 'in', `(${blocked.join(',')})`);
  const { count, error } = await query;

  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data: count ?? 0, error: null };
}

export async function markAsRead(notificationId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

  if (error) return { error: new Error(error.message, { cause: error }) };
  return { error: null };
}

export async function markAllAsRead(userId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) return { error: new Error(error.message, { cause: error }) };
  return { error: null };
}
