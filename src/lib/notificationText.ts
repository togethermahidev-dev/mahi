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
    default:
      return who;
  }
}
