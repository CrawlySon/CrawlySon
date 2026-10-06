#!/usr/bin/env bash
# Záloha a overenie produkčnej Postgres databázy cez Docker (bez lokálnej
# inštalácie pg_dump). Používa sa pred KAŽDOU zmenou schémy.
#
#   scripts/db-backup.sh counts              # počty riadkov v produkcii (rýchla kontrola spojenia)
#   scripts/db-backup.sh dump                # ~/Backups/rypak/<čas>/db.dump (+ db.sql, counts.txt)
#   scripts/db-backup.sh restore-test <dir>  # obnoví dump do lokálneho Postgresu v Dockeri
#                                            # a porovná počty riadkov s produkciou
#   scripts/db-backup.sh restore-stop        # zastaví a zmaže lokálny testovací Postgres
#
# DATABASE_URL sa číta z .env (je v .gitignore) a NIKDY sa nevypisuje. Pre
# Supabase použi reťazec „Session pooler" (port 5432) – priame pripojenie
# db.<ref>.supabase.co je len cez IPv6, ktoré Docker na Macu väčšinou nemá.
#
# Prečo Docker: obraz postgres:17 má pg_dump/pg_restore/psql v správnej verzii
# (dump novším klientom zo staršieho servera je v poriadku, naopak nie).
set -euo pipefail
cd "$(dirname "$0")/.."

PG_IMAGE="${PG_IMAGE:-postgres:17}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/Backups/rypak}"
RESTORE_NAME="${RESTORE_NAME:-rypak-restore}"
RESTORE_PORT="${RESTORE_PORT:-54329}"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
: "${DATABASE_URL:?Chýba DATABASE_URL – daj ho do .env (Supabase → Connect → Session pooler)}"

# Počty riadkov vo všetkých tabuľkách schémy public (jedným dopytom).
COUNTS_SQL="SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::int AS rows FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1;"

# Spustí psql/pg_dump v kontajneri; URL ide cez premennú prostredia, nie cez
# argument, aby sa neobjavilo v zozname procesov.
in_pg() {
  docker run --rm -i -e DATABASE_URL -e PGCONNECT_TIMEOUT=20 "$@"
}

cmd_counts() {
  in_pg "$PG_IMAGE" sh -c 'psql "$DATABASE_URL" -At -F " | " -c "'"$COUNTS_SQL"'"'
}

cmd_dump() {
  local stamp out
  stamp="$(date +%Y%m%d-%H%M)"
  out="$BACKUP_ROOT/$stamp"
  mkdir -p "$out"
  echo "→ počty riadkov v produkcii"
  cmd_counts | tee "$out/counts.txt"
  echo "→ pg_dump (custom formát, len schéma public, bez vlastníkov a práv)"
  in_pg -v "$out:/out" "$PG_IMAGE" sh -c 'pg_dump "$DATABASE_URL" -n public --no-owner --no-privileges -Fc -f /out/db.dump'
  echo "→ pg_dump (čitateľné SQL)"
  in_pg -v "$out:/out" "$PG_IMAGE" sh -c 'pg_dump "$DATABASE_URL" -n public --no-owner --no-privileges -f /out/db.sql'
  echo "→ hotovo: $out"
  ls -la "$out"
}

cmd_restore_test() {
  local dir="${1:?Zadaj priečinok so zálohou, napr. $BACKUP_ROOT/20261006-1200}"
  [ -f "$dir/db.dump" ] || { echo "V $dir nie je db.dump"; exit 1; }
  if ! docker ps -a --format '{{.Names}}' | grep -qx "$RESTORE_NAME"; then
    echo "→ štartujem lokálny Postgres ($RESTORE_NAME na porte $RESTORE_PORT)"
    docker run -d --name "$RESTORE_NAME" -e POSTGRES_PASSWORD=rypak -p "$RESTORE_PORT:5432" "$PG_IMAGE" >/dev/null
  else
    docker start "$RESTORE_NAME" >/dev/null
  fi
  echo "→ čakám, kým bude pripravený"
  for _ in $(seq 1 30); do
    docker exec "$RESTORE_NAME" pg_isready -U postgres -q && break
    sleep 1
  done
  echo "→ čistá databáza rypak_test"
  docker exec "$RESTORE_NAME" psql -U postgres -q -c 'DROP DATABASE IF EXISTS rypak_test;' -c 'CREATE DATABASE rypak_test;'
  echo "→ pg_restore"
  docker exec -i "$RESTORE_NAME" pg_restore -U postgres -d rypak_test --no-owner --no-privileges --exit-on-error < "$dir/db.dump"
  echo "→ porovnanie počtov riadkov (produkcia vs. obnova)"
  docker exec "$RESTORE_NAME" psql -U postgres -d rypak_test -At -F " | " -c "$COUNTS_SQL" > "$dir/counts.restored.txt"
  if diff -u "$dir/counts.txt" "$dir/counts.restored.txt"; then
    echo "✓ počty sedia vo všetkých tabuľkách"
  else
    echo "✗ počty sa líšia – pozri rozdiel vyššie"
    exit 1
  fi
  echo "Lokálna kópia beží: postgresql://postgres:rypak@localhost:$RESTORE_PORT/rypak_test"
  echo "(appku nad ňou spustíš s touto DATABASE_URL; zastavíš cez: scripts/db-backup.sh restore-stop)"
}

cmd_restore_stop() {
  docker rm -f "$RESTORE_NAME" >/dev/null 2>&1 && echo "→ $RESTORE_NAME zastavený a zmazaný" || echo "→ $RESTORE_NAME nebeží"
}

case "${1:-}" in
  counts) cmd_counts ;;
  dump) cmd_dump ;;
  restore-test) cmd_restore_test "${2:-}" ;;
  restore-stop) cmd_restore_stop ;;
  *) sed -n '2,14p' "$0"; exit 1 ;;
esac
