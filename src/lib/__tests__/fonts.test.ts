import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// Every font comes from the FONTS tokens (src/constants/fonts.ts); none is typed out by hand.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const root = join(__dirname, '..', '..', '..');
const files = [...sourceFiles(join(root, 'src')), join(root, 'App.tsx')].filter(
  (f) => !f.endsWith(join('constants', 'fonts.ts'))
);

describe('fonts', () => {
  it('uses no font name typed out by hand — only FONTS tokens', () => {
    const offenders = files.filter((f) =>
      /fontFamily(:\s*|=)['"`]|JosefinSans/.test(readFileSync(f, 'utf8'))
    );
    expect(offenders.map((f) => f.slice(root.length + 1))).toEqual([]);
  });
});
