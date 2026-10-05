import { slotShareMessage } from './tagSlots';
/**
 * Sending the invite links a post hands back (flag `tags-invite-step`). Each link is for one
 * person and works once, so each goes out in its own share sheet. The list shows which are sent
 * and lets any be sent again, so a skipped link isn't silently lost.
 *
 * The list lives in memory only: links expire, so they are never written to the phone.
 * Pure (no app or SDK imports) so it runs under the node-only jest harness.
 */

type Invite = { token: string; code: string; url: string; claimed: boolean };

export type InviteItem = Invite & { status: 'sent' | 'not-sent' };

/** Every link starts not sent — except one already claimed (a retried post returns the same links). */
export function inviteList(invites: Invite[]): InviteItem[] {
  return invites.map((i) => ({ ...i, status: i.claimed ? 'sent' : 'not-sent' }));
}

/** After a share sheet closes: `shared` is true only when it actually went somewhere. */
export function markInvite(list: InviteItem[], token: string, shared: boolean): InviteItem[] {
  if (!shared) return list;
  return list.map((i) => (i.token === token ? { ...i, status: 'sent' } : i));
}

/** One row of the list. */
export function inviteRow(
  item: InviteItem,
  index: number
): { title: string; status: string; button: string; a11y: string } {
  const n = index + 1;
  const sent = item.status === 'sent';
  return {
    title: `Invite ${n}`,
    status: sent ? 'Sent · waiting for them to join' : 'Not sent yet',
    button: sent ? 'Resend to the same person' : 'Send',
    a11y: sent ? `Resend invite ${n} to the same person` : `Send invite ${n}`,
  };
}

/** The list's heading and how many are left. */
export function inviteListSummary(list: InviteItem[]): {
  headline: string;
  count: string;
  unsent: number;
  allSent: boolean;
} {
  const sent = list.filter((i) => i.status === 'sent').length;
  const unsent = list.length - sent;
  return {
    headline: list.length === 1 ? 'Send your invite' : `Send your ${list.length} invites`,
    count: `${sent} of ${list.length} sent`,
    unsent,
    allSent: unsent === 0,
  };
}

/**
 * What one share sheet sends: the same words as the tag screen, link and code. The invite page
 * isn't live yet, so a link opens nothing; the code is how a new person gets linked to you.
 */
export function inviteShareMessage(url: string, code: string): string {
  return slotShareMessage(url, code);
}
