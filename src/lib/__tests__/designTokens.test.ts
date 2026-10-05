import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { COLORS, withAlpha } from '@/constants/tokens';

// Every colour, text size, spacing and corner radius comes from src/constants/tokens.ts.
// A value of 0 is fine as it is (nothing to name), and so is scaling a token (`/ 2`, `* 2`).
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const root = join(__dirname, '..', '..', '..');
const files = [...sourceFiles(join(root, 'src')), join(root, 'App.tsx')].filter(
  (f) => !f.endsWith(join('constants', 'tokens.ts'))
);

function offenders(pattern: RegExp, folders?: string[]): string[] {
  return files
    .filter((f) => !folders || folders.some((d) => f.includes(join('src', d, ''))))
    .filter((f) => pattern.test(readFileSync(f, 'utf8')))
    .map((f) => f.slice(root.length + 1));
}

describe('design tokens', () => {
  it('no colour is typed out by hand', () => {
    expect(offenders(/['"`]#[0-9a-fA-F]{3,8}['"`]|rgba?\(/)).toEqual([]);
  });

  it('no text size is typed out by hand', () => {
    expect(offenders(/fontSize(?:=\{|:)(?:\s*|[^,;\n{}]*?[:?(+-]\s*)-?[1-9]/)).toEqual([]);
  });

  it('no spacing is typed out by hand', () => {
    expect(
      offenders(
        /\b(padding|margin|gap|rowGap|columnGap)[A-Za-z]*:(?:\s*|[^,;\n{}]*?[:?(+-]\s*)-?[1-9]/
      )
    ).toEqual([]);
  });

  it('no corner radius is typed out by hand', () => {
    expect(offenders(/[bB]order[A-Za-z]*Radius:(?:\s*|[^,;\n{}]*?[:?(+-]\s*)[1-9]/)).toEqual([]);
  });

  // A number typed straight after the key, or after ?, :, (, + or - further along the value.
  const raw = (key: string) =>
    new RegExp(`\\b(?:${key})(?:=\\{|:)(?:\\s*|[^,;\\n{}]*?[:?(+-]\\s*)-?[1-9]`);

  it.each([
    ['shadow blur', 'shadowRadius'],
    ['size', 'width|height|minWidth|maxWidth|minHeight|maxHeight'],
    ['position', 'top|left|right|bottom'],
    ['icon size', 'size'],
    ['letter spacing', 'letterSpacing'],
    ['line height', 'lineHeight'],
    ['border width', 'border[A-Za-z]*Width'],
    ['stacking order', 'zIndex'],
    ['Android shadow depth', 'elevation'],
  ])('no %s is typed out by hand', (_kind, key) => {
    expect(offenders(raw(key))).toEqual([]);
  });

  // Values that are often below 1 (see-through, spring mass) too: any number but 0 and 1.
  const NUM = String.raw`(?:0?\.\d|1\.\d|1\d|[2-9])`;
  const rawAmount = (key: string) =>
    new RegExp(`\\b(?:${key})(?:=\\{|:)(?:\\s*|[^,;\\n{}]*?[:?(+-]\\s*)-?${NUM}`);

  it.each([
    ['see-through amount', 'opacity|shadowOpacity'],
    ['icon line width', 'strokeWidth'],
    ['blur strength', 'intensity'],
    ['text shadow blur', 'textShadowRadius'],
    ['animation timing', 'duration|delay'],
    ['spring', 'damping|stiffness|mass|speed|bounciness'],
    ['animation target', 'toValue'],
  ])('no %s is typed out by hand', (_kind, key) => {
    expect(offenders(rawAmount(key))).toEqual([]);
  });

  it('no withAlpha amount, animation start or target, pause or hold time is typed out by hand', () => {
    const calls = [
      'withAlpha\\([^()]*,',
      'with(?:Spring|Timing)\\(',
      'Animated\\.(?:delay|Value)\\(',
      'useSharedValue\\(',
      'activateAfterLongPress\\(',
    ];
    const call = `(?:${calls.join('|')})\\s*-?${NUM}`;
    expect(offenders(new RegExp(call))).toEqual([]);
  });

  // A size, timing or count named at the top of a screen is still a design value: it lives in
  // tokens. (Icon drawings keep their own coordinates, like the inside of an image.)
  it('no screen or component keeps its own numeric constant', () => {
    const constant = new RegExp(`^\\s*const \\w+ = -?${NUM}[\\d._]*;`, 'm');
    expect(offenders(constant, ['components', 'screens'])).toEqual([]);
  });

  it('no screen or component does layout maths with a raw number', () => {
    const maths = new RegExp(
      `[\\w)\\]] [-+] ${NUM}|Math\\.(?:min|max)\\([^;\\n()]*,\\s*${NUM}[\\d.]*\\)|[\\w)\\]] \\* 0?\\.\\d`
    );
    // ScreenIcons draws the app's own icons in their 24-unit grid, like the inside of an image.
    const drawings = join('components', 'ScreenIcons.tsx');
    expect(
      offenders(maths, ['components', 'screens']).filter((f) => !f.endsWith(drawings))
    ).toEqual([]);
  });

  // app.config.js can't import tokens.ts: each colour is typed once there and must be a token.
  it('app.config.js names each colour once, and only token colours', () => {
    const used = readFileSync(join(root, 'app.config.js'), 'utf8').match(/#[0-9a-f]{3,8}\b/gi) ?? [];
    const tokens = new Set(Object.values(COLORS).map((c) => c.toLowerCase()));
    expect(used.filter((c) => !tokens.has(c.toLowerCase()))).toEqual([]);
    expect(used.length).toBe(new Set(used.map((c) => c.toLowerCase())).size);
  });

  it('withAlpha turns a token into an rgba colour', () => {
    expect(withAlpha(COLORS.offWhite, 0.45)).toBe('rgba(232,232,227,0.45)');
    expect(withAlpha(COLORS.accent, 0.5)).toBe('rgba(89,194,215,0.5)');
  });
});
