/**
 * The app's one typeface, Inter Tight, in five weights: PingMee's (owner, 2026-10-10). The faces
 * are loaded in App.tsx with useFonts; add a weight here (and to useFonts) before using it. Text
 * styles don't read these directly: they spread a named style from ./typography.
 */
export const FONTS = {
  regular: 'InterTight_400Regular',
  medium: 'InterTight_500Medium',
  semiBold: 'InterTight_600SemiBold',
  bold: 'InterTight_700Bold',
  extraBold: 'InterTight_800ExtraBold',
} as const;

/** The family's name as Google Fonts spells it: the website and the emails load it by this name. */
export const FONT_FAMILY = 'Inter Tight';
