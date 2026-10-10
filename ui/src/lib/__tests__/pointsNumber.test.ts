import { readFileSync } from 'fs';
import { digitCount, numberBox } from '../pointsNumber';
import { POINTS_NUMBER } from '@/constants/tokens';

// "Sometimes the writing overlaps the number in Mahi points" (owner, 2026-10-10). The number keeps
// its own room, worked out from how many digits it has, so the words beside or under it are laid
// out clear of it from the first frame — whatever Apple's rolling digits report later.

/** What the font's own file says: each digit's width and the line's height, as shares of the size. */
function interMetrics(face: string): { widestDigit: number; line: number } {
  // Resolved, not joined to a path: node_modules sits at the workspace root, above ui/.
  const font = readFileSync(require.resolve(`@expo-google-fonts/inter-tight/${face}.ttf`));
  const table: Record<string, number> = {};
  for (let i = 0; i < font.readUInt16BE(4); i++)
    table[font.toString('latin1', 12 + i * 16, 16 + i * 16)] = font.readUInt32BE(20 + i * 16);
  const unitsPerEm = font.readUInt16BE(table.head + 18);
  const ascent = font.readInt16BE(table.hhea + 4);
  const descent = font.readInt16BE(table.hhea + 6);
  const widths = font.readUInt16BE(table.hhea + 34);
  // The character map (format 4): which drawing each digit uses.
  let map = 0;
  for (let t = 0; t < font.readUInt16BE(table.cmap + 2); t++) {
    const at = table.cmap + font.readUInt32BE(table.cmap + 8 + t * 8);
    if (font.readUInt16BE(at) === 4) map = at;
  }
  const segs2 = font.readUInt16BE(map + 6);
  const glyph = (code: number): number => {
    for (let s = 0; s < segs2 / 2; s++) {
      const end = font.readUInt16BE(map + 14 + s * 2);
      const start = font.readUInt16BE(map + 16 + segs2 + s * 2);
      if (code > end) continue;
      if (code < start) return 0;
      const delta = font.readInt16BE(map + 16 + segs2 * 2 + s * 2);
      const rangeAt = map + 16 + segs2 * 3 + s * 2;
      const range = font.readUInt16BE(rangeAt);
      if (range === 0) return (code + delta) & 0xffff;
      const g = font.readUInt16BE(rangeAt + range + (code - start) * 2);
      return g ? (g + delta) & 0xffff : 0;
    }
    return 0;
  };
  const advance = (g: number) => font.readUInt16BE(table.hmtx + Math.min(g, widths - 1) * 4);
  const digits = [...'0123456789–'].map((ch) => advance(glyph(ch.codePointAt(0)!)) / unitsPerEm);
  return { widestDigit: Math.max(...digits), line: (ascent - descent) / unitsPerEm };
}

describe('the room kept for a points number', () => {
  it.each([
    '400Regular/InterTight_400Regular',
    '500Medium/InterTight_500Medium',
    '600SemiBold/InterTight_600SemiBold',
    '700Bold/InterTight_700Bold',
    '800ExtraBold/InterTight_800ExtraBold',
  ])('is at least as wide and tall as %s really draws', (face) => {
    const inter = interMetrics(face);
    expect(inter.widestDigit).toBeGreaterThan(0.5); // the file was read, not a 0
    expect(POINTS_NUMBER.digitWidth).toBeGreaterThanOrEqual(inter.widestDigit);
    expect(POINTS_NUMBER.lineShare).toBeGreaterThanOrEqual(inter.line);
  });

  it('counts digits: 1, 2, 3 and more; a dash while loading counts as one', () => {
    expect(digitCount(0)).toBe(1);
    expect(digitCount(7)).toBe(1);
    expect(digitCount(12)).toBe(2);
    expect(digitCount(100)).toBe(3);
    expect(digitCount(1234)).toBe(4);
    expect(digitCount(null)).toBe(1);
  });

  const at = (value: number | null, shown: number | null = value) =>
    numberBox({ value, shown, size: 20, lineHeight: 24, fontScale: 1, apple: false });

  it('grows with the digit count, so 1, 2 and 3+ digits each have their own room', () => {
    expect(at(7).minWidth).toBeCloseTo(20 * POINTS_NUMBER.digitWidth);
    expect(at(12).minWidth).toBeCloseTo(2 * 20 * POINTS_NUMBER.digitWidth);
    expect(at(100).minWidth).toBeCloseTo(3 * 20 * POINTS_NUMBER.digitWidth);
    expect(at(100).minWidth).toBeGreaterThan(at(12).minWidth);
    expect(at(12).minWidth).toBeGreaterThan(at(7).minWidth);
  });

  it('keeps room for the dash while the number loads', () => {
    expect(at(null).minWidth).toBeCloseTo(20 * POINTS_NUMBER.digitWidth);
  });

  it('keeps the wider of where a roll starts and where it ends', () => {
    // Rolling up from 9 to 10: two digits from the start, not once it lands.
    expect(at(10, 9).minWidth).toBeCloseTo(at(10).minWidth);
    // Rolling down from 100 to 0 after a miss: still three digits wide while they show.
    expect(at(0, 100).minWidth).toBeCloseTo(at(100).minWidth);
    expect(at(0, 0).minWidth).toBeCloseTo(at(7).minWidth);
  });

  it('keeps the line’s height', () => {
    expect(at(7).minHeight).toBe(24);
  });

  it('keeps Apple’s taller digits’ height where they can show, even before the number loads', () => {
    const apple = numberBox({
      value: null,
      shown: null,
      size: 38,
      lineHeight: 38,
      fontScale: 1,
      apple: true,
    });
    expect(apple.minHeight).toBeCloseTo(38 * POINTS_NUMBER.lineShare);
    expect(apple.minHeight).toBeGreaterThan(38);
  });

  it('grows with the phone’s text size', () => {
    const big = numberBox({
      value: 12,
      shown: 12,
      size: 20,
      lineHeight: 24,
      fontScale: 2,
      apple: false,
    });
    expect(big.minWidth).toBeCloseTo(2 * at(12).minWidth);
    expect(big.minHeight).toBeCloseTo(48);
    // No limit asked for: Apple's digits get the plain size and grow by themselves.
    expect(big.appleSize).toBe(20);
  });

  it('stops growing at the limit, and holds Apple’s digits to the same limit', () => {
    const capped = numberBox({
      value: 12,
      shown: 12,
      size: 20,
      lineHeight: 24,
      fontScale: 3,
      maxScale: 1.35,
      apple: true,
    });
    expect(capped.minWidth).toBeCloseTo(2 * 20 * 1.35 * POINTS_NUMBER.digitWidth);
    // Apple's digits grow with the phone's text size by themselves (3 times here): handed this
    // size, they end up exactly as big as our capped text.
    expect(capped.appleSize * 3).toBeCloseTo(20 * 1.35);
  });

  it('leaves Apple’s size alone below the limit', () => {
    const under = numberBox({
      value: 5,
      shown: 5,
      size: 20,
      fontScale: 1.2,
      maxScale: 1.35,
      apple: true,
    });
    expect(under.appleSize).toBeCloseTo(20);
    // No line height given: the height is Apple's line, at the phone's text size.
    expect(under.minHeight).toBeCloseTo(20 * POINTS_NUMBER.lineShare * 1.2);
  });
});
