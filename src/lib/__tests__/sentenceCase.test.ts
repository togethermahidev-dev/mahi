import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';

// UI copy is sentence case (decision #26): "Take photo", not "Take Photo". Names keep their capitals.
const NAMES = new Set([
  'Mahi',
  'Apple',
  'Google',
  'Android',
  'iPhone',
  'ID',
  'OK',
  'Face',
  'App',
  'Store',
  'Play',
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const root = join(__dirname, '..', '..', '..');
const files = [...sourceFiles(join(root, 'src')), join(root, 'App.tsx')];

/** A word written as a title mid-sentence ("Photo" in "Take Photo"). */
function titleCased(text: string): boolean {
  return text.split(/[.!?:—]\s+/).some((sentence) => {
    const words = sentence.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
    return words
      .slice(1)
      .some((w) => /^[A-Z][a-z]+[.,!?:]?$/.test(w) && !NAMES.has(w.replace(/[.,!?:]$/, '')));
  });
}

/** On-screen words: JSX text, pop-up titles and buttons, menu options, labels and titles. */
function titleCaseCopy(file: string): string[] {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const check = (n: ts.Node, text: string) => {
    if (titleCased(text))
      found.push(
        `${file.slice(root.length + 1)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} ${text.trim()}`
      );
  };
  const visit = (n: ts.Node) => {
    if (ts.isJsxText(n) && n.text.trim()) check(n, n.text);
    if (ts.isStringLiteral(n)) {
      const p = n.parent;
      const key = ts.isPropertyAssignment(p) ? p.name.getText() : '';
      const alertTitle =
        ts.isCallExpression(p) &&
        /^(Alert\.alert|Alert\.prompt)$/.test(p.expression.getText()) &&
        p.arguments[0] === n;
      const option =
        ts.isArrayLiteralExpression(p) &&
        ts.isPropertyAssignment(p.parent) &&
        p.parent.name.getText() === 'options';
      if (alertTitle || option || ['text', 'label', 'title', 'message'].includes(key))
        check(n, n.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

describe('sentence case', () => {
  it('writes no on-screen words in Title Case', () => {
    expect(titleCased('Take Photo')).toBe(true);
    expect(titleCased('Sign in with Apple')).toBe(false);
    expect(files.flatMap(titleCaseCopy)).toEqual([]);
  });
});
