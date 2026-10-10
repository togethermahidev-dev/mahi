// The sign-up / reset code email's share of the app's design system — the email's version of
// web/scripts/build-tokens.mjs and check-tokens.mjs.
//
// Edge functions run on Deno and deploy from supabase/functions/ only, so they can't import ui/src/.
// This builds supabase/functions/_shared/emailTokens.ts from the app's ui/src/constants/tokens.ts and
// ui/src/constants/fonts.ts. Never edit emailTokens.ts by hand: change the app's tokens, then run
// `pnpm tokens:email` (and redeploy send-otp and send-reset-code).
//
// findProblems is the check: email.ts must not type a colour, size, font, weight or italic by hand.
// Test: pnpm test:scripts (scripts/email-tokens.test.mjs fails on drift or a hand-typed value).
//
// Needs Node 22+ run with --experimental-strip-types so it can import the .ts files directly.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  COLORS,
  FONT_SIZE,
  SPACE,
  SIZE,
  RADIUS,
  TRACKING,
  LINE_HEIGHT,
  BORDER_WIDTH,
} from '../ui/src/constants/tokens.ts';
import { FONTS, FONT_FAMILY, fontFace, fontWeights } from '../web/scripts/font-weights.mjs';

export const TOKENS_FILE = fileURLToPath(new URL('../supabase/functions/_shared/emailTokens.ts', import.meta.url));
export const EMAIL_FILE = fileURLToPath(new URL('../supabase/functions/_shared/email.ts', import.meta.url));

// The app's one family, then fonts for mail apps that ignore web fonts (Gmail): the phone's own
// font, then the common ones. A name with a space is quoted in the stack and joined with + in the link.
const FAMILY = FONT_FAMILY;
const quoted = FAMILY.includes(' ') ? `'${FAMILY}'` : FAMILY;
export const FONT_STACK = `${quoted}, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif`;
export const FONT_LINK = `https://fonts.googleapis.com/css2?family=${FAMILY.replace(/ /g, '+')}:wght@${fontWeights().join(';')}&display=swap`;

// Copied as they are: colours as hex, lengths as numbers (one app point = one email px).
const GROUPS = { COLORS, FONT_SIZE, SPACE, SIZE, RADIUS, TRACKING, LINE_HEIGHT, BORDER_WIDTH };

/** The text of emailTokens.ts. */
export function emailTokensSource() {
  const block = (name, tokens) =>
    `export const ${name} = {\n${Object.entries(tokens)
      .map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`)
      .join('\n')}\n} as const;`;
  const weights = Object.fromEntries(
    Object.entries(FONTS)
      .filter(([, name]) => !fontFace(name).italic)
      .map(([key, name]) => [key, fontFace(name).weight])
  );
  return `/*
 * GENERATED — DO NOT EDIT.
 * Built by scripts/email-tokens.mjs from the app's src/constants/tokens.ts and
 * src/constants/fonts.ts. Change a token there, run \`pnpm tokens:email\`, then redeploy
 * send-otp and send-reset-code. Lengths are numbers: write \${SPACE.s16}px.
 */

${Object.entries(GROUPS)
  .map(([name, tokens]) => block(name, tokens))
  .join('\n\n')}

${block('FONT_WEIGHT', weights)}

/** ${FAMILY} first; mail apps that don't load web fonts (Gmail) fall back along the list. */
export const FONT_STACK = ${JSON.stringify(FONT_STACK)};

/** Loads ${FAMILY} in the weights above (Apple Mail, iOS Mail). */
export const FONT_LINK = ${JSON.stringify(FONT_LINK)};
`;
}

const RULES = [
  {
    why: 'colour typed out — use COLORS',
    re: /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?)\(/g,
  },
  {
    why: 'length typed out — use a token: ${SPACE.s16}px',
    re: /(?<![\w.-])-?\d*\.?\d+(?:px|rem|em|pt)\b/g,
  },
  {
    why: 'number typed into a style — use a token', // percentages (width:100%) are layout, fine
    re: /(?<![\w-])(?:font-size|line-height|letter-spacing|(?:max-|min-)?(?:width|height)|padding|margin|border|border-radius|gap|top|left|right|bottom)(?:-[a-z]+)*\s*:\s*-?[1-9][\d.]*(?![\d.%])/g,
  },
  {
    why: 'number typed into an attribute — use a token: width="${SIZE.z420}"',
    re: /\b(?:width|height|cellpadding|cellspacing|border)="-?[1-9][\d.]*"/g,
  },
  {
    why: 'font typed out — use FONT_STACK and FONT_WEIGHT',
    re: /font-(?:family|weight)\s*:\s*(?!\$\{)|\b(?:sans-serif|serif|monospace|Courier|Trebuchet|Gothic|Segoe|Roboto|Arial|Helvetica)\b/g,
  },
  {
    why: 'italic — the app has no italic face',
    re: /font-style\s*:\s*(?:italic|oblique)|<(?:i|em)\b/g,
  },
];

/** Every hand-typed design value in email.ts's text: [{ line, text, why }]. */
export function findProblems(text) {
  const lineOf = (index) => text.slice(0, index).split('\n').length;
  return RULES.flatMap((rule) =>
    [...text.matchAll(rule.re)].map((m) => ({ line: lineOf(m.index), text: m[0], why: rule.why }))
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(TOKENS_FILE, emailTokensSource());
  console.log('supabase/functions/_shared/emailTokens.ts written from the app tokens');
}
