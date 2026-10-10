import { FONTS } from './fonts';
import { FONT_SIZE, LINE_HEIGHT, TRACKING } from './tokens';

/**
 * The app's named text styles: PingMee's scale, value for value (owner, 2026-10-10: "PingMee font
 * sizes and styling applied across the whole of mahi exactly what PingMee uses across their app
 * for shared tokens values for titles headings and fonts"). The source is pingmee-v2's
 * ui/theme/typography.ts; when that scale changes, copy it here and into typography.test.ts.
 *
 * Every text style in the app spreads one of these (`...TYPOGRAPHY.body`): the same place on every
 * screen uses the same style, and nothing else sets a text size or a face. If a place needs a
 * style that isn't here, add it here. The face carries the weight; no style sets a weight on top.
 *
 * Left out on purpose: PingMee's 10pt `tiny` (Mahi keeps text at 11 or more), its capitals
 * `overline` (Mahi writes in sentence case) and `mono` (one typeface).
 */
const style = (fontFamily: string, fontSize: number, lineHeight: number, letterSpacing = 0) =>
  ({ fontFamily, fontSize, lineHeight, letterSpacing }) as const;

export const TYPOGRAPHY = {
  // ─── Titles ────────────────────────────────────────────────────────────────
  /** Hero numbers and big statements (32). */
  display: style(FONTS.extraBold, FONT_SIZE.f32, LINE_HEIGHT.l40, -TRACKING.t0_5),
  /** A page's title: Messages, Alerts, Settings (28, the heaviest face). */
  screenTitle: style(FONTS.extraBold, FONT_SIZE.f28, LINE_HEIGHT.l34, TRACKING.t0_2),
  h1: style(FONTS.bold, FONT_SIZE.f24, LINE_HEIGHT.l32, -TRACKING.t0_5),
  h2: style(FONTS.bold, FONT_SIZE.f20, LINE_HEIGHT.l28, -TRACKING.t0_3),
  h3: style(FONTS.semiBold, FONT_SIZE.f17, LINE_HEIGHT.l24),
  h4: style(FONTS.semiBold, FONT_SIZE.f15, LINE_HEIGHT.l22),
  subtitle: style(FONTS.medium, FONT_SIZE.f15, LINE_HEIGHT.l22),
  /** A sheet's or pop-up's header title (16). */
  sheetTitle: style(FONTS.semiBold, FONT_SIZE.f16, LINE_HEIGHT.l22),

  // ─── Body ──────────────────────────────────────────────────────────────────
  /** The words of a post on its card (17, medium). */
  postBody: style(FONTS.medium, FONT_SIZE.f17, LINE_HEIGHT.l24),
  /** A composer's text input (19). */
  composerInput: style(FONTS.regular, FONT_SIZE.f19, LINE_HEIGHT.l26),
  /** Larger reading text and counters (16). */
  bodyLarge: style(FONTS.regular, FONT_SIZE.f16, LINE_HEIGHT.l22),
  /** Text inputs and their placeholders (15). */
  input: style(FONTS.regular, FONT_SIZE.f15, LINE_HEIGHT.l21),
  body: style(FONTS.regular, FONT_SIZE.f14, LINE_HEIGHT.l20),
  /** Body at medium weight: option labels. */
  bodyMedium: style(FONTS.medium, FONT_SIZE.f14, LINE_HEIGHT.l20),
  /** Body at semi-bold: names, row titles. */
  bodyStrong: style(FONTS.semiBold, FONT_SIZE.f14, LINE_HEIGHT.l20),
  /** Body at bold: emphasised words inside a line. */
  bodyBold: style(FONTS.bold, FONT_SIZE.f14, LINE_HEIGHT.l20),
  /** Small regular text: secondary lines (13). */
  small: style(FONTS.regular, FONT_SIZE.f13, LINE_HEIGHT.l18),
  label: style(FONTS.medium, FONT_SIZE.f13, LINE_HEIGHT.l18),
  /** Small semi-bold: chips, tiles, small actions (13). */
  labelStrong: style(FONTS.semiBold, FONT_SIZE.f13, LINE_HEIGHT.l18),
  caption: style(FONTS.regular, FONT_SIZE.f12, LINE_HEIGHT.l16, TRACKING.t0_1),
  /** Meta at medium weight: chips, segment labels (12). */
  captionMedium: style(FONTS.medium, FONT_SIZE.f12, LINE_HEIGHT.l16, TRACKING.t0_1),
  /** Meta at semi-bold: small emphasis (12). */
  captionStrong: style(FONTS.semiBold, FONT_SIZE.f12, LINE_HEIGHT.l16, TRACKING.t0_1),
  /** The smallest running text: times, author lines (11). */
  micro: style(FONTS.regular, FONT_SIZE.f11, LINE_HEIGHT.l14),
  /** The smallest emphasis: counts (11). */
  microStrong: style(FONTS.semiBold, FONT_SIZE.f11, LINE_HEIGHT.l14),
  /** Count badges on tabs and icons (11, bold). */
  badge: style(FONTS.bold, FONT_SIZE.f11, LINE_HEIGHT.l14),

  // ─── Controls ──────────────────────────────────────────────────────────────
  button: style(FONTS.bold, FONT_SIZE.f14, LINE_HEIGHT.l20, TRACKING.t0_5),
  buttonSmall: style(FONTS.semiBold, FONT_SIZE.f12, LINE_HEIGHT.l16, TRACKING.t0_3),
  /** Every action pill's label (17). */
  pillLabel: style(FONTS.semiBold, FONT_SIZE.f17, LINE_HEIGHT.l24),
  /** Tab strip labels (17). */
  tabLabel: style(FONTS.semiBold, FONT_SIZE.f17, LINE_HEIGHT.l24),
  /** A chip that only states a fact (14, medium). */
  chipLabel: style(FONTS.medium, FONT_SIZE.f14, LINE_HEIGHT.l18),
  /** Filter and segment controls (14, medium). */
  filterLabel: style(FONTS.medium, FONT_SIZE.f14, LINE_HEIGHT.l18),
  /** Every button in the sign-in stack: Create account, Log in (19). */
  authButton: style(FONTS.semiBold, FONT_SIZE.f19, LINE_HEIGHT.l24),
  /** The front door's wordmark line (56). */
  authWordmark: style(FONTS.regular, FONT_SIZE.f56, LINE_HEIGHT.l64),
} as const;

/**
 * Pictures drawn as text (an emoji, a big overlay line): PingMee's glyph sizes. They are not
 * running text, so they carry no line height; they do carry a face, so Android never swaps in
 * the phone's own font for a letter beside the picture.
 */
const glyph = (fontSize: number) => ({ fontFamily: FONTS.regular, fontSize }) as const;

export const GLYPH = {
  /** An emoji used as an icon (20). */
  icon: glyph(FONT_SIZE.f20),
  /** An emoji shown large: the reaction picker (26). */
  emoji: glyph(FONT_SIZE.f26),
  /** A big overlay line (52). */
  hero: glyph(FONT_SIZE.f52),
} as const;

export type TypographyName = keyof typeof TYPOGRAPHY;
