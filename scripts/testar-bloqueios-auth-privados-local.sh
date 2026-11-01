#!/bin/sh
set -eu
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGOPTIONS
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
temporario=$(rtk proxy mktemp -d /tmp/ffcm-bloqueios-privados.XXXXXX)
iniciado=0
parar() {
 resultado=$?
 trap - EXIT HUP INT TERM
 if [ "$iniciado" -eq 1 ]; then rtk proxy pg_ctl -D "$temporario/data" -t 15 stop -m fast >/dev/null || resultado=1; fi
 printf 'Diretório temporário preservado: %s\n' "$temporario"
 exit "$resultado"
}
trap parar EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
rtk proxy initdb -D "$temporario/data" --no-instructions --auth=trust >/dev/null
rtk proxy pg_ctl -D "$temporario/data" -t 30 -o "-k $temporario -p 5432 -c listen_addresses= -c unix_socket_permissions=0700" -l "$temporario/postgres.log" start >/dev/null
iniciado=1
PGHOST="$temporario" PGPORT=5432 rtk proxy psql -X -d postgres -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/tests/bloqueios_auth_privados_local.sql"
PGHOST="$temporario" PGPORT=5432 rtk proxy psql -X -d postgres -v ON_ERROR_STOP=1 -q -c 'create database fk_desabilitada;'
if PGHOST="$temporario" PGPORT=5432 rtk proxy psql -X -d fk_desabilitada -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/tests/bloqueios_auth_fk_desabilitada_local.sql" >"$temporario/fk-desabilitada.log" 2>&1; then
 printf '%s\n' 'Migration aceitou FK com triggers desabilitados' >&2
 exit 1
fi
if ! rtk proxy rg -q 'Auth incompatível: FK imediata e validada com triggers ativos' "$temporario/fk-desabilitada.log"; then
 rtk proxy cat "$temporario/fk-desabilitada.log" >&2
 exit 1
fi
