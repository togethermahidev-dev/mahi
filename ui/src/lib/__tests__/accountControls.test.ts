import {
  ACCOUNT_OPTIONS,
  PRIVACY_CHOICE_LEDE,
  privacyChoicePatch,
  accountSwitchPatch,
  TAG_OPTIONS,
  WORKOUT_OPTIONS,
  accountDescription,
  effectiveVisibility,
  privacyConfirm,
  removeFollowerConfirm,
  restrictedText,
  showPrivacyChoice,
  tagAcceptPopup,
  tagDescription,
  workoutOptionDisabled,
  workoutsDescription,
} from '../accountControls';

// Owner-approved words (2026-10-08, plan-private-accounts.md "Proposed Controls design").
describe('Controls wording', () => {
  it('the account choice says what each means', () => {
    expect(ACCOUNT_OPTIONS.map((o) => o.label)).toEqual(['Public', 'Private']);
    expect(accountDescription(false, 'everyone')).toBe(
      'Anyone on Mahi can see your profile and workouts and follow you.'
    );
    // Owner, 2026-10-09 (core workflow, step 9).
    expect(accountDescription(true, 'followers')).toBe(
      'Only people you approve see your posts. Your name and photo still show.'
    );
  });

  // Owner, 2026-10-08: workouts default to Followers until someone chooses, so a public account
  // may not show its workouts to everyone. The words never claim it does.
  it('a public account whose workouts are for followers or friends says only the profile', () => {
    expect(accountDescription(false, 'followers')).toBe(
      'Anyone on Mahi can see your profile and follow you.'
    );
    expect(accountDescription(false, 'friends')).toBe(
      'Anyone on Mahi can see your profile and follow you.'
    );
  });

  it('who can see your workouts', () => {
    expect(WORKOUT_OPTIONS.map((o) => o.label)).toEqual(['Everyone', 'Followers', 'Friends']);
    expect(workoutsDescription('everyone')).toBe('Anyone on Mahi.');
    expect(workoutsDescription('followers')).toBe('People who follow you.');
    expect(workoutsDescription('friends')).toBe('People you follow back.');
  });

  it('who can tag you', () => {
    expect(TAG_OPTIONS.map((o) => o.label)).toEqual([
      'Everyone',
      'Everyone, I approve first',
      'Friends only',
    ]);
    expect(tagDescription('everyone')).toBe('Anyone can tag you.');
    expect(tagDescription('approve')).toBe(
      'Friends tag you straight away; anyone else asks first.'
    );
    expect(tagDescription('friends')).toBe('Only friends can tag you.');
  });
});

describe('workouts while private', () => {
  it('Everyone is not allowed while private, and counts as Followers', () => {
    expect(workoutOptionDisabled(true, 'everyone')).toBe(true);
    expect(workoutOptionDisabled(true, 'followers')).toBe(false);
    expect(workoutOptionDisabled(false, 'everyone')).toBe(false);
    expect(effectiveVisibility(true, 'everyone')).toBe('followers');
    expect(effectiveVisibility(true, 'friends')).toBe('friends');
    expect(effectiveVisibility(false, 'everyone')).toBe('everyone');
  });
});

describe('privacyConfirm', () => {
  it('going private keeps the followers you have', () => {
    expect(privacyConfirm(true)).toEqual({
      title: 'Switch to private?',
      message:
        'Only people you approve will see your workouts. People who follow you now keep seeing them.',
      confirm: 'Switch to private',
    });
  });

  it('going public accepts pending requests', () => {
    expect(privacyConfirm(false)).toEqual({
      title: 'Switch to public?',
      message: 'Anyone can see your workouts and follow you. Pending requests will be accepted.',
      confirm: 'Switch to public',
    });
  });
});

// The server keeps private + Everyone as Followers, and going public doesn't change it back:
// "Anyone can see your workouts" only holds if Everyone is sent with it.
describe('accountSwitchPatch', () => {
  it('going public also opens workouts to everyone', () => {
    expect(accountSwitchPatch(false)).toEqual({ is_private: false, posts_visibility: 'everyone' });
  });
  it('going private leaves the workouts setting to the server', () => {
    expect(accountSwitchPatch(true)).toEqual({ is_private: true });
  });
});

