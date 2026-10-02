// Run: node --test scripts/slack-channels.test.cjs
// One private Slack channel per feature, each with a pinned summary that is the live scope of work.
const test = require('node:test');
const assert = require('node:assert');
const channels = require('./slack-channels.json');
const { plan, pinnedText } = require('./slack-channels.cjs');

test('every channel has a Slack-safe name, a short purpose and a summary', () => {
  const names = new Set();
  for (const c of channels) {
    assert.match(c.name, /^[a-z0-9-]{1,80}$/, `${c.name} is not a valid channel name`);
    assert.ok(!names.has(c.name), `${c.name} is listed twice`);
    names.add(c.name);
    assert.ok(c.purpose.length > 0 && c.purpose.length <= 250, `${c.name}: purpose must be 1-250 characters`);
    assert.ok(c.summary.length > 0 && c.summary.length <= 3000, `${c.name}: summary must be 1-3000 characters`);
    assert.doesNotMatch(c.summary, /reactive posting|feature flag|migration/i, `${c.name}: no engineering words`);
  }
  assert.ok(channels.length >= 20, 'the whole product is covered');
});

test('the plan creates missing channels and updates the rest', () => {
  const existing = new Map([['feed', { id: 'C1', purpose: 'old words' }]]);
  const out = plan(
    [
      { name: 'feed', purpose: 'new words', summary: 's' },
      { name: 'camera-and-posting', purpose: 'p', summary: 's' },
    ],
    existing
  );
  assert.deepStrictEqual(
    out.map((c) => [c.name, c.action]),
    [
      ['feed', 'update'],
      ['camera-and-posting', 'create'],
    ]
  );
  assert.strictEqual(out[0].id, 'C1');
});

test('the pinned message goes straight into the summary, with no heading', () => {
  assert.strictEqual(pinnedText({ name: 'feed', purpose: 'What the feed shows', summary: 'Body.' }), 'Body.');
});

test('the channel description is only set when it is new or has changed', () => {
  const { needsPurpose } = require('./slack-channels.cjs');
  assert.strictEqual(needsPurpose({ action: 'create', purpose: 'p' }, undefined), true);
  assert.strictEqual(needsPurpose({ action: 'update', purpose: 'p' }, 'p'), false);
  assert.strictEqual(needsPurpose({ action: 'update', purpose: 'new' }, 'old'), true);
});

test('an update goes to a known channel as a short, plain summary', () => {
  const { updateMessage } = require('./slack-channels.cjs');
  assert.strictEqual(updateMessage('feed', 'Likes and comments sit higher up.', channels), 'Likes and comments sit higher up.');
  assert.throws(() => updateMessage('no-such-channel', 'x', channels), /unknown channel/);
  assert.throws(() => updateMessage('feed', '   ', channels), /empty/);
  assert.throws(() => updateMessage('feed', 'x'.repeat(601), channels), /too long/);
  assert.throws(() => updateMessage('feed', 'Added a migration for it', channels), /engineering words/);
});
