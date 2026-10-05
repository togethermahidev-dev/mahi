/**
 * The words of one row in the notifications list. They match the push the server sends for the
 * same thing (`push_on_notification`, 20261002190000_tag_and_feed_pushes.sql) — minus what goes
 * out of date in a list: a push says "just" and how long is left when it is sent; a row is read
 * later. Reminders, feed-lock pushes and messages are pushes only; they have no row here.
 */
export function notificationText(type: string, username: string): string {
  const who = `@${username}`;
  switch (type) {
    case 'like':
      return `${who} liked your post`;
    case 'comment':
      return `${who} commented on your post`;
    case 'follow':
      return `${who} started following you`;
    case 'tag':
      return `You've been tagged by ${who}. 48 hours to post your Mahi!`;
    case 'tag_answered':
      return `${who} answered your tag`;
    case 'tag_missed':
      return `${who} missed your tag`;
    case 'streak_lost':
      return `You missed ${who}'s tag. Your points are back to 0.`;
    case 'invite_joined':
      return `${who} joined Mahi from your invite`;
    case 'tag_invite':
      return `${who} wants to tag you`;
    case 'tag_invite_accepted':
      return `${who} accepted your tag`;
    default:
      return who;
  }
}

/** Where tapping a notification row goes. */
export type NotificationTarget =
  | { to: 'post'; ownerId: string; postId: string; comments: boolean }
  | { to: 'camera' }
  | { to: 'profile'; userId: string };

/**
 * A row opens what it says (round 3 gap 1). Likes and comments are on your post; an answer is
 * the answerer's new post; a tag still open goes to the camera to answer it, and once over to the
 * tagger. Everything else, and any post row whose post is gone, opens the other person.
 * Navigation only: no rule about tags is decided here (`tagOpen` comes from the open tags).
 */
export function notificationTarget(
  n: { type: string; actor_id: string; post_id: string | null },
  me: string,
  tagOpen: boolean
): NotificationTarget {
  const profile = { to: 'profile' as const, userId: n.actor_id };
  switch (n.type) {
    case 'tag':
      return tagOpen ? { to: 'camera' } : profile;
    case 'like':
    case 'comment':
      return n.post_id
        ? { to: 'post', ownerId: me, postId: n.post_id, comments: n.type === 'comment' }
        : profile;
    case 'tag_answered':
      return n.post_id
        ? { to: 'post', ownerId: n.actor_id, postId: n.post_id, comments: false }
        : profile;
    default:
      return profile;
  }
}

export type NotificationListItem<T> = { kind: 'header'; title: string } | { kind: 'row'; item: T };

/**
 * The list in two parts (round 3 gap 2): what needs your answer first (open tag requests and open
 * tags), then everything else, each in the order given. No labels when nothing needs an answer.
 */
export function notificationSections<T>(
  items: T[],
  needsAnswer: (item: T) => boolean
): NotificationListItem<T>[] {
  const asRow = (item: T): NotificationListItem<T> => ({ kind: 'row', item });
  const first = items.filter(needsAnswer);
  if (first.length === 0) return items.map(asRow);
  const rest = items.filter((item) => !needsAnswer(item));
  return [
    { kind: 'header', title: 'Needs your answer' },
    ...first.map(asRow),
    ...(rest.length > 0 ? [{ kind: 'header' as const, title: 'Earlier' }] : []),
    ...rest.map(asRow),
  ];
}
