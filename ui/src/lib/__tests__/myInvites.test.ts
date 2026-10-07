import {
  inviteBadgeCount,
  applyCancel,
  applyResend,
  canCancel,
  inviteErrorText,
  inviteSummary,
  inviteTitle,
  inviteWhatText,
  inviteWhenText,
  inviteChannel,
  inviteSections,
  resendPlace,
  formatPhone,
  dayText,
  codeText,
  CODE_HINT,
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
  sent_via: null,
  sent_to_name: null,
  sent_to_phone: null,
  post_id: null,
  post_created_at: null,
  ...over,
});

const SAM = { id: 'u1', username: 'sam', display_name: 'Sam Lee', avatar_url: null };
// Wed 7 Oct 2026, midday, so the day is the same in every time zone the tests run in.
const WED = '2026-10-07T12:00:00Z';

describe('inviteTitle — who, or where it went', () => {
  it('is who joined', () => {
    expect(inviteTitle(invite({ status: 'joined', joined: SAM }))).toBe('Sam Lee');
    expect(inviteTitle(invite({ status: 'joined', joined: { ...SAM, display_name: null } }))).toBe(
      '@sam'
    );
  });

  it('is the person it was sent to', () => {
    expect(
      inviteTitle(
        invite({ sent_via: 'contact', sent_to_name: 'Sam', sent_to_phone: '+447700900123' })
      )
    ).toBe('Sent to Sam');
    expect(
      inviteTitle(
        invite({ sent_via: 'contact', sent_to_name: null, sent_to_phone: '+447700900123' })
      )
    ).toBe('Sent to +44 7700 900123');
  });

  it('is how it was shared', () => {
    expect(inviteTitle(invite({ sent_via: 'whatsapp' }))).toBe('Shared on WhatsApp');
    expect(inviteTitle(invite({ sent_via: 'messages' }))).toBe('Shared by Messages');
    expect(inviteTitle(invite({ sent_via: 'share' }))).toBe('Shared by link');
    expect(inviteTitle(invite({ sent_via: 'copy' }))).toBe('Link copied');
  });

  it('an older link, or one from an older server, is an invite link', () => {
    expect(inviteTitle(invite())).toBe('Invite link');
    expect(inviteTitle(invite({ kind: 'tag' }))).toBe('Invite link');
    const old: Partial<MyInvite> = invite();
    delete old.sent_via;
    expect(inviteTitle(old as MyInvite)).toBe('Invite link');
  });
});

describe('formatPhone', () => {
  it('spaces a number out the way people read it', () => {
    expect(formatPhone('+447700900123')).toBe('+44 7700 900123');
    expect(formatPhone('+12025550123')).toBe('+1 202 555 0123');
    expect(formatPhone('+33612345678')).toBe('+33612345678');
  });
});

describe('inviteWhatText — what the link does', () => {
  it('a tag link: 48 hours to post back once they join', () => {
    expect(inviteWhatText(invite({ kind: 'tag' }))).toBe(
      'They’ll have 48 hours to post back once they join.'
    );
  });

  it('a link for a mate: you follow each other', () => {
    expect(inviteWhatText(invite())).toBe('You’ll follow each other when they join.');
  });

  it('joined: you follow each other, the same mutual follow every other screen promises', () => {
    expect(inviteWhatText(invite({ status: 'joined', joined: SAM }))).toBe(
      'Joined · you follow each other'
    );
    expect(inviteWhatText(invite({ kind: 'tag', status: 'joined', joined: SAM }))).toBe(
      'Joined · you follow each other'
    );
  });
});

describe('dayText', () => {
  it('reads like "Wed 7 Oct"', () => {
    expect(dayText(WED)).toBe('Wed 7 Oct');
    expect(dayText('2026-01-01T12:00:00Z')).toBe('Thu 1 Jan');
  });
});

