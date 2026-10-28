#!/usr/bin/env bash
# The live part of the EASE acceptance run, from a checkout on Henri's Mac (README.md here):
#   scripts/acceptance/ease/live-run.sh visitor|accounts|both [checks files ...]
# visitor: the cases marked live, signed out and read-only. accounts: the signed-in cases with throwaway accounts
# (live.cjs), which needs LIVE_DB to answer (live-db.sh, a linked Supabase CLI). Results, logs and screenshots go to
# $LIVE_OUT (default ~/code/mkt_instrumentos-golive-logs/ease-live-<UTC time>).
set -euo pipefail
cd "$(dirname "$0")/../../.."
mode=${1:-both}
shift || true
if [ "$#" -gt 0 ]; then checks=("$@"); else checks=(scripts/acceptance/ease/checks-*.cjs); fi
out=${LIVE_OUT:-$HOME/code/mkt_instrumentos-golive-logs/ease-live-$(date -u +%Y%m%d-%H%M)}
mkdir -p "$out/screens"
export BASE=${BASE:-https://laria.audio} OUT="$out/screens" LIVE=1
export NODE_PATH=${NODE_PATH:-/tmp/laria-pw/node_modules}
if [ -z "${CHROMIUM:-}" ]; then export CHANNEL=${CHANNEL:-chrome}; fi
if [ -z "${AXE:-}" ]; then
  AXE=$(ls -d node_modules/.pnpm/axe-core@*/node_modules/axe-core/axe.min.js "$NODE_PATH"/axe-core/axe.min.js 2>/dev/null | tail -n 1 || true)
  export AXE
fi
echo "live run to $out (base $BASE, $(printf '%s ' "${checks[@]}"))"
if [ "$mode" = visitor ] || [ "$mode" = both ]; then
  node scripts/acceptance/ease/run.cjs "${checks[@]}" --results="$out/visitor.jsonl" 2>&1 | tee "$out/visitor.log"
fi
if [ "$mode" = accounts ] || [ "$mode" = both ]; then
  LIVE_ACCOUNTS=1 node scripts/acceptance/ease/run.cjs "${checks[@]}" --results="$out/accounts.jsonl" 2>&1 | tee "$out/accounts.log"
fi
echo "results in $out"
