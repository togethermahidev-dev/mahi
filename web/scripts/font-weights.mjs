// Reads weights and styles from the app's FONTS (ui/src/constants/fonts.ts).
// Shared by build-tokens.mjs (tokens.css) and check-tokens.mjs (layout.tsx must load these weights).
import { FONTS, FONT_FAMILY } from '../../ui/src/constants/fonts.ts';

export { FONTS, FONT_FAMILY };

/** The family as next/font names it: Inter Tight → Inter_Tight. */
export const nextFontName = () => FONT_FAMILY.replace(/ /g, '_');

const WEIGHT = { Thin: 100, ExtraLight: 200, Light: 300, Regular: 400, Medium: 500, SemiBold: 600, Bold: 700, ExtraBold: 800, Black: 900 };

/** InterTight-SemiBold → { weight: 600, italic: false } (the face's own name: family-Weight, then Italic). */
export function fontFace(name) {
  const m = /^[A-Za-z]+-([A-Za-z]+?)(Italic)?$/.exec(name);
  const weight = m && (WEIGHT[m[1]] ?? (m[1] === 'Italic' ? WEIGHT.Regular : undefined));
  if (!weight) throw new Error(`Can't read a weight from font "${name}" in ui/src/constants/fonts.ts`);
  return { weight, italic: Boolean(m[2]) || m[1] === 'Italic' };
}

/** The distinct weights FONTS uses, lowest first. */
export function fontWeights() {
  return [...new Set(Object.values(FONTS).map((f) => fontFace(f).weight))].sort((a, b) => a - b);
}

/** Whether FONTS has an italic face. */
export function hasItalic() {
  return Object.values(FONTS).some((f) => fontFace(f).italic);
}
