/** "1 minute", "3 hours", "2 days": a count and its unit, written out. */
export function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/**
 * How long ago something was made, written out: "just now", "3 minutes ago", "5 hours ago",
 * "2 days ago" (rounded down). The one spelling for posts, comments, messages and notifications.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${plural(mins, 'minute')} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${plural(hrs, 'hour')} ago`;
  return `${plural(Math.floor(hrs / 24), 'day')} ago`;
}
