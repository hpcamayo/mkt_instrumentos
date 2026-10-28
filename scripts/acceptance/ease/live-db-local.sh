#!/usr/bin/env bash
# The local stand-in for live-db.sh, with the same contract, to try the live mode against the local stack:
#   LIVE=1 LIVE_ACCOUNTS=1 LIVE_DB=scripts/acceptance/ease/live-db-local.sh node scripts/acceptance/ease/run.cjs ...
set -euo pipefail
psql "${PGURL:-postgresql://postgres@127.0.0.1:54322/postgres}" -q -At -v ON_ERROR_STOP=1 -f - | tail -n 1
