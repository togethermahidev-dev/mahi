// Project guard settings. The rules live in guard.cjs; this file only says what they apply to.
module.exports = {
  // Anything that names or targets these is production.
  prodMarkers: ['pzepodsppqtvptzmwxzs', '--profile production', '--channel production'],
  // MCP servers that point at production.
  prodMcpServers: ['supabase'],
  // Production schema changes go through `supabase db push` only, and only after a backup
  // this recent exists in backupDir (decision #13 in docs/decisions.md).
  backupDir: 'supabase/backups',
  backupMaxAgeMinutes: 60,
  migrationsDir: 'supabase/migrations',
  // A new migration's name says what changes in the database, never who asked or a batch (owner, 2026-10-09).
  migrationNameBanned: ['maximus', 'verity', 'joe', 'founder', 'owner', 'answers', 'round'],
  // The Expo app (app.config.js, eas.json, src/) lives here, like pingmee-v2's ui/.
  appDir: 'ui',
  // Pre-launch only (owner, 2026-10-03): working against production (scripts/db.sh try) and the
  // preview lane pointing at production are allowed for now. The moment the owner says
  // "change it", set this to false — and never back to true.
  prodTestingAllowed: true,
};
