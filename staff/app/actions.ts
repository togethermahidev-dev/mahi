'use server';

// Every staff action goes through here: check staff on the server, check the role may do it,
// call the staff RPC as the signed-in staff member (the database checks again and logs it).

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/staff';
import { canDo, type StaffAction } from '@/lib/guard';
import { errorText, rpcFor } from '@/lib/rpc';

export type ActionState = { ok: boolean; message: string } | null;

const ACTIONS: readonly StaffAction[] = [
  'review_report',
  'dismiss_report',
  'hide_post',
  'unhide_post',
  'remove_comment',
  'restore_comment',
  'warn_user',
  'suspend_user',
  'ban_user',
  'unban_user',
];

export async function staffAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { db, role } = await requireStaff();
  const action = String(form.get('action') ?? '') as StaffAction;
  if (!ACTIONS.includes(action)) return { ok: false, message: 'Unknown action.' };
  if (!canDo(role, action)) return { ok: false, message: 'Only admins can do this.' };

  const call = rpcFor(action, {
    targetId: String(form.get('targetId') ?? ''),
    reason: String(form.get('reason') ?? ''),
    reportId: (form.get('reportId') as string | null) || null,
    days: (form.get('days') as string | null) || null,
  });
  if ('error' in call) return { ok: false, message: call.error };

  const { data, error } = await db.rpc(call.fn, call.args);
  if (error) return { ok: false, message: errorText(error) };

  revalidatePath('/', 'layout');
  const closed = (data as { reports_closed?: number } | null)?.reports_closed;
  return {
    ok: true,
    message: closed ? `Done. ${closed} open report${closed === 1 ? '' : 's'} closed.` : 'Done.',
  };
}
