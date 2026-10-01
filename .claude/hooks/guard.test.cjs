// Run: node --test .claude/hooks/guard.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { decide } = require('./guard.cjs');

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  fs.mkdirSync(path.join(dir, 'supabase/migrations'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'supabase/migrations/20260625080354_old.sql'), '');
  return dir;
}
const bash = (command, opts) => decide({ tool_name: 'Bash', tool_input: { command } }, opts);
const verdict = (r) => (r ? r.decision : 'allow');

test('git staging rules', () => {
  assert.strictEqual(verdict(bash('git add -A')), 'deny');
  assert.strictEqual(verdict(bash('git add .')), 'deny');
  assert.strictEqual(verdict(bash('git add -u')), 'deny');
  assert.strictEqual(verdict(bash('git commit -am "x"')), 'deny');
  assert.strictEqual(verdict(bash('git add docs/a.md && git commit -m "Add a"')), 'allow');
  assert.strictEqual(verdict(bash('git commit --amend -m "x"')), 'allow');
});

test('no AI attribution in commits', () => {
  assert.strictEqual(verdict(bash('git commit -m "x\n\nCo-Authored-By: Claude"')), 'deny');
  assert.strictEqual(verdict(bash('git commit -m "Fix feed"')), 'allow');
});

test('production database pushes need a fresh backup', () => {
  const cwd = tmpProject();
  const now = Date.now();
  assert.strictEqual(verdict(bash('supabase db push', { cwd, now })), 'deny');
  fs.mkdirSync(path.join(cwd, 'supabase/backups'));
  fs.writeFileSync(path.join(cwd, 'supabase/backups/1_schema.sql'), '');
  assert.strictEqual(verdict(bash('supabase db push', { cwd, now })), 'deny');
  fs.writeFileSync(path.join(cwd, 'supabase/backups/1_data.sql'), '');
  assert.strictEqual(verdict(bash('supabase db push', { cwd, now })), 'ask');
  assert.strictEqual(verdict(bash('supabase db push', { cwd, now: now + 61 * 60 * 1000 })), 'deny');
  assert.strictEqual(verdict(bash('scripts/db.sh push', { cwd, now: now + 61 * 60 * 1000 })), 'deny');
  assert.strictEqual(verdict(bash('scripts/db.sh push --dry-run', { cwd, now })), 'ask');
  assert.strictEqual(verdict(bash('scripts/db.sh backup', { cwd, now })), 'allow');
  assert.strictEqual(verdict(bash('supabase db push --help')), 'allow');
  assert.strictEqual(verdict(bash('supabase db push --help && supabase db push')), 'deny');
});

test('other production commands', () => {
  assert.strictEqual(verdict(bash('supabase db reset --linked')), 'deny');
  assert.strictEqual(verdict(bash('supabase functions deploy send-push')), 'ask');
  assert.strictEqual(verdict(bash('eas build --profile production')), 'deny');
  assert.strictEqual(verdict(bash('eas update --channel production')), 'deny');
  assert.strictEqual(verdict(bash('eas submit')), 'deny');
  assert.strictEqual(verdict(bash('git push')), 'ask');
  assert.strictEqual(verdict(bash('supabase db dump --linked -f x.sql')), 'allow');
  assert.strictEqual(verdict(bash('curl https://pzepodsppqtvptzmwxzs.supabase.co/rest/v1/x')), 'ask');
});

test('supabase MCP is read-only', () => {
  const mcp = (tool, tool_input = {}) => verdict(decide({ tool_name: `mcp__supabase__${tool}`, tool_input }));
  assert.strictEqual(mcp('apply_migration'), 'deny');
  assert.strictEqual(mcp('deploy_edge_function'), 'deny');
  assert.strictEqual(mcp('execute_sql', { query: 'select count(*) from posts' }), 'allow');
  assert.strictEqual(mcp('execute_sql', { query: 'update profiles set points = 1' }), 'deny');
  assert.strictEqual(mcp('execute_sql', { query: 'CREATE TABLE x (id int)' }), 'deny');
  assert.strictEqual(mcp('execute_sql', { query: '-- update\nselect updated_at from profiles' }), 'allow');
  assert.strictEqual(mcp('list_tables'), 'allow');
  assert.strictEqual(
    verdict(decide({ tool_name: 'mcp__claude_ai_Claude_Docs__update', tool_input: {} })),
    'allow'
  );
});

test('migration files', () => {
  const cwd = tmpProject();
  const write = (name, content = '') =>
    verdict(decide({ tool_name: 'Write', tool_input: { file_path: `supabase/migrations/${name}`, content } }, { cwd }));
  assert.strictEqual(write('0007_reconcile.sql'), 'deny');
  assert.strictEqual(write('20260101000000_too_old.sql'), 'deny');
  assert.strictEqual(write('20260917120000_timezone_postdate.sql'), 'allow');
  assert.strictEqual(write('20260625080354_old.sql'), 'ask');
  assert.strictEqual(
    verdict(decide({ tool_name: 'Write', tool_input: { file_path: 'src/a.ts', content: '// Generated with Claude Code' } }, { cwd })),
    'deny'
  );
});

test('build numbers live in app.config.js, never in EAS', () => {
  assert.strictEqual(verdict(bash('npx eas build:version:set --platform ios')), 'deny');
  assert.notStrictEqual(verdict(bash('eas build:version:get --platform all --profile preview')), 'deny');
  const write = (content) =>
    decide({ tool_name: 'Write', tool_input: { file_path: 'eas.json', content } }, { cwd: tmpProject() });
  assert.strictEqual(verdict(write('{"build":{"preview":{"autoIncrement":true}}}')), 'deny');
  assert.strictEqual(verdict(write('{"cli":{"appVersionSource":"remote"}}')), 'deny');
  assert.strictEqual(verdict(write('{"cli":{"appVersionSource":"local"}}')), 'allow');
});
