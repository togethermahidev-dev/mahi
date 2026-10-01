// Builds web/app/tokens.css from the app's design tokens, so the website and the app share one
// design system. Source of truth: src/constants/tokens.ts and src/constants/fonts.ts (repo root).
// Never edit tokens.css by hand: change the app's tokens, then run `pnpm --filter ./web tokens`
// (it also runs before every `dev` and `build`).
//
// Needs Node 22+ run with --experimental-strip-types so it can import the .ts files directly.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  COLORS,
  FONT_SIZE,
  SPACE,
  RADIUS,
  SHADOW_BLUR,
  SIZE,
  OFFSET,
  ICON_SIZE,
  TRACKING,
  LINE_HEIGHT,
  BORDER_WIDTH,
  NAV_RAIL,
  withAlpha,
} from '../../src/constants/tokens.ts';
import { FONTS, fontFace } from './font-weights.mjs';

const OUT = fileURLToPath(new URL('../app/tokens.css', import.meta.url));

// The app works in points; on the web 1pt = 1px, written as rem (16px = 1rem) so text and spacing
// follow the reader's browser text size.
const rem = (n) => `${+(n / 16).toFixed(4)}rem`;
const px = (n) => `${n}px`;
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

// Each token group: its raw custom-property prefix, how a value is written, and (optionally) the
// Tailwind namespace it feeds. Lengths that share Tailwind's --spacing namespace keep their
// group's letter (s16, z400, o4, i20), so `p-s16`, `w-z400`, `top-o4` and `size-i20` all read
// straight back to the token.
const GROUPS = [
  { name: 'COLORS', tokens: COLORS, prefix: 'color', write: (v) => v, tw: 'color' },
  { name: 'FONT_SIZE', tokens: FONT_SIZE, prefix: 'font-size', write: rem, tw: 'text' },
  { name: 'SPACE', tokens: SPACE, prefix: 'space', write: rem, tw: 'spacing' },
  { name: 'SIZE', tokens: SIZE, prefix: 'size', write: rem, tw: 'spacing' },
  { name: 'OFFSET', tokens: OFFSET, prefix: 'offset', write: rem, tw: 'spacing' },
  { name: 'ICON_SIZE', tokens: ICON_SIZE, prefix: 'icon-size', write: rem, tw: 'spacing' },
  { name: 'RADIUS', tokens: RADIUS, prefix: 'radius', write: rem, tw: 'radius' },
  { name: 'TRACKING', tokens: TRACKING, prefix: 'tracking', write: rem, tw: 'tracking' },
  { name: 'LINE_HEIGHT', tokens: LINE_HEIGHT, prefix: 'line-height', write: rem, tw: 'leading' },
  { name: 'SHADOW_BLUR', tokens: SHADOW_BLUR, prefix: 'shadow-blur', write: px },
  { name: 'BORDER_WIDTH', tokens: BORDER_WIDTH, prefix: 'border-width', write: px },
  { name: 'NAV_RAIL', tokens: NAV_RAIL, prefix: 'nav-rail', write: (v) => String(v) },
];

const cssVar = (prefix, key) => `--mahi-${prefix}-${kebab(key)}`;
const twKey = (group, key) => (group.tw === 'color' ? kebab(key) : key);

const root = [];
const theme = [];
const utilities = [];

for (const g of GROUPS) {
  root.push(`  /* ${g.name} */`);
  for (const [key, value] of Object.entries(g.tokens)) {
    root.push(`  ${cssVar(g.prefix, key)}: ${g.write(value)};`);
  }
}

// Fonts: one family, weights and the italic style read from FONTS.
root.push('  /* FONTS */');
for (const [key, name] of Object.entries(FONTS)) {
  const { weight, italic } = fontFace(name);
  root.push(`  ${cssVar('font-weight', key)}: ${weight};`);
  if (italic) root.push(`  ${cssVar('font-style', key)}: italic;`);
}

