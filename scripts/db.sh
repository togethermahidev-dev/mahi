#!/usr/bin/env bash
# Production database helper — works without Docker.
#
#   scripts/db.sh backup            schema + data dump into supabase/backups/ (gitignored)
#   scripts/db.sh test [file ...]   run pgTAP tests (default: supabase/tests/*.sql); each rolls back
#   scripts/db.sh local [tests...]  replay all migrations on a local Postgres 17 and run tests
#   scripts/db.sh try <files...>    run migrations + tests in one transaction, then roll it all back
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
  local)
    # Replay every migration on a throwaway local Postgres 17 (with Supabase stand-ins from
    # supabase/tests/local/stubs.sql), then run the pgTAP tests. Never touches Supabase.
    shift
    PGBIN=/opt/homebrew/opt/postgresql@17/bin
    DATA="${TMPDIR:-/tmp}/mahi-local-pg"
    LPORT=54329
    [ -x "$PGBIN/postgres" ] || { echo "Needs: brew install postgresql@17 (and pgTAP)" >&2; exit 1; }
    [ -d "$DATA" ] || "$PGBIN/initdb" -D "$DATA" -A trust -U postgres >/dev/null
    "$PGBIN/pg_ctl" -D "$DATA" -o "-p $LPORT -k $DATA" -l "$DATA/log" -w start >/dev/null
    trap '"$PGBIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null' EXIT
    L="$PGBIN/psql -X -q -h $DATA -p $LPORT -U postgres -v ON_ERROR_STOP=1"
    $L -d postgres -c 'drop database if exists mahi_test' -c 'create database mahi_test' >/dev/null
    $L -d mahi_test -c 'alter database mahi_test set search_path = "$user", public, extensions' >/dev/null
    $L -d mahi_test -f supabase/tests/local/stubs.sql >/dev/null
    for f in supabase/migrations/*.sql; do
      grep -viE '^\s*create extension if not exists (pg_cron|pg_net)' "$f" \
        | $L -d mahi_test >/dev/null 2>"$DATA/err" || { echo "FAILED: $f"; cat "$DATA/err"; exit 1; }
    done
    echo "migrations: $(ls supabase/migrations/*.sql | wc -l | tr -d ' ') applied"
    files=("$@")
    [ ${#files[@]} -eq 0 ] && files=(supabase/tests/*.sql)
    failed=0
    for f in "${files[@]}"; do
      out=$($L -d mahi_test -A -t -f "$f" 2>&1) || failed=1
      echo "== $f"
      echo "$out"
      echo "$out" | grep -qE '^not ok|Looks like you failed|ERROR' && failed=1
    done
    exit $failed
    ;;
  try)
    # Dry run on production: migrations + tests in ONE transaction that is always rolled back.
    shift
    [ $# -gt 0 ] || { echo "usage: scripts/db.sh try <migration.sql ...> <test.sql ...>" >&2; exit 1; }
    out=$(
      {
        echo 'begin;'
        for f in "$@"; do grep -viE '^\s*(begin|rollback|commit)\s*;\s*$' "$f"; echo; done
        echo 'rollback;'
      } | psql "$CONN" -X -q -A -t -v ON_ERROR_STOP=1 2>&1
    ) || { echo "$out"; exit 1; }
    echo "$out"
    echo "$out" | grep -qE '^not ok|Looks like you failed|ERROR' && exit 1
    exit 0
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
    sed -n 2,11p "$0"
    exit 1
    ;;
esac
