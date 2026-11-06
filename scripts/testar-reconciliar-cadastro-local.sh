#!/bin/sh
set -eu
raiz=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
diretorio=$(mktemp -d /tmp/ffcm-reconciliar.XXXXXXXX)
iniciado=0
encerrar() {
 if [ "$iniciado" -eq 1 ]; then pg_ctl -D "$diretorio/data" -m fast -w stop >/dev/null; fi
 printf 'Cluster descartável preservado em %s\n' "$diretorio" >&2
}
trap encerrar EXIT
trap 'exit 1' HUP INT TERM
initdb -D "$diretorio/data" -U reconciliar_fixture -A trust --no-locale >/dev/null
pg_ctl -D "$diretorio/data" -o "-k $diretorio -p 55433 -c listen_addresses=" -l "$diretorio/postgres.log" -w start >/dev/null
iniciado=1
createdb -h "$diretorio" -p 55433 -U reconciliar_fixture reconciliar_fixture
psql -X -q -v ON_ERROR_STOP=1 -h "$diretorio" -p 55433 -U reconciliar_fixture -d reconciliar_fixture -f "$raiz/supabase/tests/reconciliar_cadastro_privado_local.sql"
