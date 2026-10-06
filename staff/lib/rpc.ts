// Turns a staff action from the portal's forms into the staff RPC and arguments the server
// expects (docs/moderation.md), checking the note and days first. Pure, so it is tested
// (rpc.test.ts) without a database.

import type { StaffAction } from './guard';

export type ActionInput = {
  targetId: string;
  reason: string;
  reportId?: string | null;
  days?: string | null;
};

export type RpcCall = { fn: string; args: Record<string, unknown> } | { error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NOTE_MAX = 500;

export function rpcFor(action: StaffAction, input: ActionInput): RpcCall {
  const id = input.targetId;
  const reportId = input.reportId || null;
  if (!UUID.test(id) || (reportId && !UUID.test(reportId))) return { error: "That id isn't valid." };

  if (action === 'review_report') return { fn: 'staff_review_report', args: { p_report_id: id } };

  const reason = input.reason.trim();
  if (!reason) return { error: 'Write a note first. It goes in the audit log.' };
  if (reason.length > NOTE_MAX) return { error: `The note is at most ${NOTE_MAX} characters.` };

  switch (action) {
    case 'dismiss_report':
      return { fn: 'staff_dismiss_report', args: { p_report_id: id, p_note: reason } };
    case 'hide_post':
      return { fn: 'staff_hide_post', args: { p_post_id: id, p_reason: reason, p_report_id: reportId } };
    case 'unhide_post':
      return { fn: 'staff_unhide_post', args: { p_post_id: id, p_reason: reason } };
    case 'remove_comment':
      return { fn: 'staff_remove_comment', args: { p_comment_id: id, p_reason: reason, p_report_id: reportId } };
    case 'restore_comment':
      return { fn: 'staff_restore_comment', args: { p_comment_id: id, p_reason: reason } };
    case 'warn_user':
      return { fn: 'staff_warn_user', args: { p_user_id: id, p_reason: reason, p_report_id: reportId } };
    case 'suspend_user': {
      const days = Number(input.days);
      if (!input.days || !Number.isInteger(days) || days < 1 || days > 365) {
        return { error: 'A suspension is 1 to 365 days.' };
      }
      return {
        fn: 'staff_suspend_user',
        args: { p_user_id: id, p_reason: reason, p_days: days, p_report_id: reportId },
      };
    }
    case 'ban_user':
      return { fn: 'staff_ban_user', args: { p_user_id: id, p_reason: reason, p_report_id: reportId } };
    case 'unban_user':
      return { fn: 'staff_unban_user', args: { p_user_id: id, p_reason: reason } };
  }
}

const KNOWN: Record<string, string> = {
  'admins only': 'Only admins can do this.',
  'staff only': 'Only staff can do this.',
  'a reason is needed': 'A reason is needed.',
};

/** A server error in plain words. */
export function errorText(error: { code?: string; message?: string }): string {
  const message = error.message ?? '';
  if (KNOWN[message]) return KNOWN[message];
  if (error.code === '22023' && message) return message.charAt(0).toUpperCase() + message.slice(1) + '.';
  return `Something went wrong: ${message || 'no details'}`;
}
