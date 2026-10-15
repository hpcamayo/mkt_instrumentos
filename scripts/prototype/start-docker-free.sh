#!/usr/bin/env bash
# Docker-free local stack for the Store Operations prototype (Linux x64): local Postgres on 127.0.0.1:54322 with the
# migrations applied (see scripts/prototype/README.md), PostgREST on :3001 and scripts/prototype/local-gateway.cjs on
# :54321 standing in for the Supabase API. Writes .env.local only if it does not exist. Local only.
#
#   bash scripts/prototype/start-docker-free.sh          # start PostgREST + gateway
#   bash scripts/prototype/start-docker-free.sh seed     # also load supabase/seed.sql and the demo seed
set -euo pipefail
cd "$(dirname "$0")/../.."
PGURL="${PGURL:-postgresql://postgres@127.0.0.1:54322/postgres}"
PGRST_DIR="${PGRST_DIR:-/opt/postgrest}"
SECRET="${JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters-long}"
LOG_DIR="${LOG_DIR:-/tmp/laria-prototype}"
mkdir -p "$LOG_DIR"

if [ ! -x "$PGRST_DIR/postgrest" ]; then
  mkdir -p "$PGRST_DIR"
  curl -sSL -o "$PGRST_DIR/pgrst.tar.xz" https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz
  tar -xJf "$PGRST_DIR/pgrst.tar.xz" -C "$PGRST_DIR"
fi
cat > "$LOG_DIR/postgrest.conf" <<EOF
db-uri = "postgres://authenticator@127.0.0.1:54322/postgres"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-host = "127.0.0.1"
server-port = 3001
EOF

if [ "${1:-}" = "seed" ]; then
  psql "$PGURL" -v ON_ERROR_STOP=1 -q -o /dev/null -f supabase/seed.sql
  psql "$PGURL" -v ON_ERROR_STOP=1 -q -o /dev/null -f scripts/prototype/demo-seed.sql
fi

pkill -f "postgrest $LOG_DIR/postgrest.conf" 2>/dev/null || true
pkill -f "scripts/prototype/local-gateway.cjs" 2>/dev/null || true
nohup "$PGRST_DIR/postgrest" "$LOG_DIR/postgrest.conf" > "$LOG_DIR/postgrest.log" 2>&1 &
JWT_SECRET="$SECRET" PGURL="$PGURL" STORAGE_DIR="$LOG_DIR/storage" nohup node scripts/prototype/local-gateway.cjs > "$LOG_DIR/gateway.log" 2>&1 &

if [ ! -f .env.local ]; then
  eval "$(JWT_SECRET="$SECRET" node scripts/prototype/local-gateway.cjs keys | sed 's/^/KEY_/')"
  cat > .env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=$KEY_anon
SUPABASE_SERVICE_ROLE_KEY=$KEY_service_role
NEXT_PUBLIC_SITE_URL=http://localhost:3000
MARKETPLACE_EMAIL_PROVIDER=log
CRON_SECRET=local-cron-secret
LARIA_ASSISTED_COMMERCE=1
EOF
fi
sleep 2
curl -sf -o /dev/null "http://127.0.0.1:54321/rest/v1/stores?limit=1" -H "apikey: local" && echo "Gateway ready on http://127.0.0.1:54321. Now run: pnpm dev"
