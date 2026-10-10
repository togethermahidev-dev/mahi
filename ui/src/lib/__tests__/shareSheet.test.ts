import {
  INVITE_A_FRIEND,
  MAX_SHARE_RECIPIENTS,
  filterFriends,
  friendLabel,
  keepFriends,
  readShareResult,
  shareErrorText,
  shareResultToast,
  sendLabel,
  shareSheetParts,
  shareTargets,
  toggleRecipient,
} from '@/lib/shareSheet';

const friend = (id: string, username: string, display_name: string | null = null) => ({
  id,
  username,
  display_name,
  first_name: null,
  last_name: null,
  avatar_url: null,
});

describe('picking friends', () => {
  it('a tap picks a friend, a second tap lets them go', () => {
    const one = toggleRecipient([], 'a');
    expect(one).toEqual({ selected: ['a'], full: false });
    expect(toggleRecipient(one.selected, 'b').selected).toEqual(['a', 'b']);
    expect(toggleRecipient(['a', 'b'], 'a')).toEqual({ selected: ['b'], full: false });
  });

  it('stops at 10, the most the server takes', () => {
    expect(MAX_SHARE_RECIPIENTS).toBe(10);
    const ten = Array.from({ length: 10 }, (_, i) => `f${i}`);
    expect(toggleRecipient(ten, 'one-more')).toEqual({ selected: ten, full: true });
    // Letting one go still works when full.
    expect(toggleRecipient(ten, 'f3').selected).toHaveLength(9);
    expect(toggleRecipient(ten.slice(0, 9), 'tenth')).toEqual({
      selected: [...ten.slice(0, 9), 'tenth'],
      full: false,
    });
  });

  it('never changes the list it was given', () => {
    const before = ['a'];
    toggleRecipient(before, 'b');
    toggleRecipient(before, 'a');
    expect(before).toEqual(['a']);
  });

  it('someone who stopped being a friend while the sheet is open leaves the picks', () => {
    expect(keepFriends(['a', 'b', 'c'], [friend('a', 'ann'), friend('c', 'cat')])).toEqual([
      'a',
      'c',
    ]);
    expect(keepFriends([], [friend('a', 'ann')])).toEqual([]);
  });
});

describe('the sheet per use', () => {
  it('a post: search and the friends grid', () => {
    expect(shareSheetParts('post')).toEqual({ title: 'Share', friends: true });
  });

  it('an invite: a title and the bottom row only', () => {
    expect(shareSheetParts('invite')).toEqual({ title: 'Invite a friend', friends: false });
  });

  // Owner, 2026-10-10: "Change mate to friend". One wording for the profile's round button, its
  // VoiceOver label and the sheet's title.
  it('says "Invite a friend" everywhere the invite is named, never "mate"', () => {
    expect(INVITE_A_FRIEND.label).toBe('Invite a friend');
    expect(shareSheetParts('invite').title).toBe(INVITE_A_FRIEND.label);
    expect(`${INVITE_A_FRIEND.label} ${INVITE_A_FRIEND.hint}`).not.toMatch(/\bmates?\b/i);
    expect(INVITE_A_FRIEND.hint.length).toBeGreaterThan(0);
  });
});

describe('the bottom row', () => {
  it('lists Copy link first, then the apps, then the phone’s own sheet', () => {
    expect(shareTargets(true)).toEqual([
      { target: 'copy', label: 'Copy link' },
      { target: 'whatsapp', label: 'WhatsApp' },
      { target: 'messages', label: 'Messages' },
      { target: 'snapchat', label: 'Snapchat' },
      { target: 'instagram', label: 'Instagram' },
      { target: 'more', label: 'Share to…' },
    ]);
  });

  it('leaves Copy link out on a build that can’t copy', () => {
    const targets = shareTargets(false).map((t) => t.target);
    expect(targets).toEqual(['whatsapp', 'messages', 'snapchat', 'instagram', 'more']);
  });

  it('has no story button', () => {
    expect(shareTargets(true).some((t) => /story/i.test(t.label))).toBe(false);
  });
});

