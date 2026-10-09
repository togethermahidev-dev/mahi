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
    title: '1. Show up & tag mates',
    body: 'Post your first Mahi: a workout photo, then a selfie. Tag 1 mate to post it. It earns your first point and opens your feed.',
  },
  {
    icon: 'people',
    title: '2. Get tagged',
    body: 'When a mate tags you, you have 48 hours to post a Mahi of you exercising. That’s your next point. Miss it and your points go back to 0.',
  },
  {
    icon: 'feed',
    title: '3. Pass it on',
    body: 'Your answer tags 3 friends. They get 48 hours to show up too. Your best always stays.',
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
 * The cards for this person (usability walkthrough, 2026-10-07; words owner 2026-10-09). Someone a
 * mate tagged (by a tag link, before their first post) starts with who and how long. Everyone
 * else: WELCOME_CARDS.
 */
export function welcomeCardsFor(taggedBy: string | null): readonly WelcomeCard[] {
  if (!taggedBy) return WELCOME_CARDS;
  return [
    {
      icon: 'camera',
      title: `1. Show up for @${taggedBy} & tag a mate`,
      body: 'They tagged you. Post any workout in the next 48 hours, tag 1 mate, and earn your first point.',
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