// The sign-up choice saves who sees workouts with it: Public means everyone, Private followers.
// Who can tag you is no longer asked there (owner, 2026-10-09): the server default stays.
describe('privacyChoicePatch', () => {
  it('Public opens workouts to everyone', () => {
    expect(privacyChoicePatch(false)).toEqual({
      is_private: false,
      posts_visibility: 'everyone',
    });
  });
  it('Private keeps them for followers', () => {
    expect(privacyChoicePatch(true)).toEqual({
      is_private: true,
      posts_visibility: 'followers',
    });
  });
  it('says the choice can be changed later', () => {
    expect(PRIVACY_CHOICE_LEDE).toBe('You can change this later in Settings.');
  });
  it('never sends who can tag you', () => {
    expect(privacyChoicePatch(false)).not.toHaveProperty('tag_permission');
    expect(privacyChoicePatch(true)).not.toHaveProperty('tag_permission');
  });
});

describe('removeFollowerConfirm', () => {
  it('they are not told', () => {
    expect(removeFollowerConfirm('sam', false)).toEqual({
      title: 'Remove @sam?',
      message: 'They won’t be told.',
      confirm: 'Remove',
      cancel: 'Cancel',
    });
  });

  it('a friend: open tags between you end', () => {
    expect(removeFollowerConfirm('sam', true).message).toBe(
      'They won’t be told. You’re friends, so any open tags between you end.'
    );
  });
});

describe('restrictedText (someone else’s profile you can’t see)', () => {
  it('names why, by the reason the server gives', () => {
    expect(restrictedText('private', 'sam')).toBe('This account is private');
    expect(restrictedText('followers', 'sam')).toBe('Only @sam’s followers see their workouts');
    expect(restrictedText('friends', 'sam')).toBe('Only @sam’s friends see their workouts');
  });
});

describe('tagAcceptPopup (after accepting a tag request)', () => {
  it('offers to follow back when you don’t follow them yet', () => {
    expect(
      tagAcceptPopup({ username: 'sam', you_follow_them: false, their_follow_request: false })
    ).toEqual({
      title: 'Follow @sam back?',
      options: [
        { key: 'follow_back', label: 'Follow back' },
        { key: 'not_now', label: 'Not now' },
      ],
    });
  });

  it('adds Accept their follow when their request is waiting', () => {
    expect(
      tagAcceptPopup({ username: 'sam', you_follow_them: false, their_follow_request: true })
        ?.options
    ).toEqual([
      { key: 'follow_back', label: 'Follow back' },
      { key: 'accept_follow', label: 'Accept their follow' },
      { key: 'not_now', label: 'Not now' },
    ]);
  });

  it('only their request when you already follow them', () => {
    expect(
      tagAcceptPopup({ username: 'sam', you_follow_them: true, their_follow_request: true })
    ).toEqual({
      title: 'Accept @sam’s follow?',
      options: [
        { key: 'accept_follow', label: 'Accept their follow' },
        { key: 'not_now', label: 'Not now' },
      ],
    });
  });

  it('nothing to ask: no popup (and none from an older server that sends no fields)', () => {
    expect(
      tagAcceptPopup({ username: 'sam', you_follow_them: true, their_follow_request: false })
    ).toBeNull();
    expect(tagAcceptPopup({ username: 'sam' })).toBeNull();
  });
});

describe('showPrivacyChoice (onboarding)', () => {
  it('only when the switch is on and the server says nothing was chosen yet', () => {
    expect(showPrivacyChoice({ flagOn: true, chosenAt: null })).toBe(true);
    expect(showPrivacyChoice({ flagOn: false, chosenAt: null })).toBe(false);
    expect(showPrivacyChoice({ flagOn: true, chosenAt: '2026-10-08T12:00:00Z' })).toBe(false);
    // A server without the column (undefined) or no profile yet: never shown.
    expect(showPrivacyChoice({ flagOn: true, chosenAt: undefined })).toBe(false);
  });
});
