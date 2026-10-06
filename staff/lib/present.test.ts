// Run: the staff test script (node's own test runner; no packages needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_INFO,
  auditSentence,
  countBy,
  groupActions,
  matchesSearch,
  standingOf,
  startOfTodayLondon,
  timeAgo,
} from './present.ts';
import type { StaffAction } from './guard.ts';

const NOW = Date.parse('2026-10-06T12:00:00Z');

test('every action has a plain label, an explanation, who sees it, and a group', () => {
  for (const [action, info] of Object.entries(ACTION_INFO)) {
    assert.ok(info.label.length > 0, action);
    assert.ok(info.explain.endsWith('.'), `${action} explain is a sentence`);
    assert.ok(info.seenBy.length > 0, action);
    assert.ok(info.group === 'safe' || info.group === 'serious', action);
    assert.equal(info.label.charAt(0), info.label.charAt(0).toUpperCase(), `${action} sentence case`);
    assert.notEqual(info.label, info.label.toUpperCase(), `${action} is not in capitals`);
  }
});

test('dismiss, take and restore are safe; hide, remove, warn, suspend and ban are serious', () => {
  const safe: StaffAction[] = ['review_report', 'dismiss_report', 'unhide_post', 'restore_comment', 'restore_message', 'unban_user'];
  const serious: StaffAction[] = ['hide_post', 'remove_comment', 'remove_message', 'warn_user', 'suspend_user', 'ban_user'];
  for (const a of safe) assert.equal(ACTION_INFO[a].group, 'safe', a);
  for (const a of serious) assert.equal(ACTION_INFO[a].group, 'serious', a);
});

test('the person sees the note on warnings, suspensions and bans only', () => {
  for (const [action, info] of Object.entries(ACTION_INFO)) {
    const shown = ['warn_user', 'suspend_user', 'ban_user'].includes(action);
    assert.equal(info.noteSeenByPerson, shown, action);
  }
});

test('actions split into safe and serious, keeping their order, and admin-only ones are dropped for moderators', () => {
  const list: StaffAction[] = ['hide_post', 'dismiss_report', 'ban_user', 'warn_user', 'review_report'];
  assert.deepEqual(groupActions(list, 'admin'), {
    safe: ['dismiss_report', 'review_report'],
    serious: ['hide_post', 'ban_user', 'warn_user'],
  });
  assert.deepEqual(groupActions(list, 'moderator'), {
    safe: ['dismiss_report', 'review_report'],
    serious: ['hide_post', 'warn_user'],
  });
});

test('times read as plain words', () => {
  const ago = (s: number) => new Date(NOW - s * 1000).toISOString();
  assert.equal(timeAgo(ago(10), NOW), 'just now');
  assert.equal(timeAgo(ago(60), NOW), '1 min ago');
  assert.equal(timeAgo(ago(125), NOW), '2 min ago');
  assert.equal(timeAgo(ago(3600), NOW), '1 hour ago');
  assert.equal(timeAgo(ago(3 * 3600), NOW), '3 hours ago');
  assert.equal(timeAgo(ago(86400), NOW), 'yesterday');
  assert.equal(timeAgo(ago(3 * 86400), NOW), '3 days ago');
  assert.equal(timeAgo(ago(40 * 86400), NOW), '27 Aug 2026');
  assert.equal(timeAgo(null, NOW), '—');
});

test('today starts at midnight in London', () => {
  // 6 October 2026 is British Summer Time (UTC+1): midnight is 23:00 UTC the day before.
  assert.equal(startOfTodayLondon(NOW), '2026-10-05T23:00:00.000Z');
  // In winter London is UTC.
  assert.equal(startOfTodayLondon(Date.parse('2026-12-01T08:00:00Z')), '2026-12-01T00:00:00.000Z');
});

test('counting by a key, biggest first', () => {
  assert.deepEqual(countBy([{ r: 'spam' }, { r: 'hate' }, { r: 'spam' }], (x) => x.r), [
    ['spam', 2],
    ['hate', 1],
  ]);
});

test('a person is banned, suspended, blocked or in good standing', () => {
  const s = (kind: 'warning' | 'suspension' | 'ban', extra: Record<string, string | null> = {}) => ({
    id: kind,
    user_id: 'u',
    kind,
    reason: 'r',
    report_id: null,
    created_by: null,
    created_at: '2026-10-01T00:00:00Z',
    ends_at: null,
    lifted_at: null,
    seen_at: null,
    ...extra,
  });
  assert.equal(standingOf([], false, NOW).kind, 'ok');
  assert.equal(standingOf([s('warning')], false, NOW).kind, 'warned');
  assert.equal(standingOf([s('suspension', { ends_at: '2026-10-09T00:00:00Z' })], true, NOW).kind, 'suspended');
  assert.equal(standingOf([s('suspension', { ends_at: '2026-10-09T00:00:00Z' })], true, NOW).label, 'Suspended until 9 Oct 2026');
  assert.equal(standingOf([s('suspension', { ends_at: '2026-10-01T00:00:00Z' })], false, NOW).kind, 'ok');
  assert.equal(standingOf([s('ban'), s('suspension', { ends_at: '2026-10-09T00:00:00Z' })], true, NOW).kind, 'banned');
  assert.equal(standingOf([s('ban', { lifted_at: '2026-10-02T00:00:00Z' })], false, NOW).kind, 'ok');
  // Blocked by the switch without a running sanction on record (e.g. set before the portal).
  assert.equal(standingOf([], true, NOW).kind, 'blocked');
});

test('the audit log reads as a sentence', () => {
  const row = {
    id: '1',
    staff_id: 'staff',
    action: 'hide_post',
    target_type: 'post',
    target_id: 'post1',
    report_id: null,
    reason: 'spam link',
    metadata: {},
    created_at: new Date(NOW - 120_000).toISOString(),
  };
  const names = new Map([
    ['staff', 'joe'],
    ['sam', 'sam'],
  ]);
  assert.equal(auditSentence(row, { names, owner: 'sam' }), '@joe hid a post by @sam');
  assert.equal(auditSentence(row, { names }), '@joe hid a post');
  assert.equal(auditSentence({ ...row, staff_id: null, action: 'ai_hide_post' }, { names, owner: 'sam' }), 'The automatic check hid a post by @sam');
  assert.equal(
    auditSentence({ ...row, action: 'suspend_user', target_type: 'user', target_id: 'sam', metadata: { ends_at: '2026-10-09T10:00:00Z' } }, { names }),
    '@joe suspended @sam until 9 Oct 2026',
  );
  assert.equal(auditSentence({ ...row, action: 'warn_user', target_type: 'user', target_id: 'gone' }, { names }), '@joe warned someone');
  assert.equal(auditSentence({ ...row, action: 'dismiss_report', target_type: 'report', target_id: 'r1' }, { names }), '@joe dismissed a report');
  assert.equal(auditSentence({ ...row, staff_id: 'unknown', action: 'something_new' }, { names }), 'A staff member did something new');
});

test('search matches usernames, names and the reported words, ignoring case and @', () => {
  const item = {
    owner: { id: 'o', username: 'Alex', display_name: 'Alex Smith' },
    reporter: { id: 'r', username: 'sam' },
    snapshot: { content: 'Buy cheap followers' },
  };
  assert.equal(matchesSearch(item, ''), true);
  assert.equal(matchesSearch(item, '@alex'), true);
  assert.equal(matchesSearch(item, 'smith'), true);
  assert.equal(matchesSearch(item, 'SAM'), true);
  assert.equal(matchesSearch(item, 'cheap'), true);
  assert.equal(matchesSearch(item, 'nothing'), false);
});
