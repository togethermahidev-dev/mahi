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
    title: 'Post when a friend tags you.',
    body: 'Your first post needs no tag. After that, you post when a friend tags you: 48 hours to answer with a photo, back camera then selfie. Any workout counts. Each answer earns a Mahi point. Miss a tag and your points go back to 0, but your best stays.',
  },
  {
    icon: 'people',
    title: 'Every post tags 3 friends.',
    body: 'They have 48 hours to answer with a workout of their own. Follow each other and you can tag each other.',
  },
  {
    icon: 'feed',
    title: 'Post to open your feed.',
    body: 'Posting your answer opens your feed for 24 hours. Get tagged in that time and it locks when they end, until you answer.',
  },
];

/** AsyncStorage key for "this account has seen the cards on this device". */
export function welcomeSeenKey(userId: string): string {
  return `@mahi:welcome_cards_seen:${userId}`;
}

export function isLastCard(index: number, count: number): boolean {
  return index >= count - 1;
}

export function cardButtonLabel(index: number, count: number): string {
  return isLastCard(index, count) ? 'Get started' : 'Next';
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
      ? 'Accept and you’ll automatically follow each other. Any workout counts.'
      : 'That invite has ended, but you can still join.',
  };
}
