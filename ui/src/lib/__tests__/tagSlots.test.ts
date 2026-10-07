import {
  inviteBlockedReason,
  isSlotRefusal,
  mergeSlots,
  postRefusal,
  personAction,
  postButtonLabel,
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
    expect(slotStateText('shared')).toBe('Sent');
    expect(slotStateText('invite_sent')).toBe('Request sent');
    expect(slotStateText('accepted')).toBe('Accepted · following');
    expect(slotStateText('joined')).toBe('Joined · following');
    expect(slotStateText('tagged')).toBe('Tagged');
    expect(slotStateText('answered')).toBe('Answered');
    expect(slotStateText('missed')).toBe('Missed');
    expect(slotStateText('declined')).toBe('Not now');
    expect(slotStateText('expired')).toBe('Ended');
    expect(slotStateText('cancelled')).toBe('Ended');
  });
});

describe('slotLabel', () => {
  it('names the person once there is one', () => {
    expect(slotLabel(slot({ username: 'sam', state: 'joined' }), 0)).toBe('@sam');
  });

  it('numbers a link nobody has joined from yet', () => {
    expect(slotLabel(slot(), 1)).toBe('Link 2');
  });
});

describe('inviteBlockedReason', () => {
  it('allows a link even while a current friend could be tagged', () => {
    expect(inviteBlockedReason({ filled: 1, maxTags: 3 })).toBeNull();
    expect(inviteBlockedReason({ filled: 0, maxTags: 3 })).toBeNull();
  });

  it('blocks once every slot is filled', () => {
    expect(inviteBlockedReason({ filled: 3, maxTags: 3 })).toBe('All 3 tags used');
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
      note: 'accepting means you’ll follow each other',
    });
  });

  it('says why someone cannot be picked', () => {
    expect(personAction({ ...p, tagged_you: true, has_open_tag: true }, false)).toEqual({
      action: 'none',
      note: 'tagged you, can’t tag back',
    });
    expect(personAction({ ...p, has_open_tag: true }, false)).toEqual({
      action: 'none',
      note: 'you tagged them, open until they answer',
    });
    expect(personAction({ ...p, is_friend: false, has_open_tag: true }, false)).toEqual({
      action: 'none',
      note: 'request sent',
    });
  });
});

describe('slotShareMessage', () => {
  it('keeps the invitation low-pressure and leaves out the signup code', () => {
    expect(slotShareMessage('https://togethermahi.com/i/t1', 'ABC234')).toBe(
      'I tagged you on Mahi. Join me for a workout — we’ll automatically follow each other when you join.\nhttps://togethermahi.com/i/t1'
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
      'Too many links and tag requests waiting. Take one back first.'
    );
    expect(slotErrorText('already friends')).toBe('You’re friends already. Tag them instead.');
    expect(slotErrorText('invite links are off')).toBe('Links are off right now.');
    expect(slotErrorText('already invited')).toBe('Tag request already sent.');
    expect(slotErrorText('cannot invite that person')).toBe('You can’t send them a tag request.');
    expect(slotErrorText('that invite is no longer open')).toBe('That link has ended.');
    expect(slotErrorText('tag your friends first')).toBe('Tag your friends first.');
    expect(slotErrorText('network down')).toBe('Couldn’t do that. Try again.');
  });
});

describe('isSlotRefusal (a rule said no, not a bug to report)', () => {
  it('is true for the server’s known refusals and false for anything else', () => {
    expect(isSlotRefusal('too many open invites')).toBe(true);
    expect(isSlotRefusal('already invited')).toBe(true);
    expect(isSlotRefusal('that invite is no longer open')).toBe(true);
    expect(isSlotRefusal('network down')).toBe(false);
    expect(isSlotRefusal('')).toBe(false);
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

// Review, 2026-10-05: a refused post threw the photos away and blamed "your tags changed".
describe('postRefusal', () => {
  it('no tag to answer: nothing to keep, the post cannot happen', () => {
    expect(postRefusal('reactive posting: not tagged')).toEqual({
      text: 'Your tag has ended, so this can’t be posted. You can post again when a friend tags you.',
      keepPhotos: false,
      refused: true,
      report: false,
    });
  });

  it('friends first: says so, and keeps the photos to post again', () => {
    expect(postRefusal('tag your friends first')).toEqual({
      text: 'Tag your friends first. A link only fills a tag your friends can’t.',
      keepPhotos: true,
      refused: true,
      report: false,
    });
  });

  it('an invite that ended, or tags that changed: keeps the photos', () => {
    expect(postRefusal('that invite is no longer open').keepPhotos).toBe(true);
    expect(postRefusal('that invite is no longer open').text).toBe(
      'A link or tag request has ended. Check your tags and post again.'
    );
    expect(postRefusal('cannot tag that person')).toEqual({
      text: 'Your tags changed. Check them and post again.',
      keepPhotos: true,
      refused: true,
      report: false,
    });
  });

  it('anything else (a dropped connection): keeps the photos and is reported', () => {
    expect(postRefusal('network request failed')).toEqual({
      text: 'Couldn’t post. Your photos are still here. Try again.',
      keepPhotos: true,
      refused: false,
      report: true,
    });
  });

  it('only a real server refusal lets the uploads go: a lost reply may still have posted', () => {
    // The post may be live and pointing at these files, so they stay and the retry reuses the id.
    expect(postRefusal('Network request failed').refused).toBe(false);
    expect(postRefusal('').refused).toBe(false);
    expect(postRefusal('reactive posting: not tagged').refused).toBe(true);
  });
});

describe('postButtonLabel', () => {
  it('says Post when nothing is missing', () => {
    expect(postButtonLabel(0, true)).toBe('Post');
    expect(postButtonLabel(0, false)).toBe('Post');
  });

  it('says how many friends to tag when none are tagged yet', () => {
    expect(postButtonLabel(3, false)).toBe('Tag 3 friends to post');
    expect(postButtonLabel(1, false)).toBe('Tag 1 friend to post');
  });

  it('says how many more once some are tagged', () => {
    expect(postButtonLabel(1, true)).toBe('Tag 1 more friend to post');
    expect(postButtonLabel(2, true)).toBe('Tag 2 more friends to post');
  });
});
