// Run: pnpm --filter ./web test   (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findProblems } from './check-tokens.mjs';

const tsx = (code) => findProblems(code, 'app/x.tsx');
const css = (code) => findProblems(code, 'app/x.css');

test('token classes and token variables pass', () => {
  assert.deepEqual(tsx(`<div className="p-s24 md:gap-s48 text-f17 leading-l28 bg-white rounded-pill" />`), []);
  assert.deepEqual(tsx(`<div className="w-full top-1/2 -translate-y-1/2 md:grid-cols-2 size-i20 max-w-z800 w-1/2" />`), []);
  assert.deepEqual(css(`html { color: var(--mahi-color-ink-deep); }`), []);
  assert.deepEqual(tsx(`<a href="#how-it-works">How</a>`), []);
});

test('a typed-out colour fails', () => {
  assert.equal(tsx(`<div style={{ color: '#ff0000' }} />`).length, 1);
  assert.equal(css(`a { color: #FFF; }`).length, 1);
  assert.equal(css(`a { color: rgba(0,0,0,0.5); }`).length, 1);
  assert.equal(css(`a { color: oklch(0.5 0.1 200); }`).length, 1);
});

test('a typed-out length fails', () => {
  assert.equal(css(`a { padding: 13px; }`).length, 1);
  assert.equal(css(`a { margin: 1.5rem; }`).length, 1);
  assert.equal(tsx(`<div style={{ marginTop: 12 }} />`).length, 1);
  assert.equal(tsx(`<svg width={24} />`).length, 1);
});

test('arbitrary Tailwind values fail', () => {
  assert.ok(tsx(`<div className="p-[13px]" />`).some((p) => p.text === 'p-[13px]'));
  assert.ok(tsx(`<div className="md:bg-[var(--x)]" />`).some((p) => p.text === 'bg-[var(--x)]'));
  assert.ok(tsx(`<div className="[color:red]" />`).some((p) => p.text === '[color:red]'));
});

test("Tailwind's own scale fails", () => {
  for (const cls of ['p-4', 'mt-2.5', 'text-lg', 'rounded-xl', 'rounded-full', 'shadow-md', 'max-w-md', 'leading-6', 'tracking-wide', 'font-medium', 'border-2', 'outline-2', 'opacity-50', 'w-64', 'gap-px', 'inset-y-0', 'p-0']) {
    assert.equal(tsx(`<div className="hover:${cls}" />`).length, 1, cls);
  }
});
