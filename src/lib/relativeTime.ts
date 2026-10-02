/** How long ago something was made: "5s ago", "3m ago", "5h ago", "2d ago" (rounded down). */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const secs = Math.floor((now - new Date(iso).getTime()) / 1_000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
