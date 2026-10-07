/**
 * Your invites (owner, 2026-10-07): the links you've sent, who joined, sending one again and
 * cancelling one. The server is the source (`get_my_invites`, `resend_invite`, `cancel_invite`,
 * migration 20261007210000_my_invites): it decides every rule, including the once-a-day wait and
 * the three-times limit. The app shows your own taps at once and then the server's answer.
 * Invites expire and can be cancelled, so nothing here is ever kept on the phone.
 *
 * Pure (no app or SDK imports) so it runs under the node-only jest harness.
 */
import { relativeTime, plural } from './relativeTime';

export type InviteStatus = 'waiting' | 'joined' | 'expired' | 'cancelled';

/** One row of `get_my_invites`. */
export type MyInvite = {
  token: string;
  code: string;
  url: string;
  /** mate: a link with no tag behind it. tag: a tag slot's link. */
  kind: 'mate' | 'tag';
  status: InviteStatus;
  created_at: string;
  expires_at: string;
  last_sent_at: string;
  /** 1 when first made; each resend adds one. */
  send_count: number;
  joined: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  can_resend: boolean;
  /** When it can next be sent again; null once it can't be sent again at all. */
  resend_at: string | null;
  server_now: string;
};

/** A row on screen: from the server, or with your own tap still on its way. */
export type ScreenInvite = MyInvite & { pending?: 'resending' | 'cancelling' };

export const CANCEL_CONFIRM = {
  title: 'Cancel this invite?',
  message: 'The link will stop working.',
  confirm: 'Cancel invite',
  keep: 'Keep it',
} as const;

/** The row's name: who joined, or what kind of link it is. */
export function inviteTitle(invite: ScreenInvite): string {
  if (invite.status === 'joined' && invite.joined) {
    return invite.joined.display_name || `@${invite.joined.username}`;
  }
  return invite.kind === 'tag' ? 'Tag invite' : 'Invite for a mate';
}

/** The line under the name. `now`: the device time moved onto the server's clock. */
export function inviteStatusText(invite: ScreenInvite, now: number): string {
  if (invite.pending === 'resending') return 'Sending…';
  switch (invite.status) {
    case 'joined':
      return invite.joined ? `Joined · @${invite.joined.username}` : 'Joined';
    case 'cancelled':
      return 'Cancelled';
    case 'expired':
      return 'Expired';
    default:
      return `Waiting · sent ${relativeTime(invite.last_sent_at, now)}`;
  }
}

/** "5h", "15m": how long until it can be sent again, rounded up. */
function waitText(ms: number): string {
  const mins = Math.max(1, Math.ceil(ms / 60_000));
  return mins < 60 ? `${mins}m` : `${Math.ceil(mins / 60)}h`;
}

/** The Resend button: ready, counting down, used up, busy, or not there at all. */
export function resendButton(
  invite: ScreenInvite,
  now: number
): { kind: 'resend' | 'wait' | 'limit' | 'busy' | 'none'; label: string | null } {
  if (invite.pending === 'resending') return { kind: 'busy', label: 'Sending…' };
  if (invite.pending || (invite.status !== 'waiting' && invite.status !== 'expired')) {
    return { kind: 'none', label: null };
  }
  if (!invite.resend_at) {
    return { kind: 'limit', label: `Resent ${plural(invite.send_count - 1, 'time')}` };
  }
  const left = Date.parse(invite.resend_at) - now;
  if (invite.can_resend || left <= 0) return { kind: 'resend', label: 'Resend' };
  return { kind: 'wait', label: `Resend in ${waitText(left)}` };
}

/** Cancel is offered while a link is waiting for someone, and nothing else is in flight. */
export function canCancel(invite: ScreenInvite): boolean {
  return invite.status === 'waiting' && !invite.pending;
}

const FALLBACK = 'Couldn’t do that. Try again.';

/** A server refusal, in plain words. */
export function inviteErrorText(message: string): string {
  if (message.includes('resend: too soon')) return 'You can send this again later.';
  if (message.includes('resend: limit reached'))
    return 'You’ve sent this link as many times as you can.';
  if (message.includes('already joined')) return 'They’ve already joined.';
  if (message.includes('resend: cancelled')) return 'That invite was cancelled.';
  if (message.includes('too many open invites'))
    return 'Too many invites waiting. Cancel one first.';
  if (message.includes('invite links are off')) return 'Links are off right now.';
  if (message.includes('that invite is not valid')) return 'That invite can’t be found.';
  return FALLBACK;
}

/** True when a rule said no (a known refusal), so it isn't reported as a bug. */
export function isInviteRefusal(message: string): boolean {
  return inviteErrorText(message) !== FALLBACK;
}

function replace(
  list: ScreenInvite[],
  token: string,
  change: (i: ScreenInvite) => ScreenInvite
): ScreenInvite[] {
  return list.map((i) => (i.token === token ? change(i) : i));
}

/** Cancel tapped: shown as cancelled straight away. */
export function applyCancel(list: ScreenInvite[], token: string): ScreenInvite[] {
  return replace(list, token, (i) => ({
    ...i,
    status: 'cancelled',
    can_resend: false,
    resend_at: null,
    pending: 'cancelling',
  }));
}

/** Resend tapped: "Sending…" until the server answers. */
export function applyResend(list: ScreenInvite[], token: string): ScreenInvite[] {
  return replace(list, token, (i) => ({ ...i, pending: 'resending' }));
}

/** The server's committed row takes the place of what was shown. */
export function reconcileInvite(list: ScreenInvite[], row: MyInvite): ScreenInvite[] {
  return replace(list, row.token, () => row);
}

/** The server said no: the row goes back to what it was before the tap. */
export function restoreInvite(list: ScreenInvite[], before: ScreenInvite): ScreenInvite[] {
  return replace(list, before.token, () => before);
}

/** The Profile row's line: "3 waiting · 1 joined". */
export function inviteSummary(list: MyInvite[]): string {
  if (list.length === 0) return 'No invites yet';
  const waiting = list.filter((i) => i.status === 'waiting').length;
  const joined = list.filter((i) => i.status === 'joined').length;
  const parts = [
    ...(waiting > 0 ? [`${waiting} waiting`] : []),
    ...(joined > 0 ? [`${joined} joined`] : []),
  ];
  return parts.length > 0 ? parts.join(' · ') : 'None waiting';
}

/** The number on "See your invites" and the Settings row: invites still waiting or joined. */
export function inviteBadgeCount(list: MyInvite[]): number {
  return list.filter((i) => i.status === 'waiting' || i.status === 'joined').length;
}
