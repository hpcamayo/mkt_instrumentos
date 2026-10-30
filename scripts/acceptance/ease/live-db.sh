#!/usr/bin/env bash
# The live run's database access (live.cjs): runs the SQL on stdin against the linked production project with the
# Supabase CLI and prints the JSON text of the last statement's first column. SUPABASE_WORKDIR: a checkout that is
# linked to the project (supabase link), when this one is not. Try it before a run:
#   echo "select json_build_array(1)::text as result" | scripts/acceptance/ease/live-db.sh      # prints [1]
set -euo pipefail
sql="$(cat)"
workdir=${SUPABASE_WORKDIR:-$(cd "$(dirname "$0")/../../.." && pwd)}
SUPABASE_TELEMETRY_DISABLED=true DO_NOT_TRACK=1 supabase --workdir "$workdir" db query --linked --output json "$sql" | node -e '
let text = "";
process.stdin.on("data", (chunk) => (text += chunk)).on("end", () => {
  let value;
  try { value = JSON.parse(text); } catch { process.stdout.write(text); return; }
  const rows = Array.isArray(value) ? value : (value && (value.rows || value.result || value.data)) || [];
  const last = Array.isArray(rows) ? rows[rows.length - 1] : rows;
  const first = last && typeof last === "object" ? Object.values(last)[0] : last;
  process.stdout.write(typeof first === "string" ? first : JSON.stringify(first ?? null));
});'
