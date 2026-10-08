// Run: pnpm test:staff (node's own test runner; no packages needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessFor, canDo, parseRole, safeNext, tokenExpiresSoon } from './guard.ts';

test('a person not signed in goes to the sign-in page', () => {
  assert.equal(accessFor({ signedIn: false, role: null }), 'sign-in');
  // A role without a session means nothing: still sign in.
  assert.equal(accessFor({ signedIn: false, role: 'admin' }), 'sign-in');
});

test('a signed-in person who is not staff is signed out', () => {
  assert.equal(accessFor({ signedIn: true, role: null }), 'sign-out');
});

test('admins and moderators are let in', () => {
  assert.equal(accessFor({ signedIn: true, role: 'admin' }), 'allow');
  assert.equal(accessFor({ signedIn: true, role: 'moderator' }), 'allow');
});

test('only the two known roles count; anything else is not staff', () => {
  assert.equal(parseRole('admin'), 'admin');
  assert.equal(parseRole('moderator'), 'moderator');
  for (const bad of [null, undefined, '', 'Admin', 'owner', 1, true, {}, ['admin']]) {
    assert.equal(parseRole(bad), null, `role ${JSON.stringify(bad)}`);
  }
});

test('ban and unban are for admins only', () => {
  assert.equal(canDo('admin', 'ban_user'), true);
  assert.equal(canDo('admin', 'unban_user'), true);
  assert.equal(canDo('moderator', 'ban_user'), false);
  assert.equal(canDo('moderator', 'unban_user'), false);
});

test('moderators can do every other action', () => {
  for (const action of [
    'dismiss_report',
    'review_report',
    'hide_post',
    'unhide_post',
    'remove_comment',
    'restore_comment',
    'remove_message',
    'restore_message',
    'warn_user',
    'suspend_user',
  ] as const) {
    assert.equal(canDo('moderator', action), true, action);
    assert.equal(canDo('admin', action), true, action);
  }
});

test('someone without a role can do nothing', () => {
  assert.equal(canDo(null, 'dismiss_report'), false);
  assert.equal(canDo(null, 'ban_user'), false);
});

test('after sign-in, only a path on this site is followed; otherwise the overview', () => {
  assert.equal(safeNext('/reports/abc'), '/reports/abc');
  assert.equal(safeNext(null), '/');
  assert.equal(safeNext(''), '/');
  assert.equal(safeNext('https://evil.example'), '/');
  assert.equal(safeNext('//evil.example'), '/');
  assert.equal(safeNext('/\\evil.example'), '/');
  assert.equal(safeNext('/login'), '/');
  // Browsers drop tabs and newlines in a URL, so "/\t/evil.example" would become "//evil.example".
  assert.equal(safeNext('/\t/evil.example'), '/');
  assert.equal(safeNext('/\n/evil.example'), '/');
  assert.equal(safeNext('/\r\\evil.example'), '/');
});

test('a token is refreshed when it ends within a minute, or cannot be read', () => {
  const now = 1_000_000;
  const token = (exp: number) =>
    `x.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.y`;
  assert.equal(tokenExpiresSoon(token(now + 3600), now), false);
  assert.equal(tokenExpiresSoon(token(now + 30), now), true);
  assert.equal(tokenExpiresSoon(token(now - 1), now), true);
  assert.equal(tokenExpiresSoon('not-a-token', now), true);
});
