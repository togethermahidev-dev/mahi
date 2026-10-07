/**
 * Your invites (owner, 2026-10-07): the links you've sent, who joined, sending one again and
 * cancelling one. The server is the source (`get_my_invites`, `resend_invite`, `cancel_invite`,
 * migration 20261007210000_my_invites): it decides every rule, including the once-a-day wait and
 * the three-times limit. The app shows your own taps at once and then the server's answer.
 * Invites expire and can be cancelled, so nothing here is ever kept on the phone.
 *
 * Pure (no app or SDK imports) so it runs under the node-only jest harness.
 */
import { plural } from './relativeTime';

export type InviteStatus = 'waiting' | 'joined' | 'expired' | 'cancelled';

/** How a link last went out (`record_invite_sent`). */
export type InviteVia = 'whatsapp' | 'messages' | 'share' | 'contact' | 'copy';

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
  /** How it last went out; null for a link from before this was recorded. Missing from an older
   * server, which reads the same as null. Server: 20261007290000_invite_sent_to. */
  sent_via?: InviteVia | null;
  /** Who it went to, when the app knew (a contact texted from Find your mates). */
  sent_to_name?: string | null;
  /** Their number, +<country><number>. Only ever handed back to you, the sender. */
  sent_to_phone?: string | null;
  /** The post a tag link went with, and when that post went up. */
  post_id?: string | null;
  post_created_at?: string | null;
};

/** A row on screen: from the server, or with your own tap still on its way. */
export type ScreenInvite = MyInvite & { pending?: 'resending' | 'cancelling' };

export const CANCEL_CONFIRM = {
  title: 'Cancel this invite?',
  message: 'The link will stop working.',
  confirm: 'Cancel invite',
  keep: 'Keep it',
} as const;

/** "+44 7700 900123": a number spaced the way people read it (UK and North American ones). */
export function formatPhone(phone: string): string {
  const uk = /^\+44(\d{4})(\d+)$/.exec(phone);
  if (uk) return `+44 ${uk[1]} ${uk[2]}`;
  const na = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone);
  if (na) return `+1 ${na[1]} ${na[2]} ${na[3]}`;
  return phone;
}

const SHARED_TITLE: Record<Exclude<InviteVia, 'contact'>, string> = {
  whatsapp: 'Shared on WhatsApp',
  messages: 'Shared by Messages',
  share: 'Shared by link',
  copy: 'Link copied',
};

/** The row's name: who joined, who it was sent to, or how it was shared. */
export function inviteTitle(invite: ScreenInvite): string {
  if (invite.status === 'joined' && invite.joined) {
    return invite.joined.display_name || `@${invite.joined.username}`;
  }
  if (invite.sent_to_name) return `Sent to ${invite.sent_to_name}`;
  if (invite.sent_to_phone) return `Sent to ${formatPhone(invite.sent_to_phone)}`;
  if (invite.sent_via && invite.sent_via !== 'contact') return SHARED_TITLE[invite.sent_via];
  return 'Invite link';
}

/** The second line: what the link does. */
export function inviteWhatText(invite: ScreenInvite): string {
  if (invite.status === 'joined') return 'Joined · you follow each other';
  return invite.kind === 'tag'
    ? 'They’ll have 48 hours to post back once they join.'
    : 'You’ll follow each other when they join.';
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Tue 7 Oct", on the phone's own calendar. */
export function dayText(iso: string): string {
  const d = new Date(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

const STATUS_WORD: Record<Exclude<InviteStatus, 'joined'>, string> = {
  waiting: 'Waiting',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

/** The third line: where it's at, and when it last went out ("with your post" for a tag link). */
export function inviteWhenText(invite: ScreenInvite): string {
  if (invite.pending === 'resending') return 'Sending…';
  const withPost = invite.kind === 'tag' && !!invite.post_id;
  const sent = `${withPost ? 'Sent with your post · ' : 'Sent '}${dayText(invite.last_sent_at)}`;
  return invite.status === 'joined' ? sent : `${STATUS_WORD[invite.status]} · ${sent}`;
}

/** The picture when nobody has joined yet: how it went out ("link" for an older one). */
export type InviteChannel = 'joined' | InviteVia | 'link';

export function inviteChannel(invite: ScreenInvite): InviteChannel {
  if (invite.status === 'joined' && invite.joined) return 'joined';
  return invite.sent_via ?? 'link';
}

/** Where Resend opens, and how that send is recorded: the same place as before. */
export type ResendPlace = {
  open: 'whatsapp' | 'sms' | 'share';
  via: InviteVia;
  toName: string | null;
  toPhone: string | null;
};

export function resendPlace(invite: ScreenInvite): ResendPlace {
  const toName = invite.sent_to_name ?? null;
  const toPhone = invite.sent_to_phone ?? null;
  if (invite.sent_via === 'whatsapp') return { open: 'whatsapp', via: 'whatsapp', toName, toPhone };
  if (invite.sent_via === 'contact' && toPhone) {
    return { open: 'sms', via: 'contact', toName, toPhone };
  }
  if (invite.sent_via === 'messages') return { open: 'sms', via: 'messages', toName, toPhone };
  return { open: 'share', via: 'share', toName: null, toPhone: null };
}

/** The list: "Waiting", "Joined", then "Older" (ran out or cancelled). An empty group is left out. */
export type InviteListItem =
  | { type: 'header'; key: string; title: string }
  | { type: 'invite'; key: string; invite: ScreenInvite };

export function inviteSections(list: ScreenInvite[]): InviteListItem[] {
  const groups: [string, ScreenInvite[]][] = [
    ['Waiting', list.filter((i) => i.status === 'waiting')],
    ['Joined', list.filter((i) => i.status === 'joined')],
    ['Older', list.filter((i) => i.status === 'expired' || i.status === 'cancelled')],
  ];
  return groups.flatMap(([title, rows]): InviteListItem[] =>
    rows.length === 0
      ? []
      : [
          { type: 'header', key: `h-${title}`, title },
          ...rows.map((invite): InviteListItem => ({ type: 'invite', key: invite.token, invite })),
        ]
  );
}

/** The code sits behind this, for someone the link didn't reach. */
export const CODE_HINT = 'Didn’t get the link?';

export function codeText(invite: ScreenInvite): string {
  return `Code ${invite.code}`;
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
