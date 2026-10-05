#!/usr/bin/env node
// Project guard: enforces the project's hard rules instead of relying on memory.
// Events (wired in .claude/settings.json):
//   PreToolUse       — deny / ask / note on Bash, file edits and the Supabase MCP
//   UserPromptSubmit — adds the release, database or go-live rules when a prompt is about them
//   SessionStart     — lists files that already carried changes before this session
// Reads the hook payload on stdin and prints a decision, or nothing to allow.
// Laid out like pingmee-v2's guard (2026-10-03); tests in guard.test.cjs.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const defaultConfig = require('./guard.config.cjs');

const SQL_WRITE =
  /\b(insert|update|upsert|delete|merge|create|alter|drop|truncate|grant|revoke|comment\s+on|vacuum|reindex|cluster|refresh|call|do|copy|lock|reassign|import|security\s+label|notify|set\s+(role|session))\b/i;
const MIGRATION_NAME = /^(\d{14})_[a-z0-9_]+\.sql$/;
const AI_ATTRIBUTION = /co-authored-by|generated with|🤖/i;
// The same check for file content, built from pieces so this file never carries the phrases whole.
const FILE_ATTRIBUTION = new RegExp(
  ['co-authored', '-by:|generated with clau', 'de|🤖 gener', 'ated'].join(''),
  'i'
);
// The Supabase MCP points at production: only these read tools pass (an allow-list, so a new
// write tool is blocked until someone looks at it).
const MCP_READ_TOOL = /^(list_\w+|get_\w+|search_docs|generate_typescript_types|execute_sql)$/;

// `pnpm <script>` from the root, or straight in the app: pnpm --dir ui / -C ui / --filter ./ui.
const PNPM_RUN = String.raw`\bpnpm\s+(?:(?:--dir|-C|--filter)(?:=|\s+)\S+\s+)*(?:run\s+)?`;

const deny = (reason) => ({ decision: 'deny', reason });
const ask = (reason) => ({ decision: 'ask', reason });
const note = (reason) => ({ decision: 'note', reason });

function stripSqlComments(sql) {
  return sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function hasFreshBackup(cwd, now, config) {
  const dir = path.join(cwd, config.backupDir);
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return false;
  }
  const cutoff = now - config.backupMaxAgeMinutes * 60 * 1000;
  const fresh = (suffix) =>
    names.some(
      (n) => n.endsWith(suffix) && fs.statSync(path.join(dir, n)).mtimeMs >= cutoff
    );
  return fresh('_schema.sql') && fresh('_data.sql');
}

// ─── prompt reminders ────────────────────────────────────────────────────────

const RELEASE_RE =
  /\b(eas|ota|otas|testflight|app ?store|play ?store|build ?numbers?|native build|update gate|min_version|min_build|runtime ?version|version ?control|release)\b|\b(preview|dev|development|production|prod|store|ios|android)\s+(build|lane|app)s?\b|\blanes?\b/;
const RELEASE_NOTE =
  '[guard: release rules] This prompt is about builds, updates, versions or lanes. Read the /version-control skill (.claude/skills/version-control/SKILL.md) first and check live state (ui/app.config.js, ui/eas.json, ui/src/constants/ota.ts) before saying a command works. EAS runs from ui/. The owner runs builds and production steps; store releases come only from the production profile, never testflight. Never change version or the gate without the owner.';
const DB_RE =
  /\b(supabase|migrations?|sql|database|db|rls|edge ?(fn|fns|functions?)|secrets?|pgtap)\b/;
const DB_NOTE =
  '[guard: database] Mahi has ONE Supabase project and it is production (pzepodsppqtvptzmwxzs). Schema changes only through migration files + rollback file + pgTAP test: scripts/db.sh try → backup → the owner runs scripts/db.sh push. Check tables and functions with list_tables / list_migrations (read-only) before using them. Pre-launch only: the preview lane points at production; once the owner says "change it", never again.';
const PROMOTE_RE =
  /\b(promot\w*|go live|launch\w*|ship (it|to prod\w*)|roll ?out|release day|to production)\b/;
const PROMOTE_NOTE =
  '[guard: going live] Production steps run as ONE numbered step list kept in a local file with a CURRENT STEP marker; every reply opens "📍 Step N — YOUR turn" or "📍 Step N — MY turn" with only that step. Read-only checks against prod before and after each production step, labelled "checked against prod". Rollback order: flag off → gate back → redeploy the previous function → rollback migration.';

function promptNotes(prompt) {
  const p = String(prompt || '').toLowerCase();
  const notes = [];
  if (RELEASE_RE.test(p)) notes.push(RELEASE_NOTE);
  if (DB_RE.test(p)) notes.push(DB_NOTE);
  if (PROMOTE_RE.test(p)) notes.push(PROMOTE_NOTE);
  return notes;
}

