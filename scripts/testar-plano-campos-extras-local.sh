#!/bin/sh
set -eu
preexistente=${1:-false}
case "$preexistente" in true|false) ;; *) exit 2 ;; esac
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
temporario=$(rtk proxy mktemp -d "${TMPDIR:-/tmp}/ffcm-plano-campos-extras.XXXXXXXX")
iniciado=0
limpar() {
  if [ "$iniciado" = 1 ]; then rtk proxy pg_ctl -D "$temporario/data" -m immediate -w stop >/dev/null; fi
  rtk proxy rm -r -- "$temporario"
}
trap limpar EXIT HUP INT TERM
unset PGHOST PGHOSTADDR PGPORT PGUSER PGDATABASE PGSERVICE PGSERVICEFILE PGOPTIONS
rtk proxy initdb -D "$temporario/data" -U cadeia_fixture --no-instructions --auth=trust >/dev/null
rtk proxy pg_ctl -D "$temporario/data" -t 30 -o "-k $temporario -p 5432 -c listen_addresses= -c unix_socket_permissions=0700 -c shared_preload_libraries=pg_cron -c cron.database_name=ffcm_cadeia_local -c cron.launch_active_jobs=off" -l "$temporario/postgres.log" start >/dev/null
iniciado=1
rtk proxy createdb -h "$temporario" -p 5432 -U cadeia_fixture ffcm_cadeia_local
rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -v plano_preexisting_set="$preexistente" -q -f "$projeto/supabase/tests/plano_campos_extras_local.sql"

