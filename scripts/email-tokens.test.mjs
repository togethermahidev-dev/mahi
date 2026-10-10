// Run: pnpm test:scripts   (or: node --experimental-strip-types --test scripts/email-tokens.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fontWeights } from '../web/scripts/font-weights.mjs';
import {
  EMAIL_FILE,
  TOKENS_FILE,
  FONT_LINK,
  FONT_STACK,
  emailTokensSource,
  findProblems,
} from './email-tokens.mjs';

const fails = (code) => assert.ok(findProblems(code).length > 0, `should fail: ${code}`);

test('token values pass', () => {
  assert.deepEqual(findProblems('<td style="color:${COLORS.white};padding:${SPACE.s20}px 0;margin:0 auto;width:100%;">'), []);
  assert.deepEqual(findProblems('<p style="font-family:${FONT_STACK};font-weight:${FONT_WEIGHT.bold};">'), []);
  assert.deepEqual(findProblems('<table width="${SIZE.z420}" cellpadding="0" cellspacing="0">Didn&rsquo;t &#8217;</table>'), []);
  assert.deepEqual(findProblems('<meta name="viewport" content="width=device-width, initial-scale=1.0" />'), []);
});

test('a typed-out colour fails', () => {
  for (const code of ['background:#F0F0EB;', 'color:#333;', 'color:rgba(0,0,0,0.5);', 'linear-gradient(135deg,#59c2d7 0%,#5B5BD6 100%)']) {
    fails(code);
  }
});

test('a typed-out size fails', () => {
  for (const code of ['padding:13px;', 'margin:0 0 20px;', 'letter-spacing:0.5px;', 'line-height:1.7;', 'font-size:2em;', '<table width="540">', '<td height="68">']) {
    fails(code);
  }
});

test('a typed-out font, weight or italic fails', () => {
  for (const code of [
    "font-family:'Courier New',monospace;",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;",
    'const WORDMARK = "Trebuchet MS, Arial, sans-serif";',
    'font-weight:800;',
    'font-weight:bold;',
    'font-style:italic;',
    '<em>now</em>',
  ]) {
    fails(code);
  }
});

test('the code email types no design value by hand', () => {
  const problems = findProblems(readFileSync(EMAIL_FILE, 'utf8')).map((p) => `email.ts:${p.line}  ${p.text}  — ${p.why}`);
  assert.deepEqual(problems, []);
});

test('emailTokens.ts matches the app tokens (else run `pnpm tokens:email`)', () => {
  const current = existsSync(TOKENS_FILE) ? readFileSync(TOKENS_FILE, 'utf8') : '';
  assert.equal(current, emailTokensSource());
});

test("the code email loads the app's typeface and uses one font stack, the app weights and no italic", async () => {
  assert.match(FONT_STACK, /^'Inter Tight', .*sans-serif$/);
  assert.ok(FONT_LINK.includes(`family=Inter+Tight:wght@${fontWeights().join(';')}&`), FONT_LINK);

  // By URL, so the app's tsc doesn't pull this Deno file into its type check.
  const { codeEmailHtml } = await import(pathToFileURL(EMAIL_FILE).href);
  const html = codeEmailHtml('042917', { title: 't', heading: 'h', intro: 'i', ignoreNote: 'n' });
  assert.ok(html.split('</head>')[0].includes(`<link href="${FONT_LINK}" rel="stylesheet"`), 'font link in <head>');
  const stacks = [...html.matchAll(/font-family:([^;"]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(stacks)], [FONT_STACK]);
  const weights = [...html.matchAll(/font-weight:([^;"]+)/g)].map((m) => Number(m[1]));
  assert.ok(weights.length && weights.every((w) => fontWeights().includes(w)), `weights used: ${weights}`);
  assert.doesNotMatch(html, /italic|oblique|<em\b|<i\b/);
});