describe('search', () => {
  const friends = [
    friend('1', 'sam_lifts', 'Sam Carter'),
    friend('2', 'joe91', null),
    { ...friend('3', 'kiri', null), first_name: 'Kiri', last_name: 'Waaka' },
  ];

  it('nothing typed: everyone, in the server’s order', () => {
    expect(filterFriends(friends, '')).toEqual(friends);
    expect(filterFriends(friends, '   ')).toEqual(friends);
  });

  it('finds by name or username, any case', () => {
    expect(filterFriends(friends, 'carter').map((f) => f.id)).toEqual(['1']);
    expect(filterFriends(friends, 'JOE').map((f) => f.id)).toEqual(['2']);
    expect(filterFriends(friends, 'waaka').map((f) => f.id)).toEqual(['3']);
    expect(filterFriends(friends, 'kiri w').map((f) => f.id)).toEqual(['3']);
  });

  it('takes a typed @', () => {
    expect(filterFriends(friends, '@sam').map((f) => f.id)).toEqual(['1']);
  });

  it('no match: nobody', () => {
    expect(filterFriends(friends, 'zzz')).toEqual([]);
  });
});

describe('the name under a photo', () => {
  it('is their name, else their first name, else their username', () => {
    expect(friendLabel(friend('1', 'sam_lifts', 'Sam Carter'))).toBe('Sam Carter');
    expect(friendLabel({ ...friend('3', 'kiri'), first_name: 'Kiri' })).toBe('Kiri');
    expect(friendLabel(friend('2', 'joe91'))).toBe('joe91');
  });
});

describe('what the server answered', () => {
  it('counts who it went to and who it couldn’t', () => {
    expect(
      readShareResult({
        sent: [
          { user_id: 'a', conversation_id: 'c1', status: 'active', message: {} },
          { user_id: 'b', conversation_id: 'c2', status: 'requested', message: {} },
        ],
        skipped: ['c'],
      })
    ).toEqual({ sent: ['a', 'b'], skipped: ['c'] });
  });

  it('missing fields read as empty, never a crash', () => {
    expect(readShareResult(null)).toEqual({ sent: [], skipped: [] });
    expect(readShareResult({})).toEqual({ sent: [], skipped: [] });
    expect(readShareResult({ sent: 'x', skipped: null })).toEqual({ sent: [], skipped: [] });
    expect(readShareResult({ sent: [{}, null, { user_id: 'a' }] })).toEqual({
      sent: ['a'],
      skipped: [],
    });
  });
});

describe('the toast after Send', () => {
  it('says how many friends it went to', () => {
    expect(shareResultToast(1, 0)).toBe('Sent to 1 friend');
    expect(shareResultToast(3, 0)).toBe('Sent to 3 friends');
  });

  it('adds who it couldn’t be sent to', () => {
    expect(shareResultToast(2, 1)).toBe('Sent to 2 friends. Couldn’t send to 1.');
    expect(shareResultToast(0, 2)).toBe('Couldn’t send to 2.');
  });
});

describe('a failed send', () => {
  it('a post you can no longer see says so', () => {
    expect(shareErrorText('post not found')).toBe('You can’t share this post.');
  });

  it('anything else: try again', () => {
    expect(shareErrorText('Network request failed')).toBe('Couldn’t send. Try again.');
    expect(shareErrorText('')).toBe('Couldn’t send. Try again.');
  });
});

// The Send button says how many it goes to: a pick hidden by the search is still picked, and the
// count is the only place it shows.
describe('the Send button', () => {
  it('says how many friends it goes to', () => {
    expect(sendLabel(1)).toBe('Send to 1');
    expect(sendLabel(3)).toBe('Send to 3');
    expect(sendLabel(10)).toBe('Send to 10');
  });
});
