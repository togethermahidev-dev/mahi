import {
  ACCOUNT_OPTIONS,
  PRIVACY_CHOICE_LEDE,
  SECURITY_ROW,
  securityRowLabel,
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
import { SEGMENTED } from '@/constants/tokens';

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

  // Owner, 2026-10-10: "Everyone, I approve first" was worded long; one word each.
  it('who can tag you', () => {
    expect(TAG_OPTIONS.map((o) => o.label)).toEqual(['Everyone', 'Approved', 'Friends']);
    expect(tagDescription('everyone')).toBe('Anyone can tag you.');
    expect(tagDescription('approve')).toBe(
      'Friends tag you straight away; anyone else asks first.'
    );
    expect(tagDescription('friends')).toBe('Only friends can tag you.');
  });

  // One word each, so three options sit side by side on one line; the line under the control
  // says what the chosen one means.
  it('every option is one word, on one line, with a line that says what it means', () => {
    for (const option of [...ACCOUNT_OPTIONS, ...WORKOUT_OPTIONS, ...TAG_OPTIONS]) {
      expect(option.label).toMatch(/^\S+$/);
      expect(option.description).not.toBe('');
    }
    expect(SEGMENTED.labelLines).toBe(1);
    // A label too long for its share shrinks before it is cut; it never wraps.
    expect(SEGMENTED.labelMinScale).toBeGreaterThan(0);
    expect(SEGMENTED.labelMinScale).toBeLessThan(1);
  });
});

// Owner, 2026-10-10: the controls left the main Settings list for the page this row opens.
describe('the Settings row that opens the privacy controls', () => {
  it('says what is inside now', () => {
    expect(SECURITY_ROW).toEqual({
      title: 'Security and privacy',
      detail: 'Privacy controls, blocks, account access and deletion',
    });
  });

  // Follow requests used to show their number on the main list; the row that leads to them
  // carries it now, and VoiceOver says what the number counts.
  it('tells VoiceOver how many follow requests wait behind it', () => {
    expect(securityRowLabel(0)).toBe('Security and privacy');
    expect(securityRowLabel(1)).toBe('Security and privacy, 1 follow request');
    expect(securityRowLabel(3)).toBe('Security and privacy, 3 follow requests');
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
