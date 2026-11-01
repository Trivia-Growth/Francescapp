#!/bin/sh
set -eu
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGOPTIONS
raiz=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
diretorio=$(rtk proxy mktemp -d /tmp/ffcm-wrapper-cadeia.XXXXXXXX)
iniciado=0
encerrar() {
 resultado=$?
 trap - EXIT HUP INT TERM
 if [ "$iniciado" -eq 1 ]; then rtk proxy pg_ctl -D "$diretorio/data" -m fast -w stop >/dev/null || resultado=1; fi
 printf 'Cluster descartável preservado em %s\n' "$diretorio" >&2
 exit "$resultado"
}
trap encerrar EXIT
trap 'exit 1' HUP INT TERM
rtk proxy initdb -D "$diretorio/data" -U cadeia_fixture -A trust --no-locale >/dev/null
rtk proxy pg_ctl -D "$diretorio/data" -o "-k $diretorio -p 55434 -c listen_addresses=" -l "$diretorio/postgres.log" -w start >/dev/null
iniciado=1
rtk proxy createdb -h "$diretorio" -p 55434 -U cadeia_fixture ffcm_cadeia_local
rtk proxy psql -X -q -v ON_ERROR_STOP=1 -h "$diretorio" -p 55434 -U cadeia_fixture -d ffcm_cadeia_local -f "$raiz/supabase/tests/expiracao_wrappers_cadeia_local.sql"
