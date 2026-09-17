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
};
