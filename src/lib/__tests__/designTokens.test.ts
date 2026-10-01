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

function offenders(pattern: RegExp): string[] {
  return files
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
      offenders(/\b(padding|margin|gap|rowGap|columnGap)[A-Za-z]*:(?:\s*|[^,;\n{}]*?[:?(+-]\s*)-?[1-9]/)
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
  ])('no %s is typed out by hand', (_kind, key) => {
    expect(offenders(raw(key))).toEqual([]);
  });

  it('withAlpha turns a token into an rgba colour', () => {
    expect(withAlpha(COLORS.offWhite, 0.45)).toBe('rgba(232,232,227,0.45)');
    expect(withAlpha(COLORS.accent, 0.5)).toBe('rgba(89,194,215,0.5)');
  });
});
