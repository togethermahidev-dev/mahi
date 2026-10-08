/**
 * Time left until a server deadline, measured on the server's clock.
 * `serverOffsetMs` = server time − device time, taken when the deadline was read.
 */
export function msLeft(expiresAt: string, serverOffsetMs: number, deviceNow = Date.now()): number {
  return Math.max(0, new Date(expiresAt).getTime() - (deviceNow + serverOffsetMs));
}