describe('inviteWhenText — where it is at, and when it went', () => {
  it('a waiting link: when it was sent', () => {
    expect(inviteWhenText(invite({ last_sent_at: WED }))).toBe('Waiting · Sent Wed 7 Oct');
  });

  it('a tag link that went with a post', () => {
    const tag = invite({
      kind: 'tag',
      last_sent_at: WED,
      post_id: 'p1',
      post_created_at: WED,
    });
    expect(inviteWhenText(tag)).toBe('Waiting · Sent with your post · Wed 7 Oct');
  });

  it('a tag link not posted with yet just says when', () => {
    expect(inviteWhenText(invite({ kind: 'tag', last_sent_at: WED }))).toBe(
      'Waiting · Sent Wed 7 Oct'
    );
  });

  it('keeps the status words', () => {
    expect(inviteWhenText(invite({ status: 'expired', last_sent_at: WED }))).toBe(
      'Expired · Sent Wed 7 Oct'
    );
    expect(inviteWhenText(invite({ status: 'cancelled', last_sent_at: WED }))).toBe(
      'Cancelled · Sent Wed 7 Oct'
    );
    // Joined is already on the line above.
    expect(inviteWhenText(invite({ status: 'joined', joined: SAM, last_sent_at: WED }))).toBe(
      'Sent Wed 7 Oct'
    );
  });

  it('says it is sending while the server confirms a resend', () => {
    expect(inviteWhenText({ ...invite(), pending: 'resending' })).toBe('Sending…');
  });
});

describe('inviteChannel — the picture when nobody has joined yet', () => {
  it('follows how it went', () => {
    expect(inviteChannel(invite({ status: 'joined', joined: SAM }))).toBe('joined');
    expect(inviteChannel(invite({ sent_via: 'contact', sent_to_phone: '+447700900123' }))).toBe(
      'contact'
    );
    expect(inviteChannel(invite({ sent_via: 'whatsapp' }))).toBe('whatsapp');
    expect(inviteChannel(invite({ sent_via: 'messages' }))).toBe('messages');
    expect(inviteChannel(invite({ sent_via: 'share' }))).toBe('share');
    expect(inviteChannel(invite({ sent_via: 'copy' }))).toBe('copy');
    expect(inviteChannel(invite())).toBe('link');
  });
});

describe('resendPlace — resend opens the same place', () => {
  it('WhatsApp again', () => {
    expect(resendPlace(invite({ sent_via: 'whatsapp' }))).toEqual({
      open: 'whatsapp',
      via: 'whatsapp',
      toName: null,
      toPhone: null,
    });
  });

  it('a text to the same number', () => {
    expect(
      resendPlace(
        invite({ sent_via: 'contact', sent_to_name: 'Sam', sent_to_phone: '+447700900123' })
      )
    ).toEqual({ open: 'sms', via: 'contact', toName: 'Sam', toPhone: '+447700900123' });
  });

  it('Messages again', () => {
    expect(resendPlace(invite({ sent_via: 'messages' }))).toEqual({
      open: 'sms',
      via: 'messages',
      toName: null,
      toPhone: null,
    });
  });

  it('anything else: the share sheet', () => {
    const sheet = { open: 'share', via: 'share', toName: null, toPhone: null };
    expect(resendPlace(invite({ sent_via: 'share' }))).toEqual(sheet);
    expect(resendPlace(invite({ sent_via: 'copy' }))).toEqual(sheet);
    expect(resendPlace(invite())).toEqual(sheet);
  });
});

describe('inviteSections — Waiting, Joined, Older', () => {
  it('groups in that order, newest first inside, and hides an empty group', () => {
    const rows = [
      invite({ token: 'a', status: 'expired' }),
      invite({ token: 'b' }),
      invite({ token: 'c', status: 'joined', joined: SAM }),
      invite({ token: 'd', status: 'cancelled' }),
      invite({ token: 'e' }),
    ];
    expect(
      inviteSections(rows).map((r) => (r.type === 'header' ? `# ${r.title}` : r.invite.token))
    ).toEqual(['# Waiting', 'b', 'e', '# Joined', 'c', '# Older', 'a', 'd']);
    expect(
      inviteSections([invite({ status: 'joined', joined: SAM })]).map((r) =>
        r.type === 'header' ? `# ${r.title}` : r.invite.token
      )
    ).toEqual(['# Joined', 't1']);
    expect(inviteSections([])).toEqual([]);
  });
});

describe('the code, for when the link didn’t arrive', () => {
  it('is tucked away behind a question', () => {
    expect(CODE_HINT).toBe('Didn’t get the link?');
    expect(codeText(invite())).toBe('Code ABC234');
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
