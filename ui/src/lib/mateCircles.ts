/**
 * The mate circles on the tag step (owner, 2026-10-07, after Lapse): one circle per mate a post
 * needs. An empty circle waits with a "+"; tagging a friend or adding an invite link fills the next
 * one (friends first, in the order they were tagged, then links); tapping a filled one empties it.
 * When every circle is filled the title names who will keep you going.
 *
 * Pure and import-free so it runs under the node-only jest harness.
 */

export type CircleMate = { user_id: string; username: string; avatar_url: string | null };

type Base = { index: number; key: string; caption: string; a11y: string };
export type MateCircle =
  | (Base & { kind: 'empty' })
  | (Base & {
      kind: 'friend';
      userId: string;
      avatarUrl: string | null;
      initial: string;
    })
  | (Base & { kind: 'link'; link: number });

type Picks = { total: number; friends: CircleMate[]; links: number };

export function mateCircles({ total, friends, links }: Picks): MateCircle[] {
  return Array.from({ length: Math.max(0, total) }, (_, index): MateCircle => {
    const where = `Friend ${index + 1} of ${total}`;
    const friend = friends[index];
    if (friend) {
      const caption = `@${friend.username}`;
      return {
        kind: 'friend',
        index,
        key: friend.user_id,
        userId: friend.user_id,
        avatarUrl: friend.avatar_url,
        initial: (friend.username[0] ?? '?').toUpperCase(),
        caption,
        a11y: `${where}, ${caption}`,
      };
    }
    const link = index - friends.length + 1;
    if (link <= links) {
      const caption = `Link ${link}`;
      return {
        kind: 'link',
        index,
        key: `link-${link}`,
        link,
        caption,
        a11y: `${where}, ${caption}`,
      };
    }
    return { kind: 'empty', index, key: `empty-${index}`, caption: '', a11y: `${where}, empty` };
  });
}

/** "a, b and c" */
function listOf(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

const mates = (n: number) => (n === 1 ? 'friend' : 'friends');

/** The line over the circles: asks until every circle is filled, then names who's in. */
export function mateCirclesTitle(picks: Picks): string {
  const { total } = picks;
  const circles = mateCircles(picks);
  const full = circles.length > 0 && circles.every((c) => c.kind !== 'empty');
  if (!full) return `Pick ${total === 1 ? 'a friend' : `${total} friends`} to keep you going`;
  const names = circles.flatMap((c) => (c.kind === 'friend' ? [c.caption] : []));
  const links = circles.length - names.length;
  if (names.length === 0) {
    return `Your ${links === 1 ? 'friend' : `${links} friends`} will keep you going`;
  }
  const invited = links > 0 ? [`${links} invited ${mates(links)}`] : [];
  return `${listOf([...names, ...invited])} will keep you going`;
}

/**
 * What a change to the circles feels like: a light selection for each circle that fills, a tick
 * when the last one fills, nothing for a removal. `prev` is null the first time the circles are
 * drawn (a sheet reopening with circles already filled is not felt).
 */
export function circleFeedback(
  prev: MateCircle[] | null,
  next: MateCircle[]
): {
  haptic: 'selection' | 'tick' | null;
  filled: { kind: 'friend' | 'link'; index: number }[];
  full: boolean;
} {
  const full = next.length > 0 && next.every((c) => c.kind !== 'empty');
  if (!prev) return { haptic: null, filled: [], full };
  const before = new Set(prev.filter((c) => c.kind !== 'empty').map((c) => c.key));
  const filled = next.flatMap((c) =>
    c.kind !== 'empty' && !before.has(c.key) ? [{ kind: c.kind, index: c.index }] : []
  );
  return { haptic: filled.length === 0 ? null : full ? 'tick' : 'selection', filled, full };
}
