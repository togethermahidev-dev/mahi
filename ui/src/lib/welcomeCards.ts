/**
 * The one-time welcome cards that teach Mahi's accountability loop. Pure and SDK-free so the
 * rules are unit-tested; the screen is src/components/WelcomeCards.tsx.
 */

export interface WelcomeCard {
  /** Which ScreenIcons drawing goes above the text. */
  icon: 'camera' | 'people' | 'feed';
  title: string;
  body: string;
}

export const WELCOME_CARDS: readonly WelcomeCard[] = [
  {
    icon: 'camera',
    title: '1. Show up',
    body: 'Post your first workout to earn your first Mahi point and open your feed. Take a workout photo, then a selfie. Any movement counts.',
  },
  {
    icon: 'people',
    title: '2. Get tagged',
    body: 'After your first workout, a friend’s tag unlocks your next check-in. You have 48 hours to train. Posting the workout answers their tag.',
  },
  {
    icon: 'feed',
    title: '3. Pass it on',
    body: 'Choose 3 friends to hold accountable. Your answer earns a point, opens your feed and calls them to show up next. Your best always stays.',
  },
];

/** AsyncStorage key for "this account has seen the cards on this device". */
export function welcomeSeenKey(userId: string): string {
  return `@mahi:welcome_cards_seen:${userId}`;
}

export function isLastCard(index: number, count: number): boolean {
  return index >= count - 1;
}

/** "Next", then "Get started" on the last card; the replay from Settings → Help ends on "Done". */
export function cardButtonLabel(index: number, count: number, replay = false): string {
  if (!isLastCard(index, count)) return 'Next';
  return replay ? 'Done' : 'Get started';
}

/**
 * The cards for this person (usability walkthrough, 2026-10-07). Someone a mate tagged (by a tag
 * link, before their first post) starts with who and how long: "@sam tagged you." / "Post any
 * workout in the next 48 hours to answer and earn your first point." Everyone else: WELCOME_CARDS.
 */
export function welcomeCardsFor(taggedBy: string | null): readonly WelcomeCard[] {
  if (!taggedBy) return WELCOME_CARDS;
  return [
    {
      icon: 'camera',
      title: `1. Show up for @${taggedBy}`,
      body: 'They called you to train. Post any workout in the next 48 hours to answer their tag, earn your first point and open your feed.',
    },
    ...WELCOME_CARDS.slice(1),
  ];
}

export function cardPositionLabel(index: number, count: number): string {
  return `Card ${index + 1} of ${count}`;
}

/** The card a horizontal paging scroll has settled on, kept inside the cards. */
export function pageFromOffset(offsetX: number, pageWidth: number, count: number): number {
  if (pageWidth <= 0) return 0;
  const page = Math.round(offsetX / pageWidth);
  return Math.min(Math.max(page, 0), count - 1);
}

/** Who sent the invite Mahi was opened with (the parts of the preview this screen uses). */
export interface WelcomeInviter {
  username: string;
  /** Still unclaimed and not expired. */
  open: boolean;
}

/**
 * The first screen's words for someone who came from an invite link: who sent it, and either that
 * any workout counts or that the invite has ended. Null until the invite is loaded. The 48 hours
 * are left to the sign-up screen.
 */
export function welcomeInvite(
  inviter: WelcomeInviter | null
): { who: string; line: string } | null {
  if (!inviter) return null;
  return {
    who: `@${inviter.username} invited you to Mahi`,
    line: inviter.open
      ? 'Join and you’ll automatically follow each other. Any workout counts.'
      : 'That invite has ended, but you can still join.',
  };
}
