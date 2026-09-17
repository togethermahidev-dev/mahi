#!/usr/bin/env node
// PreToolUse guard: enforces the project's hard rules instead of relying on memory.
// Reads the hook payload on stdin, prints a deny/ask decision, or nothing to allow.
const fs = require('fs');
const path = require('path');
const config = require('./guard.config.cjs');

const SQL_WRITE =
  /\b(insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|comment\s+on|vacuum|reindex|cluster|refresh|call|do|copy|lock|reassign|import|security\s+label)\b/i;
const MIGRATION_NAME = /^(\d{14})_[a-z0-9_]+\.sql$/;
const AI_ATTRIBUTION = /co-authored-by|generated with|🤖/i;
const MCP_WRITE_TOOLS = new Set([
  'apply_migration',
  'deploy_edge_function',
  'merge_branch',
  'reset_branch',
  'rebase_branch',
  'delete_branch',
  'create_branch',
]);

const deny = (reason) => ({ decision: 'deny', reason });
const ask = (reason) => ({ decision: 'ask', reason });

function stripSqlComments(sql) {
  return sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function hasFreshBackup(cwd, now) {
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

function checkBash(cmd, cwd, now) {
  if (/\bgit\s+add\s+(-A\b|--all\b|-u\b|--update\b|\.(\s|$))/.test(cmd))
    return deny('Stage files by name. Never git add -A / . / -u.');
  if (/\bgit\s+commit\b[^|;&]*\s-(?!-)[a-zA-Z]*a/.test(cmd))
    return deny('Never git commit -a. Stage files by name.');
  if (/\b(git\s+(commit|tag)|gh\s+(pr|release))\b/.test(cmd) && AI_ATTRIBUTION.test(cmd))
    return deny('No AI attribution in commits, tags, PRs or releases.');

  if (/\beas\s+submit\b/.test(cmd)) return deny('Store submission is owner-only.');
  if (/\beas\b/.test(cmd) && config.prodMarkers.some((m) => m.startsWith('--') && cmd.includes(m)))
    return deny('Production EAS builds and updates are owner-only.');

  if (/\bsupabase\s+(db\s+push|migration\s+up)\b/.test(cmd)) {
    if (!hasFreshBackup(cwd, now))
      return deny(
        `Take a backup first: supabase db dump --linked -f ${config.backupDir}/<ts>_schema.sql and --data-only -f ${config.backupDir}/<ts>_data.sql (must be under ${config.backupMaxAgeMinutes} min old).`
      );
    return ask('This pushes migrations to production. Confirm the owner said go in this session.');
  }
  if (/\bsupabase\s+db\s+reset\b/.test(cmd) && /--linked|--db-url/.test(cmd))
    return deny('Never reset the production database.');
  if (/\bsupabase\s+(functions\s+deploy|secrets\s+(set|unset)|migration\s+repair|functions\s+delete)\b/.test(cmd))
    return ask('This changes production. Confirm the owner said go in this session.');

  if (/\bgit\s+push\b/.test(cmd)) return ask('Push only when the owner says so in this session.');
  if (/\beas\s+(build|update)\b/.test(cmd)) return ask('Confirm this EAS build/update is wanted.');

  if (config.prodMarkers.some((m) => cmd.includes(m)))
    return ask('This command names production. Confirm it only reads.');
  return null;
}

function checkMcp(server, tool, input) {
  if (!config.prodMcpServers.includes(server)) return null;
  if (MCP_WRITE_TOOLS.has(tool))
    return deny(`${tool} writes to production. Use a migration file and supabase db push.`);
  if (tool === 'execute_sql' && SQL_WRITE.test(stripSqlComments(String(input.query || ''))))
    return deny('execute_sql is read-only on production. Schema and data changes go through migration files.');
  return null;
}

function checkFileWrite(filePath, content, cwd) {
  if (content && /co-authored-by:|generated with claude|🤖 generated/i.test(content))
    return deny('No AI attribution in code, comments or docs.');
  const rel = path.relative(cwd, path.resolve(cwd, filePath));
  if (path.dirname(rel) !== path.normalize(config.migrationsDir)) return null;
  const name = path.basename(rel);
  const m = MIGRATION_NAME.exec(name);
  if (!m) return deny(`Migration files must be named <14-digit timestamp>_<snake_case>.sql (got ${name}).`);
  if (fs.existsSync(path.join(cwd, rel)))
    return ask('Editing an existing migration. Never edit one that has been pushed; add a new migration instead.');
  const versions = fs
    .readdirSync(path.join(cwd, config.migrationsDir))
    .map((n) => MIGRATION_NAME.exec(n))
    .filter(Boolean)
    .map((x) => x[1]);
  const newest = versions.sort().pop();
  if (newest && m[1] <= newest)
    return deny(`New migration ${m[1]} must be newer than the latest (${newest}). Use supabase migration new <name>.`);
  return null;
}

function decide(payload, { cwd = process.cwd(), now = Date.now() } = {}) {
  const tool = payload.tool_name || '';
  const input = payload.tool_input || {};
  if (tool === 'Bash') return checkBash(String(input.command || ''), cwd, now);
  const mcp = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(tool);
  if (mcp) return checkMcp(mcp[1], mcp[2], input);
  if (tool === 'Write') return checkFileWrite(input.file_path || '', input.content, cwd);
  if (tool === 'Edit') return checkFileWrite(input.file_path || '', input.new_string, cwd);
  return null;
}

module.exports = { decide };

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
    const result = decide(payload, { cwd: payload.cwd || process.cwd() });
    if (!result) return;
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: result.decision,
          permissionDecisionReason: `[guard] ${result.reason}`,
        },
      })
    );
  });
}
