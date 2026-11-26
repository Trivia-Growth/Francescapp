#!/bin/sh
set -eu
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
temporario=$(mktemp -d "${TMPDIR:-/tmp}/ffcm-criar-caso-atomico.XXXXXXXX")
iniciado=0
limpar() {
  if [ "$iniciado" = 1 ]; then pg_ctl -D "$temporario/data" -m immediate -w stop >/dev/null; fi
  rm -r -- "$temporario"
}
trap limpar EXIT HUP INT TERM
unset PGHOST PGHOSTADDR PGPORT PGUSER PGDATABASE PGSERVICE PGSERVICEFILE PGOPTIONS
initdb -D "$temporario/data" -U cadeia_fixture --no-instructions --auth=trust >/dev/null
pg_ctl -D "$temporario/data" -t 30 -o "-k $temporario -p 5432 -c listen_addresses= -c unix_socket_permissions=0700" -l "$temporario/postgres.log" start >/dev/null
iniciado=1
createdb -h "$temporario" -p 5432 -U cadeia_fixture ffcm_cadeia_local
psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/tests/criar_caso_atomico_local.sql"
