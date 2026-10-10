/**
 * A short sheet at the bottom of the screen: which one shows. Owner, 2026-10-10, on Invite a
 * friend: "The sheet have like a weird overlay does it use the native sheet?" It did not: the grey
 * layer was part of the sheet and slid up with it.
 * - 'native': the phone's own sheet (its dimming, grab handle and swipe down), on an iPhone build
 *   that has it (11 and later), for a sheet that asks for it, with the switch on.
 * - 'ours': the grey fades in on its own and only the card slides up. Build 10, Android, the
 *   switch off, and any sheet that hasn't been proven on a phone as the native one yet: one with a
 *   text field (the keyboard must never cover it) and the invite you accept.
 * Pure, so it runs under the node-only tests; the view is src/components/ShortSheet.tsx.
 */
export type ShortSheetKind = 'native' | 'ours';

export function shortSheetKind({
  wantsNative,
  switchOn,
  hasNative,
}: {
  wantsNative: boolean;
  switchOn: boolean;
  hasNative: boolean;
}): ShortSheetKind {
  return wantsNative && switchOn && hasNative ? 'native' : 'ours';
}
