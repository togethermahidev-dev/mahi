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
    title: 'Post your workout every day.',
    body: 'One photo, front and back camera. Your streak is on show to your friends.',
  },
  {
    icon: 'people',
    title: 'Every post tags 3 friends.',
    body: 'They have 48 hours to answer with a workout of their own. Friends are people who follow each other.',
  },
  {
    icon: 'feed',
    title: 'Post to open your feed.',
    body: 'Posting opens your feed. It stays open until a friend tags you — then post your answer to open it again.',
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
  return isLastCard(index, count) ? 'Start training' : 'Next';
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
