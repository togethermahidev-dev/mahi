import { inviteStepCopy, slotCount, tagSheetStep } from '../inviteStep';

describe('slotCount', () => {
  it('counts friends and invites together against the slots', () => {
    expect(slotCount({ maxTags: 3, friends: 1, invites: 1 })).toEqual({
      filled: 2,
      remaining: 1,
      total: 3,
      text: '2 of 3 filled · 1 friend, 1 invite',
    });
  });

  it('says plainly when nothing is filled yet', () => {
    expect(slotCount({ maxTags: 3, friends: 0, invites: 0 }).text).toBe('0 of 3 filled');
  });

  it('names only what is there, with plurals', () => {
    expect(slotCount({ maxTags: 3, friends: 0, invites: 3 }).text).toBe(
      '3 of 3 filled · 3 invites'
    );
    expect(slotCount({ maxTags: 3, friends: 2, invites: 0 }).text).toBe(
      '2 of 3 filled · 2 friends'
    );
  });

  it('never goes below zero remaining', () => {
    expect(slotCount({ maxTags: 3, friends: 2, invites: 2 }).remaining).toBe(0);
  });
});

describe('tagSheetStep', () => {
  const base = {
    flagOn: true,
    canInvite: true,
    singleShot: false,
    availableFriends: 0 as number | null,
    maxTags: 3,
  };

  it('leads with the invite step when friends cannot fill the slots', () => {
    expect(tagSheetStep(base)).toBe('invite');
    expect(tagSheetStep({ ...base, availableFriends: 2 })).toBe('invite');
  });

  it('shows the friends list when there are enough friends to tag', () => {
    expect(tagSheetStep({ ...base, availableFriends: 3 })).toBe('friends');
    expect(tagSheetStep({ ...base, availableFriends: 12 })).toBe('friends');
  });

  it('waits, showing neither, until it knows how many friends there are', () => {
    expect(tagSheetStep({ ...base, availableFriends: null })).toBe('loading');
  });

  it('is today exactly when the flag is off, invites are off, or picking from a caption @', () => {
    expect(tagSheetStep({ ...base, flagOn: false })).toBe('friends');
    expect(tagSheetStep({ ...base, canInvite: false })).toBe('friends');
    expect(tagSheetStep({ ...base, singleShot: true })).toBe('friends');
    expect(tagSheetStep({ ...base, flagOn: false, availableFriends: null })).toBe('friends');
  });
});

describe('inviteStepCopy', () => {
  it('asks a newcomer with no friends to invite all 3', () => {
    expect(inviteStepCopy({ maxTags: 3, availableFriends: 0, friends: 0, invites: 0 })).toEqual({
      headline: 'Invite 3 friends to post',
      why: 'Every post tags 3 friends. Invite people you’d like to train with. They’ll get 48 hours to answer with any workout. A walk counts.',
      button: 'Invite a friend',
      canAdd: true,
      count: '0 of 3 filled',
    });
  });

  it('asks only for the slots friends cannot fill', () => {
    const copy = inviteStepCopy({ maxTags: 3, availableFriends: 2, friends: 2, invites: 0 });
    expect(copy.headline).toBe('Invite 1 friend to post');
    expect(copy.count).toBe('2 of 3 filled · 2 friends');
  });

  it('stops offering more invites once every slot is filled', () => {
    const copy = inviteStepCopy({ maxTags: 3, availableFriends: 0, friends: 0, invites: 3 });
    expect(copy.canAdd).toBe(false);
    expect(copy.button).toBe('All 3 tags used');
    expect(copy.count).toBe('3 of 3 filled · 3 invites');
  });
});
