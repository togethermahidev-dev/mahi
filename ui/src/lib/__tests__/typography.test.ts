import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { FONT_FAMILY, FONTS } from '@/constants/fonts';
import { FIELD_TEXT, GLYPH, LETTERING, TYPOGRAPHY } from '@/constants/typography';
import { POINTS_NUMBER, PROFILE, SEGMENTED } from '@/constants/tokens';

// Mahi's text takes PingMee's type system, value for value (owner, 2026-10-10: "PingMee font sizes
// and styling applied across the whole of mahi exactly what PingMee uses across their app for
// shared tokens values for titles headings and fonts"). The table below is PingMee's own
// (pingmee-v2 ui/theme/typography.ts): size, line height, weight, letter spacing. When PingMee's
// scale changes, change this table and the tokens together.
const PINGMEE: Record<string, [size: number, line: number, weight: number, tracking: number]> = {
  display: [32, 40, 800, -0.5],
  screenTitle: [28, 34, 800, 0.2],
  h1: [24, 32, 700, -0.5],
  h2: [20, 28, 700, -0.3],
  h3: [17, 24, 600, 0],
  h4: [15, 22, 600, 0],
  subtitle: [15, 22, 500, 0],
  sheetTitle: [16, 22, 600, 0],
  postBody: [17, 24, 500, 0],
  composerInput: [19, 26, 400, 0],
  bodyLarge: [16, 22, 400, 0],
  input: [15, 21, 400, 0],
  body: [14, 20, 400, 0],
  bodyMedium: [14, 20, 500, 0],
  bodyStrong: [14, 20, 600, 0],
  bodyBold: [14, 20, 700, 0],
  small: [13, 18, 400, 0],
  label: [13, 18, 500, 0],
  labelStrong: [13, 18, 600, 0],
  caption: [12, 16, 400, 0.1],
  captionMedium: [12, 16, 500, 0.1],
  captionStrong: [12, 16, 600, 0.1],
  micro: [11, 14, 400, 0],
  microStrong: [11, 14, 600, 0],
  badge: [11, 14, 700, 0],
  button: [14, 20, 700, 0.5],
  buttonSmall: [12, 16, 600, 0.3],
  pillLabel: [17, 24, 600, 0],
  tabLabel: [17, 24, 600, 0],
  chipLabel: [14, 18, 500, 0],
  filterLabel: [14, 18, 500, 0],
  authButton: [19, 24, 600, 0],
  authWordmark: [56, 64, 400, 0],
};

const FACE_BY_WEIGHT: Record<number, string> = {
  400: FONTS.regular,
  500: FONTS.medium,
  600: FONTS.semiBold,
  700: FONTS.bold,
  800: FONTS.extraBold,
};

// Each face is named exactly as its font file names itself (its PostScript name). React Native's
// text finds a face under any name it was loaded with, but Apple's own text (the rolling points
// number, the tag banner's clock) looks a font up by that real name only. PingMee names them the same.
const FACE_FILE: Record<keyof typeof FONTS, string> = {
  regular: '400Regular/InterTight_400Regular',
  medium: '500Medium/InterTight_500Medium',
  semiBold: '600SemiBold/InterTight_600SemiBold',
  bold: '700Bold/InterTight_700Bold',
  extraBold: '800ExtraBold/InterTight_800ExtraBold',
};

/** The name a font file gives itself (name table, id 6), which is what the phone knows it by. */
function postScriptName(file: string): string {
  // Resolved, not joined to a path: node_modules sits at the workspace root, above ui/.
  const font = readFileSync(require.resolve(`@expo-google-fonts/inter-tight/${file}.ttf`));
  let table = 0;
  for (let i = 0; i < font.readUInt16BE(4); i++)
    if (font.toString('latin1', 12 + i * 16, 16 + i * 16) === 'name')
      table = font.readUInt32BE(20 + i * 16);
  const strings = table + font.readUInt16BE(table + 4);
  for (let r = 0; r < font.readUInt16BE(table + 2); r++) {
    const at = table + 6 + r * 12;
    if (font.readUInt16BE(at + 6) !== 6) continue;
    const bytes = font.subarray(
      strings + font.readUInt16BE(at + 10),
      strings + font.readUInt16BE(at + 10) + font.readUInt16BE(at + 8)
    );
    // Windows records are two bytes a letter; Mac ones are one.
    return font.readUInt16BE(at) === 3
      ? Buffer.from(bytes).swap16().toString('utf16le')
      : bytes.toString('latin1');
  }
  return '';
}

