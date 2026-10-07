import {
  inviteBadgeCount,
  applyCancel,
  applyResend,
  canCancel,
  inviteErrorText,
  inviteStatusText,
  inviteSummary,
  inviteTitle,
  isInviteRefusal,
  reconcileInvite,
  resendButton,
  restoreInvite,
  CANCEL_CONFIRM,
  type MyInvite,
} from '../myInvites';

const NOW = Date.parse('2026-10-07T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const inHours = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

const invite = (over: Partial<MyInvite> = {}): MyInvite => ({
  token: 't1',
  code: 'ABC234',
  url: 'https://togethermahi.com/i/t1',
  kind: 'mate',
  status: 'waiting',
  created_at: hoursAgo(48),
  expires_at: inHours(120),
  last_sent_at: hoursAgo(48),
  send_count: 1,
  joined: null,
  can_resend: true,
  resend_at: hoursAgo(24),
  server_now: new Date(NOW).toISOString(),
  ...over,
});

describe('inviteStatusText', () => {
  it('says how long a waiting link has been out', () => {
    expect(inviteStatusText(invite(), NOW)).toBe('Waiting · sent 2 days ago');
    expect(inviteStatusText(invite({ last_sent_at: hoursAgo(0) }), NOW)).toBe(
      'Waiting · sent just now'
    );
  });

  it('names who joined', () => {
    const joined = { id: 'u1', username: 'sam', display_name: 'Sam', avatar_url: null };
    expect(inviteStatusText(invite({ status: 'joined', joined }), NOW)).toBe('Joined · @sam');
    expect(inviteStatusText(invite({ status: 'joined', joined: null }), NOW)).toBe('Joined');
  });

  it('says when a link ended', () => {
    expect(inviteStatusText(invite({ status: 'expired' }), NOW)).toBe('Expired');
    expect(inviteStatusText(invite({ status: 'cancelled' }), NOW)).toBe('Cancelled');
  });

  it('says it is sending while the server confirms a resend', () => {
    expect(inviteStatusText({ ...invite(), pending: 'resending' }, NOW)).toBe('Sending…');
  });
});

describe('inviteTitle', () => {
  it('is who joined, or the kind of link', () => {
    const joined = { id: 'u1', username: 'sam', display_name: 'Sam Lee', avatar_url: null };
    expect(inviteTitle(invite({ status: 'joined', joined }))).toBe('Sam Lee');
    expect(
      inviteTitle(invite({ status: 'joined', joined: { ...joined, display_name: null } }))
    ).toBe('@sam');
    expect(inviteTitle(invite())).toBe('Invite for a mate');
    expect(inviteTitle(invite({ kind: 'tag' }))).toBe('Tag invite');
  });
});

describe('resendButton', () => {
  it('offers Resend once the wait is over', () => {
    expect(resendButton(invite(), NOW)).toEqual({ kind: 'resend', label: 'Resend' });
  });

  it('counts down while it has to wait', () => {
    const waiting = invite({ can_resend: false, resend_at: inHours(4.2) });
    expect(resendButton(waiting, NOW)).toEqual({ kind: 'wait', label: 'Resend in 5h' });
    expect(resendButton(invite({ can_resend: false, resend_at: inHours(0.25) }), NOW)).toEqual({
      kind: 'wait',
      label: 'Resend in 15m',
    });
  });

  it('opens up when the countdown reaches zero, even before the next read', () => {
    expect(resendButton(invite({ can_resend: false, resend_at: hoursAgo(0.01) }), NOW)).toEqual({
      kind: 'resend',
      label: 'Resend',
    });
  });

  it('says how many times after the limit', () => {
    expect(
      resendButton(invite({ can_resend: false, resend_at: null, send_count: 4 }), NOW)
    ).toEqual({ kind: 'limit', label: 'Resent 3 times' });
    expect(
      resendButton(invite({ can_resend: false, resend_at: null, send_count: 2 }), NOW)
    ).toEqual({ kind: 'limit', label: 'Resent 1 time' });
  });

  it('is gone once joined or cancelled, and busy while sending', () => {
    expect(resendButton(invite({ status: 'joined' }), NOW).kind).toBe('none');
    expect(resendButton(invite({ status: 'cancelled' }), NOW).kind).toBe('none');
    expect(resendButton({ ...invite(), pending: 'resending' }, NOW)).toEqual({
      kind: 'busy',
      label: 'Sending…',
    });
  });

  it('can bring back a link that ran out', () => {
    expect(resendButton(invite({ status: 'expired' }), NOW).kind).toBe('resend');
  });
});

describe('canCancel', () => {
  it('only while a link is waiting and nothing is in flight', () => {
    expect(canCancel(invite())).toBe(true);
    expect(canCancel(invite({ status: 'expired' }))).toBe(false);
    expect(canCancel(invite({ status: 'joined' }))).toBe(false);
    expect(canCancel({ ...invite(), pending: 'resending' })).toBe(false);
  });

  it('asks first, in plain words', () => {
    expect(CANCEL_CONFIRM).toEqual({
      title: 'Cancel this invite?',
      message: 'The link will stop working.',
      confirm: 'Cancel invite',
      keep: 'Keep it',
    });
  });
});

describe('inviteErrorText', () => {
  it.each([
    ['resend: too soon', 'You can send this again later.'],
    ['resend: limit reached', 'You’ve sent this link as many times as you can.'],
    ['resend: already joined', 'They’ve already joined.'],
    ['cancel: already joined', 'They’ve already joined.'],
    ['resend: cancelled', 'That invite was cancelled.'],
    ['too many open invites', 'Too many invites waiting. Cancel one first.'],
    ['invite links are off', 'Links are off right now.'],
    ['that invite is not valid', 'That invite can’t be found.'],
  ])('%s', (message, words) => {
    expect(inviteErrorText(message)).toBe(words);
    expect(isInviteRefusal(message)).toBe(true);
  });

  it('anything else is a failure worth reporting', () => {
    expect(inviteErrorText('Network request failed')).toBe('Couldn’t do that. Try again.');
    expect(isInviteRefusal('Network request failed')).toBe(false);
  });
});

describe('optimistic rows', () => {
  const list = [invite(), invite({ token: 't2', code: 'XYZ789' })];

  it('cancel shows at once, and rolls back', () => {
    const next = applyCancel(list, 't1');
    expect(next[0]).toMatchObject({
      status: 'cancelled',
      can_resend: false,
      pending: 'cancelling',
    });
    expect(next[1]).toBe(list[1]);
    expect(restoreInvite(next, list[0])).toEqual(list);
  });

  it('resend shows sending, then the server row', () => {
    const next = applyResend(list, 't1');
    expect(next[0].pending).toBe('resending');
    expect(next[0].status).toBe('waiting');
    const server = invite({ send_count: 2, last_sent_at: new Date(NOW).toISOString() });
    const done = reconcileInvite(next, server);
    expect(done[0]).toEqual(server);
    expect(done[0].pending).toBeUndefined();
  });

  it('a reconcile for a row no longer listed changes nothing', () => {
    expect(reconcileInvite(list, invite({ token: 'gone' }))).toEqual(list);
  });
});

describe('inviteSummary', () => {
  it('counts waiting and joined', () => {
    const joined = { id: 'u1', username: 'sam', display_name: null, avatar_url: null };
    const rows = [
      invite(),
      invite({ token: 't2' }),
      invite({ token: 't3' }),
      invite({ token: 't4', status: 'joined', joined }),
      invite({ token: 't5', status: 'expired' }),
    ];
    expect(inviteSummary(rows)).toBe('3 waiting · 1 joined');
    expect(inviteSummary([invite({ status: 'joined', joined })])).toBe('1 joined');
  });

  it('has words for none, and for only ended links', () => {
    expect(inviteSummary([])).toBe('No invites yet');
    expect(inviteSummary([invite({ status: 'expired' })])).toBe('None waiting');
  });
});

describe('inviteBadgeCount — the number on "See your invites" and in Settings', () => {
  it('counts invites still waiting or joined; expired and cancelled ones drop off', () => {
    const joined = { id: 'u1', username: 'sam', display_name: null, avatar_url: null };
    expect(
      inviteBadgeCount([
        invite(),
        invite({ token: 't2', status: 'joined', joined }),
        invite({ token: 't3', status: 'expired' }),
        invite({ token: 't4', status: 'cancelled' }),
      ])
    ).toBe(2);
    expect(inviteBadgeCount([])).toBe(0);
  });
});
