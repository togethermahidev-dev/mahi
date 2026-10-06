import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rpcFor, errorText } from './rpc.ts';

const ID = '00000000-0000-0000-0000-000000000001';
const REPORT = '00000000-0000-0000-0000-000000000002';

test('every action except taking a report needs a note', () => {
  for (const action of ['dismiss_report', 'hide_post', 'warn_user', 'ban_user', 'unban_user'] as const) {
    const r = rpcFor(action, { targetId: ID, reason: '   ' });
    assert.ok('error' in r, action);
  }
  assert.deepEqual(rpcFor('review_report', { targetId: ID, reason: '' }), {
    fn: 'staff_review_report',
    args: { p_report_id: ID },
  });
});

test('a note is at most 500 characters', () => {
  assert.ok('error' in rpcFor('warn_user', { targetId: ID, reason: 'x'.repeat(501) }));
});

test('the right call and arguments for each action', () => {
  assert.deepEqual(rpcFor('dismiss_report', { targetId: REPORT, reason: ' fine ' }), {
    fn: 'staff_dismiss_report',
    args: { p_report_id: REPORT, p_note: 'fine' },
  });
  assert.deepEqual(rpcFor('hide_post', { targetId: ID, reason: 'r', reportId: REPORT }), {
    fn: 'staff_hide_post',
    args: { p_post_id: ID, p_reason: 'r', p_report_id: REPORT },
  });
  assert.deepEqual(rpcFor('unhide_post', { targetId: ID, reason: 'r', reportId: REPORT }), {
    fn: 'staff_unhide_post',
    args: { p_post_id: ID, p_reason: 'r' },
  });
  assert.deepEqual(rpcFor('remove_comment', { targetId: ID, reason: 'r' }), {
    fn: 'staff_remove_comment',
    args: { p_comment_id: ID, p_reason: 'r', p_report_id: null },
  });
  assert.deepEqual(rpcFor('restore_comment', { targetId: ID, reason: 'r' }), {
    fn: 'staff_restore_comment',
    args: { p_comment_id: ID, p_reason: 'r' },
  });
  assert.deepEqual(rpcFor('warn_user', { targetId: ID, reason: 'r' }), {
    fn: 'staff_warn_user',
    args: { p_user_id: ID, p_reason: 'r', p_report_id: null },
  });
  assert.deepEqual(rpcFor('suspend_user', { targetId: ID, reason: 'r', days: '7' }), {
    fn: 'staff_suspend_user',
    args: { p_user_id: ID, p_reason: 'r', p_days: 7, p_report_id: null },
  });
  assert.deepEqual(rpcFor('ban_user', { targetId: ID, reason: 'r', reportId: REPORT }), {
    fn: 'staff_ban_user',
    args: { p_user_id: ID, p_reason: 'r', p_report_id: REPORT },
  });
  assert.deepEqual(rpcFor('unban_user', { targetId: ID, reason: 'r' }), {
    fn: 'staff_unban_user',
    args: { p_user_id: ID, p_reason: 'r' },
  });
});

test('a suspension is 1 to 365 whole days', () => {
  for (const days of ['0', '366', '1.5', '', 'abc']) {
    assert.ok('error' in rpcFor('suspend_user', { targetId: ID, reason: 'r', days }), days);
  }
});

test('ids must be ids', () => {
  assert.ok('error' in rpcFor('warn_user', { targetId: 'nope', reason: 'r' }));
  assert.ok('error' in rpcFor('warn_user', { targetId: ID, reason: 'r', reportId: 'nope' }));
});

test('server errors become plain words', () => {
  assert.equal(errorText({ code: '42501', message: 'admins only' }), 'Only admins can do this.');
  assert.equal(errorText({ code: '42501', message: 'staff only' }), 'Only staff can do this.');
  assert.equal(errorText({ code: '22023', message: 'a reason is needed' }), 'A reason is needed.');
  assert.equal(errorText({ message: 'boom' }), 'Something went wrong: boom');
});
