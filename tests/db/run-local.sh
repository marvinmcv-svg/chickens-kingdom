#!/bin/bash
# Spins up a throwaway local Postgres 16, applies tests/db/supabase-stub.sql + supabase/migrations + seed, runs checks.sh.
# Needs: postgresql 16 (apt-get install postgresql) and root (runs the server as the postgres user).
set -e
cd "$(dirname "$0")/../.."
export CKPG_DIR=${CKPG_DIR:-/tmp/ckpg}
BIN=/usr/lib/postgresql/16/bin
if [ ! -d "$CKPG_DIR/data" ]; then
  mkdir -p "$CKPG_DIR" && chown postgres "$CKPG_DIR"
  su postgres -c "$BIN/initdb -D $CKPG_DIR/data -A trust -U postgres >/dev/null"
fi
su postgres -c "$BIN/pg_ctl -D $CKPG_DIR/data -o '-p 5499 -k $CKPG_DIR' -l $CKPG_DIR/log status >/dev/null || $BIN/pg_ctl -D $CKPG_DIR/data -o '-p 5499 -k $CKPG_DIR' -l $CKPG_DIR/log start >/dev/null"
sleep 1
PSQL="psql -h $CKPG_DIR -p 5499 -U postgres -q"
$PSQL -c "drop database if exists ck" -c "create database ck"
node scripts/seed-sql.js > supabase/seed.sql
for f in tests/db/supabase-stub.sql supabase/migrations/*.sql supabase/seed.sql; do $PSQL -d ck -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep -v "already exists" || true; done
bash tests/db/checks.sh | tee /dev/stderr | grep -q FAIL && exit 1 || echo "All database checks passed."
