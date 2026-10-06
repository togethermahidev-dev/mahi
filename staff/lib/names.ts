import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditRow } from './types';

/** Usernames for a set of ids (staff and people), in one read of profiles. */
export async function usernames(db: SupabaseClient, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (!unique.length) return new Map();
  const { data } = await db.from('profiles').select('id, username').in('id', unique);
  return new Map((data ?? []).map((p: { id: string; username: string }) => [p.id, p.username]));
}

/**
 * What the audit log needs to read as sentences: usernames of staff and people, and for a post,
 * comment or message, whose it was. The owner comes from the report the action was on (any
 * target), or else from the post or comment itself (staff can read hidden and removed ones).
 * A message action without a report has no owner: staff can't read messages directly.
 */
export async function auditContext(
  db: SupabaseClient,
  rows: AuditRow[],
): Promise<{ names: Map<string, string>; owners: Map<string, string> }> {
  const ids = (pick: (r: AuditRow) => boolean) => [...new Set(rows.filter(pick).map((r) => r.target_id))];
  const reportIds = [...new Set(rows.map((r) => r.report_id).filter((id): id is string => !!id))];
  const postIds = ids((r) => r.target_type === 'post' && !r.report_id);
  const commentIds = ids((r) => r.target_type === 'comment' && !r.report_id);

  const [reports, posts, comments] = await Promise.all([
    reportIds.length ? db.from('user_reports').select('id, target_owner_id').in('id', reportIds) : null,
    postIds.length ? db.from('posts').select('id, user_id').in('id', postIds) : null,
    commentIds.length ? db.from('post_comments').select('id, user_id').in('id', commentIds) : null,
  ]);
  const ownerOfReport = new Map((reports?.data ?? []).map((r: { id: string; target_owner_id: string | null }) => [r.id, r.target_owner_id]));
  const ownerOfThing = new Map(
    [...(posts?.data ?? []), ...(comments?.data ?? [])].map((x: { id: string; user_id: string }) => [x.id, x.user_id]),
  );
  const ownerId = (r: AuditRow) =>
    r.target_type === 'user' ? null : r.report_id ? ownerOfReport.get(r.report_id) ?? null : ownerOfThing.get(r.target_id) ?? null;

  const names = await usernames(db, rows.flatMap((r) => [r.staff_id, r.target_type === 'user' ? r.target_id : null, ownerId(r)]));
  const owners = new Map<string, string>();
  for (const r of rows) {
    const id = ownerId(r);
    const name = id ? names.get(id) : undefined;
    if (name) owners.set(r.id, name);
  }
  return { names, owners };
}
