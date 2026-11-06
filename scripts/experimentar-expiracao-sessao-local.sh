#!/bin/sh
set -eu
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGOPTIONS
raiz=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
diretorio=$(rtk proxy mktemp -d /tmp/ffcm-expiracao.XXXXXXXX)
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
rtk proxy initdb -D "$diretorio/data" -U composicao_fixture -A trust --no-locale >/dev/null
rtk proxy pg_ctl -D "$diretorio/data" -o "-k $diretorio -p 55433 -c listen_addresses=" -l "$diretorio/postgres.log" -w start >/dev/null
iniciado=1
rtk proxy createdb -h "$diretorio" -p 55433 -U composicao_fixture composicao_fixture
rtk proxy psql -X -q -v ON_ERROR_STOP=1 -h "$diretorio" -p 55433 -U composicao_fixture -d composicao_fixture -f "$raiz/supabase/tests/experimento_expiracao_sessao_local.sql"