describe("the app's typeface", () => {
  it('is Inter Tight in five weights, like PingMee', () => {
    expect(FONT_FAMILY).toBe('Inter Tight');
    expect(FONTS).toEqual({
      regular: 'InterTight-Regular',
      medium: 'InterTight-Medium',
      semiBold: 'InterTight-SemiBold',
      bold: 'InterTight-Bold',
      extraBold: 'InterTight-ExtraBold',
    });
  });

  it.each(Object.entries(FACE_FILE))('names %s as its font file names itself', (key, file) => {
    expect(postScriptName(file)).toBe(FONTS[key as keyof typeof FONTS]);
  });

  it('loads each face under that name in App.tsx, and only the five it uses', () => {
    const app = readFileSync(join(__dirname, '..', '..', '..', 'App.tsx'), 'utf8');
    const loaded = /useFonts\(\{([^}]*)\}\)/.exec(app)?.[1] ?? '';
    for (const [key, file] of Object.entries(FACE_FILE)) {
      const [folder, face] = file.split('/');
      expect(loaded).toContain(`[FONTS.${key}]: ${face}`);
      expect(app).toContain(`from '@expo-google-fonts/inter-tight/${folder}'`);
    }
    // The package's own index pulls in all 18 faces, italics included: never import from it.
    expect(app).not.toContain("from '@expo-google-fonts/inter-tight'");
  });
});

describe('the named text styles', () => {
  it.each(Object.entries(PINGMEE))('%s is PingMee’s', (name, [size, line, weight, tracking]) => {
    const token = TYPOGRAPHY[name as keyof typeof TYPOGRAPHY];
    expect(token).toBeDefined();
    expect(token.fontSize).toBe(size);
    expect(token.lineHeight).toBe(line);
    expect(token.fontFamily).toBe(FACE_BY_WEIGHT[weight]);
    expect(token.letterSpacing).toBeCloseTo(tracking, 6);
  });

  // PingMee's 10pt `tiny`, its capitals `overline` and `mono` are left out: Mahi keeps text at 11
  // or more, writes in sentence case, and has one typeface.
  it('has every PingMee style and none of the three Mahi leaves out', () => {
    const names = Object.keys(TYPOGRAPHY);
    for (const name of Object.keys(PINGMEE)) expect(names).toContain(name);
    for (const left of ['tiny', 'overline', 'mono']) expect(names).not.toContain(left);
  });

  it('keeps every style at 11 or more, in an Inter Tight face, with no capitals', () => {
    const faces = Object.values(FONTS) as string[];
    for (const token of Object.values(TYPOGRAPHY)) {
      expect(token.fontSize).toBeGreaterThanOrEqual(11);
      expect(token.lineHeight).toBeGreaterThanOrEqual(token.fontSize);
      expect(faces).toContain(token.fontFamily);
      expect(Object.keys(token)).not.toContain('textTransform');
      expect(Object.keys(token)).not.toContain('fontWeight');
    }
  });
});

describe('pictures drawn as text', () => {
  // PingMee's glyph sizes: an emoji used as an icon, an emoji shown large, a big overlay line.
  it('take PingMee’s sizes, with a face so Android never swaps the font', () => {
    expect(GLYPH.icon.fontSize).toBe(20);
    expect(GLYPH.emoji.fontSize).toBe(26);
    expect(GLYPH.hero.fontSize).toBe(52);
    const faces = Object.values(FONTS) as string[];
    for (const glyph of Object.values(GLYPH)) expect(faces).toContain(glyph.fontFamily);
  });
});

