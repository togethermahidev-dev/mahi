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
  // A scratch folder whose backup is stale, so the real repo's backups never decide this.
  assert.strictEqual(
    verdict(bash('supabase db push --help && supabase db push', { cwd, now: now + 61 * 60 * 1000 })),
    'deny'
  );
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

// ─── Matching pingmee-v2's guard (2026-10-03) ──────────────────────────────

const { promptNotes, sessionStartNote, safeRun } = require('./guard.cjs');
// Attribution phrases are built from pieces so this file never carries them whole.
const COAUTHOR = 'Co-' + 'Authored-By: Claude';
const GENERATED = 'Gener' + 'ated with Claude Code';

test('prompt reminders: releases, the database, going live', () => {
  assert.match(promptNotes('can the preview build go onto TestFlight').join(' '), /version-control/);
  assert.match(promptNotes('publish an OTA please').join(' '), /version-control/);
  assert.match(promptNotes('publish an OTA please').join(' '), /ui\/app\.config\.js, ui\/eas\.json/);
  assert.match(promptNotes('add a migration for likes').join(' '), /production/);
  assert.match(promptNotes('we launch next week, roll it out').join(' '), /Step N/);
  assert.deepStrictEqual(promptNotes('make the feed font bigger'), []);
});

test('session start lists files another session already changed', () => {
  const git = (args) => (args[0] === 'branch' ? 'main\n' : ' M src/a.ts\n?? src/b.ts\n');
  const note = sessionStartNote(git);
  assert.match(note, /2 file\(s\)/);
  assert.match(note, /src\/a\.ts/);
  assert.strictEqual(sessionStartNote((args) => (args[0] === 'branch' ? 'main\n' : '')), null);
});

test('a crashing guard asks instead of letting the call through', () => {
  const out = safeRun({ hook_event_name: 'PreToolUse' }, () => {
    throw new Error('boom');
  });
  assert.strictEqual(out.hookSpecificOutput.permissionDecision, 'ask');
  const quiet = safeRun({ hook_event_name: 'UserPromptSubmit' }, () => {
    throw new Error('boom');
  });
  assert.strictEqual(quiet, null);
});

test('supabase MCP: only known read tools pass', () => {
  const mcp = (tool) => verdict(decide({ tool_name: `mcp__supabase__${tool}`, tool_input: {} }));
  assert.strictEqual(mcp('pause_project'), 'deny');
  assert.strictEqual(mcp('restore_project'), 'deny');
  assert.strictEqual(mcp('create_project'), 'deny');
  assert.strictEqual(mcp('list_migrations'), 'allow');
  assert.strictEqual(mcp('get_advisors'), 'allow');
  assert.strictEqual(mcp('search_docs'), 'allow');
  assert.strictEqual(mcp('generate_typescript_types'), 'allow');
  assert.strictEqual(
    verdict(decide({ tool_name: 'mcp__supabase__execute_sql', tool_input: { query: 'set role postgres' } })),
    'deny'
  );
});

test('more production Supabase CLI commands', () => {
  for (const c of [
    'supabase migration squash',
    'supabase config push',
    'supabase storage rm ss:///posts/a.jpg',
    'supabase projects delete abc',
    'supabase backups restore',
    'supabase postgres-config update --config x=1',
    'supabase network-restrictions update',
    'supabase ssl-enforcement update',
    'supabase domains create',
  ])
    assert.strictEqual(verdict(bash(c)), 'deny', c);
  assert.strictEqual(verdict(bash('supabase link --project-ref abc')), 'ask');
  assert.strictEqual(verdict(bash('supabase branches delete x')), 'ask');
  assert.strictEqual(verdict(bash('supabase migration list')), 'allow');
});

test('packages: pnpm from the root, by path', () => {
  assert.strictEqual(verdict(bash('npm install expo-video')), 'deny');
  assert.strictEqual(verdict(bash('yarn add expo-video')), 'deny');
  assert.strictEqual(verdict(bash('pnpm --filter web build')), 'deny');
  assert.strictEqual(verdict(bash('cd web && pnpm add next')), 'deny');
  assert.strictEqual(verdict(bash('cd ui && pnpm add zustand')), 'deny');
  assert.strictEqual(verdict(bash('pnpm --filter ./web build')), 'allow');
  assert.strictEqual(verdict(bash('pnpm --filter ./ui add zustand')), 'allow');
  assert.strictEqual(verdict(bash('cd ui && npx expo install expo-video')), 'allow');
  assert.strictEqual(verdict(bash('npm run lint')), 'allow');
  assert.strictEqual(verdict(bash('npx expo install react-native-screens')), 'allow');
});

