import {
  inviteBlockedReason,
  mergeSlots,
  personAction,
  shareAppUrl,
  slotErrorText,
  slotLabel,
  slotShareMessage,
  slotStateText,
  tagInviteState,
  type ScreenSlot,
} from '../tagSlots';

const slot = (over: Partial<ScreenSlot> = {}): ScreenSlot => ({
  challenge_id: 'c1',
  kind: 'link',
  state: 'link_ready',
  user_id: null,
  username: null,
  display_name: null,
  avatar_url: null,
  token: 't1',
  code: 'ABC234',
  url: 'https://togethermahi.com/i/t1',
  expires_at: null,
  server_now: '2026-10-03T12:00:00Z',
  created_at: '2026-10-03T12:00:00Z',
  ...over,
});

describe('slotStateText', () => {
  it('says where each slot is at, in plain words', () => {
    expect(slotStateText('link_ready')).toBe('Link ready');
    expect(slotStateText('shared')).toBe('Shared');
    expect(slotStateText('joined')).toBe('Joined');
    expect(slotStateText('invite_sent')).toBe('Invite sent');
    expect(slotStateText('accepted')).toBe('Accepted');
    expect(slotStateText('tagged')).toBe('Tagged');
    expect(slotStateText('answered')).toBe('Answered');
    expect(slotStateText('missed')).toBe('Missed');
    expect(slotStateText('declined')).toBe('Not now');
    expect(slotStateText('expired')).toBe('Expired');
    expect(slotStateText('cancelled')).toBe('Cancelled');
  });
});

describe('slotLabel', () => {
  it('names the person once there is one', () => {
    expect(slotLabel(slot({ username: 'sam', state: 'joined' }), 0)).toBe('@sam');
  });

  it('numbers a link nobody has joined from yet', () => {
    expect(slotLabel(slot(), 1)).toBe('Invite 2');
  });
});

describe('inviteBlockedReason (friends first, as the server enforces)', () => {
  it('blocks an invite while a friend could still be tagged', () => {
    expect(inviteBlockedReason({ freeFriends: 1, filled: 1, maxTags: 3 })).toBe(
      'Tag your free friend first'
    );
    expect(inviteBlockedReason({ freeFriends: 2, filled: 0, maxTags: 3 })).toBe(
      'Tag your 2 free friends first'
    );
  });

  it('blocks once every slot is filled', () => {
    expect(inviteBlockedReason({ freeFriends: 0, filled: 3, maxTags: 3 })).toBe('All 3 filled');
  });

  it('allows an invite when no friend is free', () => {
    expect(inviteBlockedReason({ freeFriends: 0, filled: 1, maxTags: 3 })).toBeNull();
  });
});

describe('personAction', () => {
  const p = { is_friend: true, has_open_tag: false, tagged_you: false };

  it('tags a free friend, and untags one already picked', () => {
    expect(personAction(p, false)).toEqual({ action: 'tag', note: null });
    expect(personAction(p, true)).toEqual({ action: 'untag', note: null });
  });

  it('invites someone on Mahi who is not a friend', () => {
    expect(personAction({ ...p, is_friend: false }, false)).toEqual({
      action: 'invite',
      note: 'not your friend yet',
    });
  });

  it('says why someone cannot be picked', () => {
    expect(personAction({ ...p, tagged_you: true, has_open_tag: true }, false)).toEqual({
      action: 'none',
      note: 'tagged you, can’t tag back',
    });
    expect(personAction({ ...p, has_open_tag: true }, false).action).toBe('none');
    expect(personAction({ ...p, is_friend: false, has_open_tag: true }, false)).toEqual({
      action: 'none',
      note: 'invite sent',
    });
  });
});

describe('slotShareMessage', () => {
  it('carries the link and the code, so it works before links open the app', () => {
    expect(slotShareMessage('https://togethermahi.com/i/t1', 'ABC234')).toBe(
      'I tagged you on Mahi. Join and you’ve got 48 hours to post your workout, then tag 3 mates.\n' +
        'https://togethermahi.com/i/t1\nOr use code ABC234 when you sign up.'
    );
  });
});

describe('shareAppUrl', () => {
  it('opens WhatsApp with the message written in', () => {
    expect(shareAppUrl('whatsapp', 'hi there', 'ios')).toBe('whatsapp://send?text=hi%20there');
  });

  it('opens Messages the way each phone expects', () => {
    expect(shareAppUrl('messages', 'hi', 'ios')).toBe('sms:&body=hi');
    expect(shareAppUrl('messages', 'hi', 'android')).toBe('sms:?body=hi');
  });
});

describe('mergeSlots', () => {
  it('keeps slots still being made on this phone after a fresh read', () => {
    const making = slot({ challenge_id: 'pending:1', pending: true });
    expect(mergeSlots([slot()], [making]).map((s) => s.challenge_id)).toEqual(['c1', 'pending:1']);
  });

  it('a read from before the share never turns Shared back into Link ready', () => {
    expect(mergeSlots([slot()], [slot({ state: 'shared' })])[0].state).toBe('shared');
    expect(mergeSlots([slot({ state: 'joined' })], [slot({ state: 'shared' })])[0].state).toBe(
      'joined'
    );
  });

  it('never shows the same slot twice', () => {
    expect(mergeSlots([slot()], [slot({ pending: true })])).toHaveLength(1);
  });
});

describe('slotErrorText', () => {
  it('turns server refusals into plain words', () => {
    expect(slotErrorText('too many open invites')).toBe(
      'Too many invites waiting. Remove one first.'
    );
    expect(slotErrorText('already friends')).toBe('You’re friends already. Tag them instead.');
    expect(slotErrorText('already invited')).toBe('Invite already sent.');
    expect(slotErrorText('cannot invite that person')).toBe('You can’t invite them.');
    expect(slotErrorText('that invite is no longer open')).toBe('That invite has ended.');
    expect(slotErrorText('tag your friends first')).toBe('Tag your free friends first.');
    expect(slotErrorText('network down')).toBe('Couldn’t do that. Try again.');
  });
});

describe('tagInviteState (the invited person’s side)', () => {
  const row = {
    requested_at: '2026-10-03T12:00:00Z',
    accepted_at: null,
    declined_at: null,
    cancelled_at: null,
  };
  const now = Date.parse('2026-10-04T12:00:00Z');

  it('is open until answered, taken back or 7 days old', () => {
    expect(tagInviteState(row, now)).toBe('open');
    expect(tagInviteState({ ...row, accepted_at: '2026-10-03T13:00:00Z' }, now)).toBe('accepted');
    expect(tagInviteState({ ...row, declined_at: '2026-10-03T13:00:00Z' }, now)).toBe('declined');
    expect(tagInviteState({ ...row, cancelled_at: '2026-10-03T13:00:00Z' }, now)).toBe('ended');
    expect(tagInviteState(row, Date.parse('2026-10-10T12:00:01Z'))).toBe('ended');
  });

  it('a declined invite reads as declined, not ended', () => {
    expect(
      tagInviteState(
        { ...row, declined_at: '2026-10-03T13:00:00Z', cancelled_at: '2026-10-03T13:00:00Z' },
        now
      )
    ).toBe('declined');
  });
});
