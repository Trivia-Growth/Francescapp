#!/bin/sh
set -eu
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGOPTIONS
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
temporario=$(rtk proxy mktemp -d /tmp/ffcm-migrador-auth.XXXXXX)
iniciado=0
parar() {
 resultado=$?
 trap - EXIT HUP INT TERM
 if [ "$iniciado" -eq 1 ]; then rtk proxy pg_ctl -D "$temporario/data" -t 15 stop -m fast >/dev/null || resultado=1; fi
 case "$temporario" in
  /tmp/ffcm-migrador-auth.*) rtk proxy rm -r -- "$temporario" || resultado=1 ;;
  *) printf 'Diretório temporário inválido: %s\n' "$temporario" >&2; resultado=1 ;;
 esac
 exit "$resultado"
}
trap parar EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
rtk proxy initdb -D "$temporario/data" --no-instructions --auth=trust >/dev/null
rtk proxy pg_ctl -D "$temporario/data" -t 30 -o "-k $temporario -p 5432 -c listen_addresses= -c unix_socket_permissions=0700" -l "$temporario/postgres.log" start >/dev/null
iniciado=1
rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/tests/bloqueios_auth_migrador_local.sql"
