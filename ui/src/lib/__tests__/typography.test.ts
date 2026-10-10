import { readFileSync } from 'fs';
import { join } from 'path';
import { FONT_FAMILY, FONTS } from '@/constants/fonts';
import { GLYPH, TYPOGRAPHY } from '@/constants/typography';

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

describe("the app's typeface", () => {
  it('is Inter Tight in five weights, like PingMee', () => {
    expect(FONT_FAMILY).toBe('Inter Tight');
    expect(FONTS).toEqual({
      regular: 'InterTight_400Regular',
      medium: 'InterTight_500Medium',
      semiBold: 'InterTight_600SemiBold',
      bold: 'InterTight_700Bold',
      extraBold: 'InterTight_800ExtraBold',
    });
  });

  it('ships a font file for every face, and App.tsx loads every one', () => {
    const app = readFileSync(join(__dirname, '..', '..', '..', 'App.tsx'), 'utf8');
    const loaded = /useFonts\(\{([^}]*)\}\)/.exec(app)?.[1] ?? '';
    for (const face of Object.values(FONTS)) {
      const folder = face.split('_')[1];
      // Resolved, not joined to a path: node_modules sits at the workspace root, above ui/.
      expect(() =>
        require.resolve(`@expo-google-fonts/inter-tight/${folder}/${face}.ttf`)
      ).not.toThrow();
      expect(loaded).toContain(face);
    }
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
