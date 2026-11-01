#!/bin/sh
set -eu
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGOPTIONS PGAPPNAME PGSSLMODE
PGUSER=$(rtk proxy id -un); export PGUSER
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
temporario=$(rtk proxy mktemp -d /tmp/ffcm-admissao.XXXXXX)
token=${temporario##*/}
iniciado=0
parar() {
 resultado=$?; trap - EXIT HUP INT TERM
 if [ "$iniciado" -eq 1 ] && rtk proxy pg_ctl -D "$temporario/data" status >/dev/null 2>&1; then
  if ! rtk proxy pg_ctl -D "$temporario/data" -t 15 stop -m fast; then resultado=1; fi
 fi
 printf 'Diretório temporário preservado: %s\n' "$temporario"
 exit "$resultado"
}
trap parar EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
rtk proxy initdb -D "$temporario/data" --no-instructions --auth=trust
iniciado=1
rtk proxy pg_ctl -D "$temporario/data" -t 30 -o "-k $temporario -p 5432 -c listen_addresses= -c unix_socket_permissions=0700 -c ffcm_fixture.token_servidor=$token" -l "$temporario/postgres.log" start
PGSSLMODE=disable PGCONNECT_TIMEOUT=5 PGOPTIONS="-c statement_timeout=30000 -c lock_timeout=10000 -c ffcm_fixture.token_esperado=$token -c ffcm_fixture.socket_esperado=$temporario -c ffcm_fixture.data_esperado=$temporario/data"
export PGSSLMODE PGCONNECT_TIMEOUT PGOPTIONS
if rtk proxy psql -X -h "$temporario" -p 5432 -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -f "$projeto/supabase/tests/admissao_recibo_integracao_fixture.sql"; then
 printf 'Guarda aceitou banco incorreto.\n' >&2; exit 1
fi
rtk proxy psql -X -h "$temporario" -p 5432 -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -c 'create database ffcm_admissao_teste_local;'
if PGOPTIONS="-c ffcm_fixture.token_esperado=incorreto -c ffcm_fixture.socket_esperado=$temporario -c ffcm_fixture.data_esperado=$temporario/data" rtk proxy psql -X -h "$temporario" -p 5432 -U "$PGUSER" -d ffcm_admissao_teste_local -v ON_ERROR_STOP=1 -f "$projeto/supabase/tests/admissao_recibo_integracao_fixture.sql"; then
 printf 'Guarda aceitou token incorreto.\n' >&2; exit 1
fi
rtk proxy psql -X -h "$temporario" -p 5432 -U "$PGUSER" -d ffcm_admissao_teste_local -v ON_ERROR_STOP=1 -f "$projeto/supabase/tests/admissao_recibo_integracao_fixture.sql"
