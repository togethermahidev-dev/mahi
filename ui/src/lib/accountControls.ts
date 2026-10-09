/**
 * Public and private accounts — Settings → Controls (switch `private-accounts`, owner 2026-10-08).
 * The words and small rules the Controls, the sign-up choice and someone else's profile share.
 * The server enforces every rule (`set_account_controls`, `can_view_post`; migration
 * 20261008170000_private_accounts); these only say what each choice means.
 *
 * Pure and import-free so it runs under the node-only jest harness.
 */

export type PostsVisibility = 'everyone' | 'followers' | 'friends';
export type TagPermission = 'everyone' | 'approve' | 'friends';
/** Why someone else's workouts are hidden from you (`get_user_posts`' `restricted`). */
export type ProfileRestriction = 'private' | 'followers' | 'friends';

/** Your three controls, as `set_account_controls` hands them back. */
export type AccountControls = {
  is_private: boolean;
  posts_visibility: PostsVisibility;
  tag_permission: TagPermission;
};

type Option<T> = { value: T; label: string; description: string };

export const ACCOUNT_OPTIONS: readonly Option<boolean>[] = [
  {
    value: false,
    label: 'Public',
    description: 'Anyone on Mahi can see your profile and workouts and follow you.',
  },
  {
    value: true,
    label: 'Private',
    description: 'Only people you approve see your posts. Your name and photo still show.',
  },
];

export const WORKOUT_OPTIONS: readonly Option<PostsVisibility>[] = [
  { value: 'everyone', label: 'Everyone', description: 'Anyone on Mahi.' },
  { value: 'followers', label: 'Followers', description: 'People who follow you.' },
  { value: 'friends', label: 'Friends', description: 'People you follow back.' },
];

export const TAG_OPTIONS: readonly Option<TagPermission>[] = [
  { value: 'everyone', label: 'Everyone', description: 'Anyone can tag you.' },
  {
    value: 'approve',
    label: 'Everyone, I approve first',
    description: 'Friends tag you straight away; anyone else asks first.',
  },
  { value: 'friends', label: 'Friends only', description: 'Only friends can tag you.' },
];

const describe = <T>(options: readonly Option<T>[], value: T): string =>
  options.find((o) => o.value === value)?.description ?? '';

/**
 * What the account choice means right now. Workouts default to Followers until someone chooses
 * (owner, 2026-10-08), so a public account whose workouts aren't for everyone says only that
 * anyone can see the profile and follow.
 */
export function accountDescription(isPrivate: boolean, visibility: PostsVisibility): string {
  if (!isPrivate && visibility !== 'everyone') {
    return 'Anyone on Mahi can see your profile and follow you.';
  }
  return describe(ACCOUNT_OPTIONS, isPrivate);
}
export const workoutsDescription = (v: PostsVisibility) => describe(WORKOUT_OPTIONS, v);
export const tagDescription = (v: TagPermission) => describe(TAG_OPTIONS, v);

/** Everyone can't see a private account's workouts: the server stores it as Followers. */
export function workoutOptionDisabled(isPrivate: boolean, v: PostsVisibility): boolean {
  return isPrivate && v === 'everyone';
}

/** Who really sees your workouts (the server's `effective_posts_visibility`). */
export function effectiveVisibility(isPrivate: boolean, v: PostsVisibility): PostsVisibility {
  return workoutOptionDisabled(isPrivate, v) ? 'followers' : v;
}

/** The line under the choice after sign-up (owner, 2026-10-09). "Settings" is the screen's name. */
export const PRIVACY_CHOICE_LEDE = 'You can change this later in Settings.';

/**
 * What the choice after sign-up saves: Public opens workouts to everyone (as its card says),
 * Private keeps them for followers. Who can tag you isn't asked there (owner, 2026-10-09), so the
 * server's default stays.
 */
export function privacyChoicePatch(
  isPrivate: boolean
): Pick<AccountControls, 'is_private' | 'posts_visibility'> {
  return {
    is_private: isPrivate,
    posts_visibility: isPrivate ? 'followers' : 'everyone',
  };
}

/**
 * What switching sends. The server keeps private + Everyone as Followers and going public doesn't
 * change it back, so going public sends Everyone too: the confirm says anyone can see them.
 */
export function accountSwitchPatch(
  toPrivate: boolean
): Pick<AccountControls, 'is_private'> & Partial<Pick<AccountControls, 'posts_visibility'>> {
  return toPrivate ? { is_private: true } : { is_private: false, posts_visibility: 'everyone' };
}

/** The question before switching between public and private. */
export function privacyConfirm(toPrivate: boolean): {
  title: string;
  message: string;
  confirm: string;
} {
  return toPrivate
    ? {
        title: 'Switch to private?',
        message:
          'Only people you approve will see your workouts. People who follow you now keep seeing them.',
        confirm: 'Switch to private',
      }
    : {
        title: 'Switch to public?',
        message: 'Anyone can see your workouts and follow you. Pending requests will be accepted.',
        confirm: 'Switch to public',
      };
}

/** The question before removing a follower. A friend: open tags between you end too. */
export function removeFollowerConfirm(
  username: string,
  friends: boolean
): { title: string; message: string; confirm: string; cancel: string } {
  return {
    title: `Remove @${username}?`,
    message: friends
      ? 'They won’t be told. You’re friends, so any open tags between you end.'
      : 'They won’t be told.',
    confirm: 'Remove',
    cancel: 'Cancel',
  };
}

/** What someone else's profile says in place of their workouts. */
export function restrictedText(restricted: ProfileRestriction, username: string): string {
  if (restricted === 'followers') return `Only @${username}’s followers see their workouts`;
  if (restricted === 'friends') return `Only @${username}’s friends see their workouts`;
  return 'This account is private';
}

export type TagAcceptChoice = 'follow_back' | 'accept_follow' | 'not_now';

/**
 * After accepting a tag request: accepting no longer makes you follow each other (owner,
 * 2026-10-08), so ask whether to follow them back and, if their follow request is waiting,
 * accept it. Null when there is nothing to ask (or an older server sent no fields).
 */
export function tagAcceptPopup(answer: {
  username: string;
  you_follow_them?: boolean;
  their_follow_request?: boolean;
}): { title: string; options: { key: TagAcceptChoice; label: string }[] } | null {
  const followBack = answer.you_follow_them === false;
  const acceptFollow = answer.their_follow_request === true;
  if (!followBack && !acceptFollow) return null;
  return {
    title: followBack ? `Follow @${answer.username} back?` : `Accept @${answer.username}’s follow?`,
    options: [
      ...(followBack ? [{ key: 'follow_back' as const, label: 'Follow back' }] : []),
      ...(acceptFollow ? [{ key: 'accept_follow' as const, label: 'Accept their follow' }] : []),
      { key: 'not_now', label: 'Not now' },
    ],
  };
}

/**
 * The public / private choice after sign-up: only with the switch on and when the server says
 * nothing was chosen yet (null). Existing accounts were marked chosen by the migration; a server
 * without the column (undefined) never shows it.
 */
export function showPrivacyChoice(s: {
  flagOn: boolean;
  chosenAt: string | null | undefined;
}): boolean {
  return s.flagOn && s.chosenAt === null;
}
