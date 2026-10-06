// Fails when a design value is typed out by hand anywhere in web/app/** — the website's version of
// the app's ui/src/lib/__tests__/designTokens.test.ts. Every colour, size, spacing, radius, font size,
// line height, letter spacing and shadow must come from app/tokens.css (generated from the app's
// tokens) — as a var(--mahi-…) or a token class such as p-s24, text-f17, rounded-r24, shadow-b12.
// Fractions like w-1/2 are fine. Spacing classes with a plain number — even p-0 or inset-0 — are
// not: the theme has no base spacing, so Tailwind silently drops them.
//
// Run: pnpm --filter ./web check-tokens   (also part of `lint` and `build`)
// The staff portal runs it on its own folder: node … web/scripts/check-tokens.mjs staff

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RULES = [
  {
    why: 'colour typed out — use a token colour (bg-paper, var(--mahi-color-accent))',
    re: /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g,
  },
  {
    why: 'colour typed out — use a token colour',
    re: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g,
  },
  {
    why: 'length typed out — use a token (p-s16, var(--mahi-space-s16))',
    re: /(?<![\w.-])-?\d*\.?\d+(?:px|rem|em|pt|vh|vw|vmin|vmax|dvh|svh|lvh|ch|ex)\b/g,
  },
  {
    why: 'number typed into a style — use a token variable',
    re: /\b(?:padding|margin|gap|rowGap|columnGap|width|height|minWidth|maxWidth|minHeight|maxHeight|top|left|right|bottom|inset|fontSize|lineHeight|letterSpacing|borderRadius|borderWidth|outlineWidth|outlineOffset|strokeWidth|fontWeight)[A-Za-z]*\s*:\s*['"`]?-?[1-9]/g,
    only: /\.(tsx?|jsx?|mjs)$/,
  },
  {
    why: 'number typed into an attribute — use a token class (size-i20)',
    re: /\b(?:width|height|strokeWidth|fontSize|r)=\{?\s*['"]?-?[1-9]/g,
    only: /\.(tsx|jsx)$/,
  },
  {
    why: 'arbitrary Tailwind value — use a token class',
    re: /(?<![\w-])[a-z][\w-]*-\[[^\]\s]+\]/g,
  },
  {
    why: 'arbitrary Tailwind property — use a token class',
    re: /(?<=^|[\s"'`:])\[[a-z-]+:[^\]\s]+\]/gm,
  },
];

// Tailwind's own scale (p-4, inset-0, text-lg, rounded-xl…). The theme only holds token values,
// so these silently do nothing, or fall back to Tailwind's built-in pixel sizes.
const SIZE_WORD = '(?:\\d?xs|sm|base|md|lg|\\d?xl)';
const TAILWIND_SCALE = new RegExp(
  '^(?:[\\w-]+:)*-?(?:' +
    [
      `(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|w|h|size|min-w|min-h|max-w|max-h|top|right|bottom|left|inset(?:-[xy])?|start|end|translate-[xy]|basis|indent|scroll-[mp][xytrblse]?)-(?:\\d[\\d.]*|px)`,
      `(?:border(?:-[xytrblse])?|outline|outline-offset|ring|ring-offset|decoration|underline-offset|divide-[xy]|stroke)-(?:\\d+|px)`,
      `(?:text|shadow|drop-shadow|inset-shadow|blur|max-w)-${SIZE_WORD}`,
      `rounded(?:-[a-z]{1,2})?-(?:none|${SIZE_WORD}|full)`,
      'max-w-(?:prose|screen-\\w+)',
      'leading-(?:\\d+|none|tight|snug|normal|relaxed|loose)',
      'tracking-(?:tighter|tight|normal|wide|wider|widest)',
      'font-(?:thin|extralight|light|normal|medium|extrabold|black)',
      'opacity-\\d+',
    ].join('|') +
    ')$'
);

/** Every hand-typed design value in one file's text: [{ line, text, why }]. */
export function findProblems(text, file) {
  const problems = [];
  const lineOf = (index) => text.slice(0, index).split('\n').length;

  for (const rule of RULES) {
    if (rule.only && !rule.only.test(file)) continue;
    for (const m of text.matchAll(rule.re)) {
      problems.push({ line: lineOf(m.index), text: m[0], why: rule.why });
    }
  }

  if (/\.(tsx|jsx)$/.test(file)) {
    // Class names live in string literals: check each word of each one.
    for (const m of text.matchAll(/(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) {
      for (const word of m[2].split(/\s+/)) {
        if (TAILWIND_SCALE.test(word)) {
          problems.push({ line: lineOf(m.index), text: word, why: "Tailwind's own scale — use a token class" });
        }
      }
    }
  }
  return problems;
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx?|jsx?|mjs|css)$/.test(name) && name !== 'tokens.css' ? [path] : [];
  });
}

/** layout.tsx must load exactly the Inter weights (and italic) the app's FONTS uses. */
async function fontProblems(webRoot) {
  const { fontWeights, hasItalic } = await import('./font-weights.mjs');
  const layout = readFileSync(join(webRoot, 'app', 'layout.tsx'), 'utf8');
  const loaded = /weight:\s*\[([^\]]*)\]/.exec(layout)?.[1].match(/\d{3}/g)?.map(Number) ?? [];
  const problems = [];
  if (loaded.join() !== fontWeights().join()) {
    problems.push(`app/layout.tsx loads Inter weights [${loaded}], the app's FONTS uses [${fontWeights()}]`);
  }
  if (/style:\s*\[[^\]]*'italic'/.test(layout) !== hasItalic()) {
    problems.push(`app/layout.tsx italic style doesn't match the app's FONTS`);
  }
  return problems;
}

async function main() {
  // Another Next.js app that shares these tokens (the staff portal) passes its own folder.
  const webRoot = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('..', import.meta.url));
  const lines = [];
  for (const file of files(join(webRoot, 'app'))) {
    const rel = relative(webRoot, file);
    for (const p of findProblems(readFileSync(file, 'utf8'), rel)) {
      lines.push(`  ${rel}:${p.line}  ${p.text}  — ${p.why}`);
    }
  }
  lines.push(...(await fontProblems(webRoot)).map((p) => `  ${p}`));

  if (lines.length) {
    console.error(`Design values typed out by hand (use the tokens in app/tokens.css):\n${lines.join('\n')}`);
    process.exit(1);
  }
  console.log('check-tokens: every design value comes from the tokens');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
