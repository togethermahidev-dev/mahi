#!/usr/bin/env bash
# Production database helper — works without Docker.
#
#   scripts/db.sh backup            schema + data dump into supabase/backups/ (gitignored)
#   scripts/db.sh test [file ...]   run pgTAP tests (default: supabase/tests/*.sql); each rolls back
#   scripts/db.sh push [--dry-run]  push new migrations with the Supabase CLI
#
# The password is read from ~/.pgpass (chmod 600), never from this repo. The line looks like:
#   aws-1-eu-west-2.pooler.supabase.com:5432:postgres:postgres.pzepodsppqtvptzmwxzs:<password>
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=aws-1-eu-west-2.pooler.supabase.com
PORT=5432
DB=postgres
DB_USER=postgres.pzepodsppqtvptzmwxzs
CONN="host=$HOST port=$PORT dbname=$DB user=$DB_USER sslmode=require"

case "${1:-}" in
  backup)
    ts=$(date -u +%Y%m%d%H%M%S)
    mkdir -p supabase/backups
    pg_dump "$CONN" --schema-only --no-owner --no-privileges --schema=public \
      -f "supabase/backups/${ts}_schema.sql"
    pg_dump "$CONN" --data-only --no-owner --no-privileges \
      --schema=public --schema=auth --schema=storage --schema=supabase_migrations \
      -f "supabase/backups/${ts}_data.sql"
    ls -l supabase/backups/"${ts}"_*
    ;;
  test)
    shift
    files=("$@")
    [ ${#files[@]} -eq 0 ] && files=(supabase/tests/*.sql)
    failed=0
    for f in "${files[@]}"; do
      out=$(psql "$CONN" -X -q -A -t -v ON_ERROR_STOP=1 -f "$f" 2>&1) || failed=1
      echo "== $f"
      echo "$out"
      echo "$out" | grep -qE '^not ok|Looks like you failed|ERROR' && failed=1
    done
    exit $failed
    ;;
  push)
    shift
    pw=$(awk -F: -v h="$HOST" -v p="$PORT" -v u="$DB_USER" \
      '$1==h && $2==p && $4==u {print substr($0, index($0,$5)); exit}' ~/.pgpass)
    [ -n "$pw" ] || { echo "No password for $DB_USER in ~/.pgpass" >&2; exit 1; }
    enc=$(PW="$pw" python3 -c 'import os,urllib.parse;print(urllib.parse.quote(os.environ["PW"],safe=""))')
    supabase db push --db-url "postgresql://$DB_USER:$enc@$HOST:$PORT/$DB" "$@"
    ;;
  *)
    sed -n 2,9p "$0"
    exit 1
    ;;
esac
