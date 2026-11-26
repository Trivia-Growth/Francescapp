#!/bin/sh
set -eu
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
temporario=$(rtk proxy mktemp -d "${TMPDIR:-/tmp}/ffcm-enc-integrada.XXXXXXXX")
iniciado=0
limpar() {
  if [ "$iniciado" = 1 ]; then rtk proxy pg_ctl -D "$temporario/data" -m immediate -w stop >/dev/null; fi
  rtk proxy rm -r -- "$temporario"
}
trap limpar EXIT HUP INT TERM
unset PGHOST PGHOSTADDR PGPORT PGUSER PGDATABASE PGSERVICE PGSERVICEFILE PGOPTIONS
rtk proxy initdb -D "$temporario/data" -U cadeia_fixture --no-instructions --auth=trust >/dev/null
rtk proxy pg_ctl -D "$temporario/data" -t 30 -o "-k $temporario -p 55441 -c listen_addresses= -c unix_socket_permissions=0700" -l "$temporario/postgres.log" start >/dev/null
iniciado=1
rtk proxy createdb -h "$temporario" -p 55441 -U cadeia_fixture ffcm_cadeia_local
# Fundação + fixtures da anamnese (usuários, concessões e paciente já prontos) e as migrations
# de encaminhamento. O cenário SQL de encaminhamento_operacoes_local.sql não roda aqui: ele
# deixaria registros gravados e quebraria a asserção de "lista inicial vazia" do vitest.
rtk proxy psql -X -h "$temporario" -p 55441 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/tests/anamnese_operacoes_local.sql"
rtk proxy psql -X -h "$temporario" -p 55441 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/migrations/20261117100000_encaminhamento_versoes_privadas.sql"
rtk proxy psql -X -h "$temporario" -p 55441 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/migrations/20261117110000_encaminhamento_operacoes_privadas.sql"
rtk proxy psql -X -h "$temporario" -p 55441 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/migrations/20261117120000_grant_encaminhamento_teste.sql"
cd "$projeto"
FFCM_PG_SOCKET="$temporario" rtk proxy pnpm exec vitest run netlify/functions/_shared/encaminhamento-postgres-local.test.ts --reporter=minimal --silent=passed-only
