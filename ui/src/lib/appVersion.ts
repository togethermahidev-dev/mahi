/**
 * Version comparison for the forced-update gate. Pure (no Expo imports) so it runs under the
 * node-only jest harness; App.tsx reads this build's version from expo-constants.
 */

function parse(v: string): number[] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? m.slice(1).map(Number) : null;
}

/** True when `current` is older than `minimum`. Unreadable versions never block. */
export function isBelowVersion(current: string, minimum: string): boolean {
  const a = parse(current);
  const b = parse(minimum);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}
