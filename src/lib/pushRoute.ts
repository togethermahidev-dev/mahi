/**
 * Where a tapped push opens. The server sets `route` in each push's data (see
 * supabase/functions/send-push and the migrations that queue pushes). Pure, so it is unit-tested;
 * the hook is src/hooks/usePushRouting.ts.
 */

/** What the server puts in a push's `data`. */
export type PushData = {
  route?: 'post' | 'profile' | 'camera' | 'conversation';
  post_id?: string | null;
  user_id?: string;
  conversation_id?: string;
  notification_id?: string;
};

export type PushDestination = 'profile' | 'camera' | 'messages' | 'notifications';

export function pushDestination(data: PushData): PushDestination {
  if (data.route === 'profile' && data.user_id) return 'profile';
  if (data.route === 'camera') return 'camera';
  if (data.route === 'conversation') return 'messages';
  return 'notifications';
}
