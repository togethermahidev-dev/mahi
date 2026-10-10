/**
 * The app's one typeface, Inter Tight, in five weights (owner, 2026-10-10). The faces
 * are loaded in App.tsx with useFonts; add a weight here (and to useFonts) before using it. Text
 * styles don't read these directly: they spread a named style from ./typography.
 *
 * Each name is the one the font file gives itself (its PostScript name). React
 * Native's text finds a face under any name it was loaded with; Apple's own text (the rolling
 * points number, the tag banner's clock) finds it by this real name only.
 */
export const FONTS = {
  regular: 'InterTight-Regular',
  medium: 'InterTight-Medium',
  semiBold: 'InterTight-SemiBold',
  bold: 'InterTight-Bold',
  extraBold: 'InterTight-ExtraBold',
} as const;

/** The family's name as Google Fonts spells it: the website and the emails load it by this name. */
export const FONT_FAMILY = 'Inter Tight';