describe("Mahi's own additions", () => {
  // PingMee's section heading is capitals (`overline`); Mahi's is sentence case at the small size.
  it('has a sentence-case section heading', () => {
    expect(TYPOGRAPHY.sectionHeader.fontSize).toBe(13);
    expect(TYPOGRAPHY.sectionHeader.fontFamily).toBe(FONTS.semiBold);
  });

  it('gives a one-line field the input size and face, with no line height to clip it', () => {
    expect(FIELD_TEXT.fontSize).toBe(TYPOGRAPHY.input.fontSize);
    expect(FIELD_TEXT.fontFamily).toBe(TYPOGRAPHY.input.fontFamily);
    expect(Object.keys(FIELD_TEXT)).not.toContain('lineHeight');
  });
});

// Mahi's drawn lettering is not running text and has no PingMee role: the MAHI wordmark, the FEED
// cue and the numerals inside drawn circles ("+1", a step number). Each keeps the size it was drawn at.
describe("Mahi's drawn lettering", () => {
  it('keeps the wordmark, the FEED cue and the numerals at their drawn sizes, in the bold face', () => {
    const sizes = Object.fromEntries(
      Object.entries(LETTERING).map(([name, l]) => [name, [l.fontSize, l.letterSpacing]])
    );
    expect(sizes).toEqual({
      wordmarkFront: [56, 10],
      wordmarkLaunch: [56, 8],
      wordmarkSplash: [48, 8],
      wordmarkHeader: [24, 8],
      feedCue: [13, 3],
      numeralHero: [38, 0],
      numeral: [24, 0],
      numeralSmall: [15, 0],
      numeralTiny: [13, 0],
    });
    for (const l of Object.values(LETTERING)) expect(l.fontFamily).toBe(FONTS.bold);
  });
});

// The rule that keeps the whole app on the shared set: outside src/constants nothing types a text
// size or a face, or reads the raw size and face tokens. A style spreads TYPOGRAPHY, GLYPH,
// FIELD_TEXT or LETTERING; a native font prop reads `TYPOGRAPHY.x.fontFamily` / `.fontSize`.
describe('every screen and component', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory())
        return name === '__tests__' || name === 'constants' ? [] : sourceFiles(path);
      return /\.tsx?$/.test(name) ? [path] : [];
    });
  }
  const root = join(__dirname, '..', '..', '..');
  const files = [...sourceFiles(join(root, 'src')), join(root, 'App.tsx')];

  it('takes its text styles from the shared set, never a size or face typed in place', () => {
    const typed = /\bfont(?:Size|Family)\s*[:=]|\bFONT_SIZE\.|\bFONTS\./;
    // App.tsx names the faces once, where it loads them (useFonts): that is not a text style.
    const source = (f: string) => readFileSync(f, 'utf8').replace(/useFonts\(\{[^}]*\}\)/, '');
    const offenders = files
      .filter((f) => typed.test(source(f)))
      .map((f) => f.slice(root.length + 1));
    expect(offenders).toEqual([]);
  });

  it('sets no line height or letter spacing in place either: the named style carries both', () => {
    const typed = /\b(?:lineHeight|letterSpacing)\s*:\s*(?:LINE_HEIGHT|TRACKING|-)/;
    const offenders = files
      .filter((f) => typed.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(root.length + 1));
    expect(offenders).toEqual([]);
  });
});

// Text that shrinks to fit must stop at 11pt, like every other text (the floor moves with the style).
describe('text that shrinks to fit', () => {
  it.each([
    ['a segmented option', TYPOGRAPHY.captionMedium.fontSize * SEGMENTED.labelMinScale],
    ['the words beside the points number', TYPOGRAPHY.label.fontSize * POINTS_NUMBER.wordsMinScale],
    ['a grid square’s points badge', TYPOGRAPHY.microStrong.fontSize * PROFILE.badgeMinScale],
  ])('%s never goes under 11', (_what, smallest) => {
    expect(smallest).toBeGreaterThanOrEqual(11);
  });
});
