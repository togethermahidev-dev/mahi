/**
 * Apple's own icons (SF Symbols) on iPhone — flag `ios-sf-symbols`, default off, needs build 11.
 *
 * Pure rules, unit-tested: when the app's drawn icons (src/components/ScreenIcons.tsx) swap to
 * Apple's, and which Apple icon each one becomes. The native side (is the symbols module in this
 * build?) lives in `src/lib/symbolModule.ts`, kept apart so this stays testable under node.
 */
import type { SymbolViewProps, SymbolWeight } from 'expo-symbols';

/** A valid SF Symbol name (checked by the type list that ships with expo-symbols). */
export type SFSymbolName = Extract<SymbolViewProps['name'], string>;

/** Every icon drawn in ScreenIcons.tsx. */
export type ScreenIconKey =
  | 'search'
  | 'camera'
  | 'feed'
  | 'profile'
  | 'settings'
  | 'notifications'
  | 'heart'
  | 'heartFilled'
  | 'video'
  | 'soundOn'
  | 'soundOff'
  | 'more'
  | 'emoji'
  | 'keyboard'
  | 'themeLight'
  | 'themeDark'
  | 'lock'
  | 'like'
  | 'comment'
  | 'messages';

/**
 * Each drawing's Apple icon. `null` keeps the drawing: the brand "echo" icons (a blue offset
 * layer behind, like the MAHI logo) and the medal with its count have no Apple match.
 */
export const SF_SYMBOLS: Record<ScreenIconKey, SFSymbolName | null> = {
  search: 'magnifyingglass',
  camera: 'camera',
  feed: 'text.alignleft', // three lines, the last shorter — same as the drawing
  profile: 'person',
  settings: 'gearshape',
  notifications: 'bell',
  heart: 'heart',
  heartFilled: 'heart.fill',
  video: 'video',
  soundOn: 'speaker.wave.2',
  soundOff: 'speaker.slash', // Apple's standard "muted" speaker
  more: 'ellipsis', // the '…' menu on posts and comments
  emoji: 'face.smiling', // the composers' emoji button
  keyboard: 'keyboard', // the same button while emoji is up: back to letters
  themeLight: 'sun.max', // Settings' light / dark switch, in light mode
  themeDark: 'moon', // …and in dark mode
  lock: 'lock', // the one padlock for every locked state (owner, 2026-10-08)
  like: null,
  comment: null,
  messages: null,
};

/** Line weight closest to the drawings' 1.8 stroke on a 24-unit grid. */
export const SF_SYMBOL_WEIGHT: SymbolWeight = 'regular';

/**
 * Apple's icons show only on iPhone, with the symbols native module in this build (build 11+),
 * and with the flag on. OTA updates also reach build 10, which has no such module: there, and on
 * Android, the app keeps today's drawings exactly.
 */
export function symbolsAvailable(
  platform: string,
  nativeModulePresent: boolean,
  flagOn: boolean
): boolean {
  return platform === 'ios' && nativeModulePresent && flagOn;
}

/** The Apple icon to show for a drawing, or null to keep the drawing. */
export function sfSymbolFor(icon: ScreenIconKey, available: boolean): SFSymbolName | null {
  return available ? SF_SYMBOLS[icon] : null;
}
