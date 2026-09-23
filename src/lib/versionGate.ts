/**
 * Forced-update decision (pingmee-v2 model). Pure so it is unit-tested; App.tsx supplies this
 * build's version and build number and the server's gate from `get_app_gate`.
 *
 * Fails open: no gate, a switched-off gate or an unreadable build number never blocks.
 */
import { isBelowVersion } from './appVersion';

export type AppGate = {
  enabled: boolean;
  min_version: string;
  min_build: number | null;
  store_url: string | null;
  message: string | null;
};

export function gateVerdict(
  app: { version: string; build: number | null },
  gate: AppGate | null
): 'blocked' | 'passed' {
  if (!gate || !gate.enabled) return 'passed';
  if (isBelowVersion(app.version, gate.min_version)) return 'blocked';
  const sameVersion = !isBelowVersion(gate.min_version, app.version);
  if (sameVersion && gate.min_build !== null && app.build !== null && app.build < gate.min_build)
    return 'blocked';
  return 'passed';
}
