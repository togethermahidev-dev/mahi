import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { FONTS } from '@/constants/fonts';

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
const rel = (f: string) => f.slice(root.length + 1);

const TEXT_TAGS = new Set(['Text', 'TextInput', 'Animated.Text']);

/**
 * Text that would fall back to the phone's own font (San Francisco / Roboto): a style that sets a
 * text size without an Inter face, or a Text whose own styles never name one. Styles passed in from
 * outside can't be read here and count as fine; nested Text takes its parent's face.
 */
function textWithoutInter(file: string): string[] {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const at = (n: ts.Node) =>
    `${rel(file)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  const keys = (o: ts.ObjectLiteralExpression) =>
    o.properties.map((p) => p.name?.getText() ?? '...');

  // StyleSheet.create entries in this file, by key.
  const sheet = new Map<string, string[]>();
  const collect = (n: ts.Node) => {
    if (ts.isCallExpression(n) && n.expression.getText() === 'StyleSheet.create') {
      const arg = n.arguments[0];
      if (arg && ts.isObjectLiteralExpression(arg))
        for (const p of arg.properties)
          if (ts.isPropertyAssignment(p) && ts.isObjectLiteralExpression(p.initializer))
            sheet.set(p.name.getText(), keys(p.initializer));
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);

  // 'yes' names an Inter face, 'no' certainly doesn't, 'unknown' can't be read from here.
  const face = (e: ts.Expression | undefined): 'yes' | 'no' | 'unknown' => {
    if (!e) return 'no';
    if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e)) return face(e.expression);
    const any = (parts: ('yes' | 'no' | 'unknown')[]) =>
      parts.includes('yes') ? 'yes' : parts.includes('unknown') ? 'unknown' : 'no';
    if (ts.isObjectLiteralExpression(e)) {
      const k = keys(e);
      return k.includes('fontFamily') ? 'yes' : k.includes('...') ? 'unknown' : 'no';
    }
    if (ts.isArrayLiteralExpression(e)) return any(e.elements.map((x) => face(x as ts.Expression)));
    if (ts.isConditionalExpression(e)) {
      const both = [face(e.whenTrue), face(e.whenFalse)];
      return both.includes('no') ? 'no' : any(both);
    }
    if (ts.isBinaryExpression(e)) return face(e.right);
    if (ts.isPropertyAccessExpression(e) && sheet.has(e.name.getText())) {
      const k = sheet.get(e.name.getText())!;
      return k.includes('fontFamily') ? 'yes' : k.includes('...') ? 'unknown' : 'no';
    }
    if ([ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(e.kind)) return 'no';
    return 'unknown';
  };

  const insideText = (n: ts.Node) => {
    for (let p = n.parent?.parent; p; p = p.parent)
      if (ts.isJsxElement(p) && TEXT_TAGS.has(p.openingElement.tagName.getText())) return true;
    return false;
  };

  const found: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isObjectLiteralExpression(n)) {
      const k = keys(n);
      if (k.includes('fontSize') && !k.includes('fontFamily') && !k.includes('...'))
        found.push(at(n));
    }
    if (
      (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) &&
      TEXT_TAGS.has(n.tagName.getText()) &&
      !insideText(ts.isJsxOpeningElement(n) ? n.parent : n)
    ) {
      const attrs = n.attributes.properties;
      const style = attrs.find((a) => ts.isJsxAttribute(a) && a.name.getText() === 'style');
      const spread = attrs.some((a) => ts.isJsxSpreadAttribute(a));
      const init =
        style &&
        ts.isJsxAttribute(style) &&
        style.initializer &&
        ts.isJsxExpression(style.initializer)
          ? style.initializer.expression
          : undefined;
      if (!spread && face(init) === 'no') found.push(at(n));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

/** Every character Inter can draw, read from the font file's character map (formats 4 and 12). */
function interCharacters(): Set<number> {
  // Resolved, not joined to a path: node_modules sits at the workspace root, above ui/.
  const font = readFileSync(
    require.resolve('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf')
  );
  const chars = new Set<number>();
  let cmap = 0;
  for (let i = 0; i < font.readUInt16BE(4); i++)
    if (font.toString('ascii', 12 + i * 16, 16 + i * 16) === 'cmap')
      cmap = font.readUInt32BE(20 + i * 16);
  for (let t = 0; t < font.readUInt16BE(cmap + 2); t++) {
    const at = cmap + font.readUInt32BE(cmap + 8 + t * 8);
    if (font.readUInt16BE(at) === 12)
      for (let g = 0; g < font.readUInt32BE(at + 12); g++)
        for (
          let c = font.readUInt32BE(at + 16 + g * 12);
          c <= font.readUInt32BE(at + 20 + g * 12);
          c++
        )
          chars.add(c);
    if (font.readUInt16BE(at) === 4) {
      const segs2 = font.readUInt16BE(at + 6);
      for (let s = 0; s < segs2 / 2; s++)
        for (
          let c = font.readUInt16BE(at + 16 + segs2 + s * 2);
          c <= font.readUInt16BE(at + 14 + s * 2);
          c++
        )
          chars.add(c);
    }
  }
  return chars;
}

/** Characters in the app's own words (strings and JSX text, not comments) that Inter lacks. */
function charactersOutsideInter(file: string, inter: Set<number>): string[] {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (n: ts.Node) => {
    if (
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      ts.isJsxText(n) ||
      ts.isTemplateHead(n) ||
      ts.isTemplateMiddle(n) ||
      ts.isTemplateTail(n)
    )
      for (const ch of n.text)
        if (!/\s/.test(ch) && !inter.has(ch.codePointAt(0)!))
          found.push(
            `${rel(file)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} ${ch}`
          );
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

describe('fonts', () => {
  it('uses no font name typed out by hand — only FONTS tokens', () => {
    const offenders = files.filter((f) =>
      /fontFamily(:\s*|=)['"`]|JosefinSans/.test(readFileSync(f, 'utf8'))
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  // Owner, 2026-10-05: Inter only, kept simple — no italic face.
  it('has no italic face', () => {
    expect(Object.values(FONTS).filter((f) => /italic/i.test(f))).toEqual([]);
  });

  // The weight is the Inter face itself; fontWeight or fontStyle on top makes Android (and SVG
  // text) fall back to the phone's own font or a faked style.
  it('sets no fontWeight or fontStyle — the face carries the weight', () => {
    const offenders = files.filter((f) =>
      /\bfont(Weight|Style)\b|_Italic\b/.test(readFileSync(f, 'utf8'))
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  // The home-screen widget and Live Activity (src/widgets) are drawn by iOS in the widget
  // extension, which can't load Inter (expo-widgets has no way to add a font to it): their text
  // is SwiftUI's, in Apple's system font. Everything the app itself draws stays Inter.
  it('gives every piece of text an Inter face', () => {
    const widgets = join('src', 'widgets', '');
    expect(files.filter((f) => !f.includes(widgets)).flatMap(textWithoutInter)).toEqual([]);
  });

  // A character Inter lacks is drawn in the phone's own font, Inter face or not.
  it('writes only characters Inter can draw', () => {
    const inter = interCharacters();
    expect(inter.has('A'.codePointAt(0)!)).toBe(true);
    expect(files.flatMap((f) => charactersOutsideInter(f, inter))).toEqual([]);
  });
});
