import {
  HOLD_UP,
  SHARE_TARGETS,
  contactPersonAction,
  inviteBlockedReason,
  isSlotRefusal,
  mateInviteErrorText,
  mateInviteMessage,
  mergeSlots,
  postRefusal,
  personAction,
  postButtonLabel,
  shareAppUrl,
  shareTargetVia,
  slotErrorText,
  slotLabel,
  slotShareMessage,
  slotStateText,
  tagInviteState,
  tagScreenWords,
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
    // A tag request accepted no longer means following (owner, 2026-10-08); a joined link still does.
    expect(slotStateText('accepted')).toBe('Accepted');
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

  it('a first post’s one tag reads as your mate picked', () => {
    expect(inviteBlockedReason({ filled: 1, maxTags: 1 })).toBe('You’ve picked your mate');
  });
});

describe('personAction', () => {
  const p = { is_friend: true, has_open_tag: false, tagged_you: false };

  it('tags a free friend, and untags one already picked', () => {
    expect(personAction(p, false)).toEqual({ action: 'tag', note: null });
    expect(personAction(p, true)).toEqual({ action: 'untag', note: null });
  });

  // Accepting a tag no longer makes you follow each other (owner, 2026-10-08).
  it('sends a tag request to someone on Mahi who is not a friend', () => {
    expect(personAction({ ...p, is_friend: false }, false)).toEqual({
      action: 'invite',
      note: 'sends a tag request',
    });
    expect(personAction({ ...p, is_friend: false, tag_mode: 'request' }, false)).toEqual({
      action: 'invite',
      note: 'sends a tag request',
    });
  });

  // Their "Who can tag you" control, read by the server as tag_mode (private accounts).
  it('tags straight away someone who lets anyone tag them', () => {
    expect(personAction({ ...p, is_friend: false, tag_mode: 'direct' }, false)).toEqual({
      action: 'tag',
      note: 'tagged straight away',
    });
    expect(personAction({ ...p, tag_mode: 'direct' }, false)).toEqual({
      action: 'tag',
      note: null,
    });
  });

  it('can’t pick someone who only takes tags from friends', () => {
    expect(personAction({ ...p, is_friend: false, tag_mode: 'none' }, false)).toEqual({
      action: 'none',
      note: 'only takes tags from friends',
    });
  });

  it('says why someone cannot be picked', () => {
    // Someone who tagged you can be tagged back (Maximus, 2026-10-07).
    expect(personAction({ ...p, tagged_you: true, has_open_tag: false }, false)).toEqual({
      action: 'tag',
      note: 'tagged you · tag them back',
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

describe('mateInviteMessage', () => {
  it('invites a friend without promising a tag', () => {
    expect(mateInviteMessage('https://togethermahi.com/i/t1')).toBe(
      'Join me on Mahi so we hold each other accountable. We’ll follow each other when you join.\nhttps://togethermahi.com/i/t1'
    );
  });
});

describe('mateInviteErrorText', () => {
  it('too many waiting: wait for a friend to join (there is nothing to take back)', () => {
    expect(mateInviteErrorText('too many open invites')).toBe(
      'Too many invites waiting. Try again when someone joins.'
    );
  });

  it('anything else: as on the tag screen', () => {
    expect(mateInviteErrorText('invite links are off')).toBe('Links are off right now.');
    expect(mateInviteErrorText('network down')).toBe('Couldn’t do that. Try again.');
  });
});

describe('slotShareMessage', () => {
  it('keeps the invitation low-pressure and leaves out the signup code', () => {
    expect(slotShareMessage('https://togethermahi.com/i/t1', 'ABC234')).toBe(
      'I tagged you on Mahi. You’ll have 48 hours from when you join to post any workout back. We’ll keep each other going.\nhttps://togethermahi.com/i/t1'
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
    // Their "Who can tag you" is Friends only (private accounts).
    expect(slotErrorText('only takes tags from friends')).toBe('They only take tags from friends.');
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
    expect(postButtonLabel(3, false)).toBe('Challenge 3 friends to post');
    expect(postButtonLabel(1, false)).toBe('Challenge 1 friend to post');
  });

  it('says how many more once some are tagged', () => {
    expect(postButtonLabel(1, true)).toBe('Challenge 1 more friend to post');
    expect(postButtonLabel(2, true)).toBe('Challenge 2 more friends to post');
  });
});

// Core workflow 2026-10-09: the tag screen's Post is the confirmation, so its words say what
// posting starts.
describe('tagScreenWords', () => {
  it('a first post tags one mate', () => {
    expect(tagScreenWords(1)).toEqual({
      title: 'Tag 1 mate',
      prompt: 'Pick 1 mate you want to see show up on Mahi.',
      footer: 'Your mate gets 48 hours to answer. You can edit your caption for 1 hour.',
    });
  });

  it('an answer tags the tag count', () => {
    expect(tagScreenWords(3)).toEqual({
      title: 'Tag 3 friends',
      prompt: 'Pick 3 friends you want to see show up on Mahi.',
      footer: 'Your mates get 48 hours to answer. You can edit your caption for 1 hour.',
    });
  });
});

describe('the first post’s hold up card', () => {
  it('says why and offers the tag screen', () => {
    expect(HOLD_UP).toEqual({
      title: 'Hold up ✋',
      line: 'Tag a friend to post your first Mahi. They’ll get a link to show up as well.',
      button: 'Tag mates',
    });
  });
});

describe('share targets', () => {
  it('WhatsApp, Messages, Snap, IG, then the phone’s own sheet', () => {
    expect(SHARE_TARGETS.map((t) => t.label)).toEqual([
      'WhatsApp',
      'Messages',
      'Snap',
      'IG',
      'More…',
    ]);
  });

  it('Snap and IG go through the share sheet, so they are recorded as share', () => {
    expect(shareTargetVia('snapchat', false)).toBe('share');
    expect(shareTargetVia('instagram', true)).toBe('share');
    expect(shareTargetVia('more', false)).toBe('share');
  });

  it('WhatsApp and Messages to a picked contact are recorded as contact', () => {
    expect(shareTargetVia('whatsapp', false)).toBe('whatsapp');
    expect(shareTargetVia('messages', false)).toBe('messages');
    expect(shareTargetVia('whatsapp', true)).toBe('contact');
    expect(shareTargetVia('messages', true)).toBe('contact');
  });
});

// The server refuses a non-friend in tagged users: someone from your contacts on Mahi is tagged
// only when you follow each other, otherwise they get a tag request.
describe('contactPersonAction', () => {
  const account = { is_following: true, follows_you: true };

  it('tags a friend', () => {
    expect(contactPersonAction(account, false)).toBe('tag');
  });

  it('a friend you already tagged can’t be tagged again', () => {
    expect(contactPersonAction(account, true)).toBe('none');
  });

  it('anyone else gets a tag request', () => {
    expect(contactPersonAction({ is_following: true, follows_you: false }, false)).toBe('invite');
    expect(contactPersonAction({ is_following: false, follows_you: true }, false)).toBe('invite');
  });
});
