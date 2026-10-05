// Reads weights and styles from the app's FONTS (ui/src/constants/fonts.ts).
// Shared by build-tokens.mjs (tokens.css) and check-tokens.mjs (layout.tsx must load these weights).
import { FONTS } from '../../ui/src/constants/fonts.ts';

export { FONTS };

/** Inter_600SemiBold → { weight: 600, italic: false }. */
export function fontFace(name) {
  const m = /^Inter_(\d{3})[A-Za-z]+(_Italic)?$/.exec(name);
  if (!m) throw new Error(`Can't read a weight from font "${name}" in ui/src/constants/fonts.ts`);
  return { weight: Number(m[1]), italic: Boolean(m[2]) };
}

/** The distinct weights FONTS uses, lowest first. */
export function fontWeights() {
  return [...new Set(Object.values(FONTS).map((f) => fontFace(f).weight))].sort((a, b) => a - b);
}

/** Whether FONTS has an italic face. */
export function hasItalic() {
  return Object.values(FONTS).some((f) => fontFace(f).italic);
}
