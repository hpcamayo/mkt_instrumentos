#!/bin/bash
# Generates lib/supabase/database.types.ts from this local database (setup-local-db.sh), for a branch whose migrations
# aren't in production yet (docs/database.md). From the repository root, once `setup-local-db.sh reset` has replayed
# the branch's migrations:
#
#   bash scripts/local-db/gen-types.sh > lib/supabase/database.types.ts.tmp && mv lib/supabase/database.types.ts.tmp lib/supabase/database.types.ts
#
# Without Docker, `supabase gen types --local` can't run, so this runs the same generator directly: postgres-meta
# 0.100.0 (formatted with oxfmt) with @supabase/postgrest-typegen 0.2.0. Checked 2026-10-27: on a database built from
# main 74106ae's migrations it reproduces the file `pnpm db:types` wrote byte for byte. The shim has no pg_graphql, so
# a stand-in graphql_public.graphql with production's signature exists only while the generator runs. It installs the
# generator into $LARIA_PGMETA_DIR (default /tmp/laria-pgmeta) the first time, which needs the npm registry.
# Usage: gen-types.sh [port]
set -euo pipefail
PORT="${1:-${LARIA_PGPORT:-54322}}"
URL="postgresql://postgres:postgres@127.0.0.1:$PORT/postgres"
DIR="${LARIA_PGMETA_DIR:-/tmp/laria-pgmeta}"
PKG="$DIR/package"

if [ ! -f "$PKG/dist/server/server.js" ] || [ ! -f "$DIR/typegen-0.2.0/package.json" ]; then
  mkdir -p "$DIR"
  (cd "$DIR" && npm pack @supabase/postgres-meta@0.100.0 >/dev/null 2>&1 && tar xzf supabase-postgres-meta-0.100.0.tgz)
  (cd "$PKG" && npm install --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null 2>&1)
  (cd "$DIR" && npm pack @supabase/postgrest-typegen@0.2.0 >/dev/null 2>&1 && mkdir -p typegen-0.2.0 \
    && tar xzf supabase-postgrest-typegen-0.2.0.tgz -C typegen-0.2.0 --strip-components=1)
fi

psql "$URL" -q -v ON_ERROR_STOP=1 >&2 <<'SQL'
create schema if not exists graphql_public;
create or replace function graphql_public.graphql("operationName" text default null, query text default null,
  variables jsonb default null, extensions jsonb default null)
returns jsonb language sql as $$ select null::jsonb $$;
SQL

TYPEGEN="$PKG/node_modules/@supabase/postgrest-typegen"
rm -rf "$TYPEGEN.bak"
mv "$TYPEGEN" "$TYPEGEN.bak"
cp -r "$DIR/typegen-0.2.0" "$TYPEGEN"
cleanup() {
  rm -rf "$TYPEGEN"
  mv "$TYPEGEN.bak" "$TYPEGEN"
  psql "$URL" -q -c "drop schema graphql_public cascade" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cd "$DIR"
PG_META_DB_URL="$URL" PG_META_GENERATE_TYPES=typescript PG_META_GENERATE_TYPES_INCLUDED_SCHEMAS=public,graphql_public \
  PG_META_GENERATE_TYPES_DETECT_ONE_TO_ONE_RELATIONSHIPS=true PG_META_POSTGREST_VERSION=14.18 \
  timeout 180 node "$PKG/dist/server/server.js" 2>/dev/null