// Shadows, built the way the app builds its floating nav rail shadow (NavRail.tsx `float`):
// straight down by SIZE.z4, blurred by a SHADOW_BLUR token, black at NAV_RAIL.shadowOpacity.
root.push('  /* Shadows (composed from SIZE, SHADOW_BLUR, COLORS and NAV_RAIL) */');
root.push(`  --mahi-shadow-color: ${withAlpha(COLORS.black, NAV_RAIL.shadowOpacity)};`);
for (const key of Object.keys(SHADOW_BLUR)) {
  root.push(
    `  --mahi-shadow-${key}: 0 var(${cssVar('size', 'z4')}) var(${cssVar('shadow-blur', key)}) var(--mahi-shadow-color);`
  );
}

// Tailwind: wipe its default scales so only token classes exist, then map every token in.
theme.push('  --color-*: initial;', '  --text-*: initial;', '  --spacing-*: initial;');
theme.push('  --radius-*: initial;', '  --tracking-*: initial;', '  --leading-*: initial;');
theme.push('  --shadow-*: initial;', '  --font-weight-*: initial;', '  --breakpoint-*: initial;');
theme.push('  --container-*: initial;', '  --font-*: initial;');
for (const g of GROUPS.filter((x) => x.tw)) {
  theme.push(`  /* ${g.name} */`);
  for (const key of Object.keys(g.tokens)) {
    theme.push(`  --${g.tw}-${twKey(g, key)}: var(${cssVar(g.prefix, key)});`);
  }
}
theme.push('  /* SHADOW_BLUR → shadows */');
for (const key of Object.keys(SHADOW_BLUR)) theme.push(`  --shadow-${key}: var(--mahi-shadow-${key});`);
theme.push('  /* FONTS */');
theme.push('  --font-sans: var(--font-inter), system-ui, sans-serif;');
for (const key of Object.keys(FONTS)) {
  if (!fontFace(FONTS[key]).italic) theme.push(`  --font-weight-${kebab(key)}: var(${cssVar('font-weight', key)});`);
}
// Media queries can't read CSS variables, so breakpoints are written out (from SIZE).
theme.push('  /* Breakpoints (from SIZE; media queries need the value written out) */');
theme.push(`  --breakpoint-sm: ${rem(SIZE.z420)};`);
theme.push(`  --breakpoint-md: ${rem(SIZE.z800)};`);

const BORDER_SIDES = {
  t: 'border-top-width',
  r: 'border-right-width',
  b: 'border-bottom-width',
  l: 'border-left-width',
  x: 'border-inline-width',
  y: 'border-block-width',
};

// Border and outline widths have no Tailwind theme namespace, so they get their own utilities.
for (const key of Object.keys(BORDER_WIDTH)) {
  utilities.push(`@utility border-${key} {\n  border-width: var(${cssVar('border-width', key)});\n}`);
  for (const [side, prop] of Object.entries(BORDER_SIDES)) {
    utilities.push(`@utility border-${side}-${key} {\n  ${prop}: var(${cssVar('border-width', key)});\n}`);
  }
  utilities.push(`@utility outline-${key} {\n  outline-width: var(${cssVar('border-width', key)});\n}`);
  utilities.push(`@utility decoration-${key} {\n  text-decoration-thickness: var(${cssVar('border-width', key)});\n}`);
}
for (const key of Object.keys(OFFSET)) {
  utilities.push(`@utility outline-offset-${key} {\n  outline-offset: var(${cssVar('offset', key)});\n}`);
  utilities.push(`@utility underline-offset-${key} {\n  text-underline-offset: var(${cssVar('offset', key)});\n}`);
}

const css = `/*
 * GENERATED — DO NOT EDIT.
 * Built by web/scripts/build-tokens.mjs from the app's src/constants/tokens.ts and
 * src/constants/fonts.ts. Change a token there, then run \`pnpm --filter ./web tokens\`.
 */

:root {
${root.join('\n')}
}

@theme inline {
${theme.join('\n')}
}

${utilities.join('\n\n')}
`;

if (process.argv.includes('--check')) {
  if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== css) {
    console.error('app/tokens.css is out of date with the app tokens: run `pnpm --filter ./web tokens`');
    process.exit(1);
  }
  console.log('tokens.css matches the app tokens');
  process.exit(0);
}

writeFileSync(OUT, css);
console.log(`tokens.css written (${root.length} custom properties and headings, ${theme.length} theme lines)`);
