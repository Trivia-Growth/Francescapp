#!/bin/sh
set -eu
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
temporario=$(mktemp -d "${TMPDIR:-/tmp}/ffcm-criar-paciente.XXXXXXXX")
iniciado=0
cleanup() {
 resultado=$?
 if [ "$iniciado" -eq 1 ]; then rtk proxy pg_ctl -D "$temporario/data" -t 15 stop -m fast >/dev/null || resultado=1; fi
 if [ "$resultado" -eq 0 ]; then rtk proxy rm -r "$temporario"; else printf 'Fixture preservada: %s\n' "$temporario" >&2; fi
 exit "$resultado"
}
trap cleanup EXIT HUP INT TERM
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGSERVICE PGSERVICEFILE PGPASSWORD PGOPTIONS
rtk proxy initdb -D "$temporario/data" --no-instructions --auth=trust >/dev/null
rtk proxy pg_ctl -D "$temporario/data" -t 30 -o "-k $temporario -p 5432 -c listen_addresses= -c unix_socket_permissions=0700" -l "$temporario/postgres.log" start >/dev/null
iniciado=1
rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/tests/criar_paciente_privado_local.sql"