test("EAS: every production or store path is the owner's", () => {
  for (const c of [
    'eas update --branch production --message x',
    'npx -y eas-cli@24.7.0 update:roll-back-to-embedded --branch production --runtime-version 0.1.0',
    'eas build --profile=production',
    'eas update --environment production',
    'eas build --profile testflight --platform ios --auto-submit',
    'eas env:create --name X --value y --environment preview',
    'eas env:update X',
    'eas env:delete X',
    'pnpm build:prod',
    'pnpm build:testflight',
    'pnpm ota:prod',
    'pnpm submit:ios',
    // The app is in ui/: the same shortcuts run there directly.
    'pnpm --dir ui build:prod',
    'pnpm -C ui ota:prod',
    'pnpm --filter ./ui submit:ios',
    'cd ui && pnpm build:testflight',
    'cd ui && pnpm run ota:prod -- "x"',
  ])
    assert.strictEqual(verdict(bash(c)), 'deny', c);
  assert.strictEqual(verdict(bash('pnpm --dir ui build:preview')), 'ask');
  assert.strictEqual(verdict(bash('cd ui && pnpm ota:preview "x"')), 'ask');
  assert.strictEqual(verdict(bash('eas channel:edit preview --branch x')), 'ask');
  assert.strictEqual(verdict(bash('eas branch:delete x')), 'ask');
  assert.strictEqual(verdict(bash('pnpm build:preview')), 'ask');
  assert.strictEqual(verdict(bash('pnpm ota:preview')), 'ask');
  assert.strictEqual(verdict(bash('eas env:list --environment preview')), 'allow');
});

test('no AI attribution in PRs, issues, notes or message files', () => {
  assert.strictEqual(verdict(bash(`gh issue create --body "${GENERATED}"`)), 'deny');
  assert.strictEqual(verdict(bash(`git notes add -m "${COAUTHOR}"`)), 'deny');
  assert.strictEqual(verdict(bash('git add :/')), 'deny');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-msg-'));
  fs.writeFileSync(path.join(dir, 'msg.txt'), `Fix\n\n${COAUTHOR}`);
  assert.strictEqual(verdict(bash('git commit -F msg.txt', { cwd: dir })), 'deny');
  fs.writeFileSync(path.join(dir, 'ok.txt'), 'Fix the feed');
  assert.strictEqual(verdict(bash('git commit -F ok.txt', { cwd: dir })), 'allow');
});

test('ui/app.config.js numbers: build number by script, runtime never, version asks', () => {
  const cwd = tmpProject();
  const cfg =
    "  version: '0.1.0',\n  ios: { buildNumber: '10' },\n  android: { versionCode: 10 },\n  runtimeVersion: { policy: 'appVersion' },\n";
  fs.mkdirSync(path.join(cwd, 'ui'));
  fs.writeFileSync(path.join(cwd, 'ui/app.config.js'), cfg);
  const edit = (old_string, new_string) =>
    verdict(decide({ tool_name: 'Edit', tool_input: { file_path: 'ui/app.config.js', old_string, new_string } }, { cwd }));
  // The same edit by absolute path, as Claude Code sends it.
  const abs = path.join(cwd, 'ui/app.config.js');
  assert.strictEqual(
    verdict(decide({ tool_name: 'Edit', tool_input: { file_path: abs, old_string: "buildNumber: '10'", new_string: "buildNumber: '11'" } }, { cwd })),
    'deny'
  );
  assert.strictEqual(edit("buildNumber: '10'", "buildNumber: '11'"), 'deny');
  assert.strictEqual(edit('versionCode: 10', 'versionCode: 11'), 'deny');
  assert.strictEqual(edit("{ policy: 'appVersion' }", "'0.1.0'"), 'deny');
  assert.strictEqual(edit("version: '0.1.0'", "version: '0.2.0'"), 'ask');
  assert.strictEqual(edit('ios: {', 'ios: { supportsTablet: false,'), 'allow');
  const multi = decide(
    {
      tool_name: 'MultiEdit',
      tool_input: {
        file_path: 'ui/app.config.js',
        edits: [{ old_string: "buildNumber: '10'", new_string: "buildNumber: '12'" }],
      },
    },
    { cwd }
  );
  assert.strictEqual(verdict(multi), 'deny');
});

test('device storage reminder on new persisted state', () => {
  const r = decide(
    {
      tool_name: 'Write',
      tool_input: { file_path: 'ui/src/store/x.ts', content: "import { persist } from 'zustand/middleware';" },
    },
    { cwd: tmpProject() }
  );
  assert.strictEqual(r.decision, 'note');
  assert.match(r.reason, /expire|withdrawn/);
});

test('branches: Mahi is main-only until launch', () => {
  const r = bash('git checkout -b feature/x');
  assert.strictEqual(r.decision, 'note');
  assert.match(r.reason, /main/);
});

test('after the owner says "change it", no testing against production', () => {
  const config = require('./guard.config.cjs');
  const after = { config: { ...config, prodTestingAllowed: false } };
  assert.strictEqual(verdict(bash('scripts/db.sh try supabase/migrations/x.sql supabase/tests/x_test.sql', after)), 'deny');
  assert.strictEqual(verdict(bash('scripts/db.sh try supabase/migrations/x.sql supabase/tests/x_test.sql')), 'allow');
  assert.strictEqual(verdict(bash('scripts/db.sh local', after)), 'allow');
});
