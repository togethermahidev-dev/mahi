/**
 * Time left until a server deadline, measured on the server's clock.
 * `serverOffsetMs` = server time − device time, taken when the deadline was read.
 */
export function msLeft(expiresAt: string, serverOffsetMs: number, deviceNow = Date.now()): number {
  return Math.max(0, new Date(expiresAt).getTime() - (deviceNow + serverOffsetMs));
}

/** 47:59:59 style; hours are not capped at 24. */
export function formatHms(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** "45m", "3h", "1d 2h" — how long someone took to answer a tag. */
export function formatWait(seconds: number): string {
  const s = Math.max(0, seconds);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d ${Math.floor(s / 3600) % 24}h`;
}
