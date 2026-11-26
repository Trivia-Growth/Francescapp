#!/bin/sh
set -eu
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGOPTIONS
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
temporario=$(mktemp -d /tmp/ffcm-auditoria-caso.XXXXXX)
iniciado=0
parar() {
 resultado=$?
 trap - EXIT HUP INT TERM
 if [ "$iniciado" -eq 1 ]; then pg_ctl -D "$temporario/data" -t 15 stop -m fast >/dev/null || resultado=1; fi
 printf 'Diretório temporário preservado: %s\n' "$temporario"
 exit "$resultado"
}
trap parar EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
initdb -D "$temporario/data" -U cadeia_fixture --no-instructions --auth=trust >/dev/null
pg_ctl -D "$temporario/data" -t 30 -o "-k $temporario -p 5443 -c listen_addresses= -c unix_socket_permissions=0700" -l "$temporario/postgres.log" start >/dev/null
iniciado=1
createdb -h "$temporario" -p 5443 -U cadeia_fixture ffcm_cadeia_local
psql -X -h "$temporario" -p 5443 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/tests/auditoria_caso_regras_familia_local.sql"
