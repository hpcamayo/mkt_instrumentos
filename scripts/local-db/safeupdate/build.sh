#!/usr/bin/env bash
# Builds laria_safeupdate.c (a local stand-in for Supabase's pg_safeupdate) into the local Postgres 16 library folder.
# Installs postgresql-server-dev-16 first if its headers are missing. Run as root in the cloud container.
# Afterwards a session can run LOAD 'laria_safeupdate'; to see what an API call would be refused.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ "$(id -u)" = 0 ] || { echo "Run as root (the cloud container default)." >&2; exit 1; }
if [ ! -f /usr/include/postgresql/16/server/postgres.h ]; then
  echo "Installing postgresql-server-dev-16"
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends postgresql-server-dev-16 >/dev/null
fi
OUT="$(mktemp -d)"
gcc $(pg_config --cflags) $(pg_config --cflags_sl) -I"$(pg_config --includedir-server)" -shared \
  -o "$OUT/laria_safeupdate.so" "$HERE/laria_safeupdate.c"
install -m 755 "$OUT/laria_safeupdate.so" "$(pg_config --pkglibdir)/laria_safeupdate.so"
rm -rf "$OUT"
echo "Installed $(pg_config --pkglibdir)/laria_safeupdate.so"