// ─── session start ───────────────────────────────────────────────────────────

function liveGit(cwd) {
  return (args) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 3000 });
    return r.status === 0 ? r.stdout : null;
  };
}

function sessionStartNote(git) {
  const branch = (git(['branch', '--show-current']) || '').trim();
  const lines = (git(['status', '--porcelain']) || '').split('\n').filter((l) => l.trim());
  if (!lines.length) return null;
  const shown = lines
    .slice(0, 20)
    .map((l) => l.trim())
    .join(', ');
  return `[guard] Branch ${branch || '?'}: ${lines.length} file(s) already carry uncommitted changes before this session started${lines.length > 20 ? ' (first 20)' : ''}: ${shown}. Another session may be working on them — stage only the files this session changed, by name, and leave the rest as found.`;
}

// ─── Bash ────────────────────────────────────────────────────────────────────

/** Text of a message file given with -F / --file / --body-file, if it exists. */
function messageFileText(cmd, cwd) {
  const m = /(?:\s-F\s*|\s--file[=\s]|\s--body-file[=\s])\s*("[^"]+"|'[^']+'|\S+)/.exec(cmd);
  if (!m) return '';
  try {
    return fs.readFileSync(path.resolve(cwd, m[1].replace(/^["']|["']$/g, '')), 'utf8');
  } catch {
    return '';
  }
}

function checkBash(cmd, cwd, now, config) {
  if (/^\s*\S+(\s+\S+){0,3}\s+(--help|-h)\s*$/.test(cmd)) return null;

  // Git
  if (/\bgit\s+add\s+(-A\b|--all\b|-u\b|--update\b|\.(\s|$)|:\/)/.test(cmd))
    return deny('Stage files by name. Never git add -A / . / -u / :/.');
  if (/\bgit\s+commit\b[^|;&]*\s-(?!-)[a-zA-Z]*a/.test(cmd))
    return deny('Never git commit -a. Stage files by name.');
  if (
    /\b(git\s+(commit|tag|notes)|gh\s+(pr|release|issue))\b/.test(cmd) &&
    (AI_ATTRIBUTION.test(cmd) || AI_ATTRIBUTION.test(messageFileText(cmd, cwd)))
  )
    return deny('No AI attribution in commits, tags, notes, PRs, issues or releases.');

  // Packages: pnpm from the root, workspaces by path
  if (
    /\bnpm\s+(i|install|add|ci|uninstall|remove)\b|\byarn(\s+(add|install|remove)\b|\s*$|\s*[;&|])/.test(
      cmd
    )
  )
    return deny('This repo uses pnpm. Install from the repo root with pnpm (or npx expo install).');
  if (/--filter(=|\s+)(?!["']?\.\/)\S+/.test(cmd))
    return deny(
      'Use the path form --filter ./web or --filter ./ui: the packages are named mahi-web and mahi-app, so --filter web matches nothing and passes silently.'
    );
  if (/\bcd\s+["']?\.?\/?(web|ui)\b[^;&|]*(&&|;)\s*pnpm\s+(add|install|i|remove|rm)\b/.test(cmd))
    return deny(
      'Install from the repo root: pnpm --filter ./web add <pkg> or pnpm --filter ./ui add <pkg> (Expo packages: cd ui && npx expo install <pkg>).'
    );

  // Releases (EAS and the package.json shortcuts)
  if (/\beas(-cli(@\S+)?)?\s+build:version:set\b/.test(cmd))
    return deny(
      'Never set EAS build numbers. The one build number lives in ui/app.config.js; use pnpm release:prepare.'
    );
  if (/\beas(-cli(@\S+)?)?\s+submit\b|--auto-submit\b/.test(cmd))
    return deny('Store submission is owner-only.');
  if (/\beas(-cli(@\S+)?)?\s+env:(create|update|delete|push)\b/.test(cmd))
    return deny('EAS environment variables are owner-only.');
  if (
    /\beas\b/.test(cmd) &&
    (/--(profile|channel|branch|environment)(=|\s+)production\b/.test(cmd) ||
      /--profile(=|\s+)testflight\b/.test(cmd))
  )
    return deny('Production and App Store (testflight) EAS builds and updates are owner-only.');
  if (new RegExp(`${PNPM_RUN}(build:(prod|production|testflight|all)|ota:prod|submit:\\w+)\\b`).test(cmd))
    return deny('Production and store shortcuts are owner-only.');
  if (
    /\beas(-cli(@\S+)?)?\s+(channel:(edit|rollout|delete)|branch:(delete|rename)|update:(delete|republish))\b/.test(
      cmd
    )
  )
    return ask(
      'This changes what phones on an update channel receive. Confirm the owner said go in this session.'
    );
  if (new RegExp(`${PNPM_RUN}(build:preview|ota:preview)\\b`).test(cmd))
    return ask('Confirm this preview build / update is wanted (the owner says go in this session).');

  // Supabase (the linked project is production)
  if (!config.prodTestingAllowed && /\bdb\.sh\s+try\b/.test(cmd))
    return deny(
      'Testing against production ended when the owner said "change it". Use scripts/db.sh local or a preview database.'
    );
  if (/\bsupabase\s+(db\s+push|migration\s+up)\b|\bdb\.sh\s+push\b/.test(cmd)) {
    if (!hasFreshBackup(cwd, now, config))
      return deny(
        `Take a backup first with scripts/db.sh backup (writes ${config.backupDir}/<ts>_schema.sql and _data.sql; must be under ${config.backupMaxAgeMinutes} min old).`
      );
    return ask('This pushes migrations to production. Confirm the owner said go in this session.');
  }
  if (/\bsupabase\s+db\s+reset\b/.test(cmd) && /--linked|--db-url/.test(cmd))
    return deny('Never reset the production database.');
  if (
    /\bsupabase\s+(migration\s+squash|config\s+push|storage\s+(rm|cp|mv)|projects\s+delete|backups\s+restore|(postgres-config|network-restrictions|ssl-enforcement|network-bans)\s+(update|remove)|sso\s+(add|update|remove)|(domains|vanity-subdomains)\s+(create|activate|delete|reverify))\b/.test(
      cmd
    )
  )
    return deny('This changes the production project. The owner runs it.');
  if (
    /\bsupabase\s+(functions\s+deploy|secrets\s+(set|unset)|migration\s+repair|functions\s+delete)\b/.test(
      cmd
    )
  )
    return ask('This changes production. Confirm the owner said go in this session.');
  if (/\bsupabase\s+(link|branches\s+(delete|update|disable))\b/.test(cmd))
    return ask('This changes which database the CLI or a branch points at. Confirm the owner said go.');

  if (/\bgit\s+push\b/.test(cmd)) return ask('Push only when the owner says so in this session.');
  if (/\beas\s+(build|update)\b/.test(cmd)) return ask('Confirm this EAS build/update is wanted.');

  if (config.prodMarkers.some((m) => cmd.includes(m)))
    return ask('This command names production. Confirm it only reads.');

  if (/\bgit\s+(checkout\s+-b|switch\s+-c)\b/.test(cmd))
    return note(
      'Mahi works on main only until launch (owner, 2026-10-01 / 2026-10-03). Make a branch only if the owner asked.'
    );
  return null;
}

// ─── Supabase MCP ────────────────────────────────────────────────────────────

function checkMcp(server, tool, input, config) {
  if (!config.prodMcpServers.includes(server)) return null;
  if (!MCP_READ_TOOL.test(tool))
    return deny(
      `${tool} is not a known read tool; the Supabase MCP points at production. Use a migration file and scripts/db.sh.`
    );
  if (tool === 'execute_sql' && SQL_WRITE.test(stripSqlComments(String(input.query || ''))))
    return deny(
      'execute_sql is read-only on production. Schema and data changes go through migration files.'
    );
  return null;
}

// ─── file edits ──────────────────────────────────────────────────────────────

const BUILD_NUMBER = 'The build number moves only by pnpm release:prepare.';
const NUMBER_FIELDS = [
  [/buildNumber:\s*['"]?([^'",\s}]*)/, 'deny', BUILD_NUMBER],
  [/versionCode:\s*([^,\s}]*)/, 'deny', BUILD_NUMBER],
  [
    /runtimeVersion:\s*([^\n]*)/,
    'deny',
    'runtimeVersion follows the app version (policy appVersion); never set it by hand.',
  ],
  [
    /^\s*version:\s*['"]([^'"]*)/m,
    'ask',
    'Changing version cuts every OTA off from installed apps. Owner only: confirm the owner said so.',
  ],
];

/** The file as it would read after this edit, or null when it can't be worked out. */
function contentAfter(tool, input, abs) {
  if (tool === 'Write') return input.content;
  let text;
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
  const edits = tool === 'MultiEdit' ? input.edits || [] : [input];
  for (const e of edits) text = text.replace(e.old_string || '', e.new_string || '');
  return text;
}

function checkAppConfig(tool, input, abs) {
  let before;
  try {
    before = fs.readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
  const after = contentAfter(tool, input, abs);
  if (after == null) return null;
  let found = null;
  for (const [re, kind, reason] of NUMBER_FIELDS) {
    const a = re.exec(before);
    const b = re.exec(after);
    if ((a && a[1]) === (b && b[1])) continue;
    if (kind === 'deny') return deny(reason);
    found = ask(reason);
  }
  return found;
}

const PERSIST_RE = /zustand\/middleware|\bpersist\(|AsyncStorage\.setItem|\bMMKV\b/;

function checkMigration(rel, cwd, config) {
  const name = path.basename(rel);
  const m = MIGRATION_NAME.exec(name);
  if (!m)
    return deny(`Migration files must be named <14-digit timestamp>_<snake_case>.sql (got ${name}).`);
  if (fs.existsSync(path.join(cwd, rel)))
    return ask(
      'Editing an existing migration. Never edit one that has been pushed; add a new migration instead.'
    );
  const versions = fs
    .readdirSync(path.join(cwd, config.migrationsDir))
    .map((n) => MIGRATION_NAME.exec(n))
    .filter(Boolean)
    .map((x) => x[1]);
  const newest = versions.sort().pop();
  if (newest && m[1] <= newest)
    return deny(
      `New migration ${m[1]} must be newer than the latest (${newest}). Use supabase migration new <name>.`
    );
  return null;
}

function checkFileWrite(tool, input, cwd, config) {
  const filePath = input.file_path || '';
  const added =
    tool === 'Write'
      ? input.content
      : tool === 'MultiEdit'
        ? (input.edits || []).map((e) => e.new_string || '').join('\n')
        : input.new_string;
  if (added && FILE_ATTRIBUTION.test(added)) return deny('No AI attribution in code, comments or docs.');
  const abs = path.resolve(cwd, filePath);
  const rel = path.relative(cwd, abs);
  if (path.basename(filePath) === 'eas.json' && added) {
    if (/"autoIncrement"\s*:\s*true/.test(added))
      return deny('No autoIncrement in eas.json. The build number moves only by pnpm release:prepare.');
    if (/"appVersionSource"\s*:\s*"(?!local")/.test(added))
      return deny('eas.json appVersionSource must stay "local" (one build number in ui/app.config.js).');
  }
  if (rel === path.join(config.appDir, 'app.config.js')) return checkAppConfig(tool, input, abs);
  if (path.dirname(rel) === path.normalize(config.migrationsDir)) return checkMigration(rel, cwd, config);
  if (rel.startsWith(path.join(config.appDir, 'src') + path.sep) && added && PERSIST_RE.test(added))
    return note(
      'This keeps data on the device. Data that can expire or be withdrawn (posts, feeds, profiles, likes) must never be stored on the phone: show a loading state, then fresh server data. Ask the owner before building any list or feed.'
    );
  return null;
}

// ─── entry points ────────────────────────────────────────────────────────────

/** PreToolUse decision: { decision: 'deny' | 'ask' | 'note', reason } or null to allow. */
function decide(payload, { cwd = process.cwd(), now = Date.now(), config = defaultConfig } = {}) {
  const tool = payload.tool_name || '';
  const input = payload.tool_input || {};
  if (tool === 'Bash') return checkBash(String(input.command || ''), cwd, now, config);
  const mcp = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(tool);
  if (mcp) return checkMcp(mcp[1], mcp[2], input, config);
  if (tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit')
    return checkFileWrite(tool, input, cwd, config);
  return null;
}

/** The hook's JSON answer for any event, or null to say nothing. */
function run(payload) {
  const event = payload.hook_event_name || 'PreToolUse';
  const cwd = payload.cwd || process.cwd();
  if (event === 'UserPromptSubmit') {
    const notes = promptNotes(payload.prompt);
    return notes.length
      ? { hookSpecificOutput: { hookEventName: event, additionalContext: notes.join('\n') } }
      : null;
  }
  if (event === 'SessionStart') {
    const text = sessionStartNote(liveGit(cwd));
    return text ? { hookSpecificOutput: { hookEventName: event, additionalContext: text } } : null;
  }
  const result = decide(payload, { cwd });
  if (!result) return null;
  if (result.decision === 'note')
    return {
      hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: `[guard] ${result.reason}` },
    };
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: result.decision,
      permissionDecisionReason: `[guard] ${result.reason}`,
    },
  };
}

/** Runs the guard; if it crashes on a tool call, it asks instead of letting the call through. */
function safeRun(payload, impl = run) {
  try {
    return impl(payload);
  } catch (err) {
    if ((payload.hook_event_name || 'PreToolUse') !== 'PreToolUse') return null;
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: `[guard] The guard hook crashed (${err.message}). Confirm this call by hand.`,
      },
    };
  }
}

module.exports = { decide, run, safeRun, promptNotes, sessionStartNote };

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    const out = safeRun(payload);
    if (out) process.stdout.write(JSON.stringify(out));
  });
}
