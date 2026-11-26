#!/bin/sh
set -eu
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
temporario=$(rtk proxy mktemp -d "${TMPDIR:-/tmp}/ffcm-aprovador-integrada.XXXXXXXX")
iniciado=0
limpar() {
  if [ "$iniciado" = 1 ]; then rtk proxy pg_ctl -D "$temporario/data" -m immediate -w stop >/dev/null; fi
  rtk proxy rm -r -- "$temporario"
}
trap limpar EXIT HUP INT TERM
unset PGHOST PGHOSTADDR PGPORT PGUSER PGDATABASE PGSERVICE PGSERVICEFILE PGOPTIONS
rtk proxy initdb -D "$temporario/data" -U cadeia_fixture --no-instructions --auth=trust >/dev/null
rtk proxy pg_ctl -D "$temporario/data" -t 30 -o "-k $temporario -p 55439 -c listen_addresses= -c unix_socket_permissions=0700" -l "$temporario/postgres.log" start >/dev/null
iniciado=1
rtk proxy createdb -h "$temporario" -p 55439 -U cadeia_fixture ffcm_cadeia_local
# Fundação + fixtures de anamnese (usuários/concessões administrador+profissional já
# prontos), tabelas do objetivo de cuidado (dependência de 20261116150000) e as migrations
# da lista de aprovadores — sem rodar o cenário de teste SQL, que deixaria linhas criadas e
# quebraria a asserção de "listagem vazia" do teste vitest.
rtk proxy psql -X -h "$temporario" -p 55439 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/tests/anamnese_operacoes_local.sql"
rtk proxy psql -X -h "$temporario" -p 55439 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/migrations/20261107120000_plano_cuidado_versoes_privadas.sql"
rtk proxy psql -X -h "$temporario" -p 55439 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/migrations/20261116150000_aprovador_plano_catalogo.sql"
rtk proxy psql -X -h "$temporario" -p 55439 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/migrations/20261116160000_aprovador_plano_operacoes_privadas.sql"
rtk proxy psql -X -h "$temporario" -p 55439 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/migrations/20261116170000_aprovar_objetivo_plano_privado.sql"
rtk proxy psql -X -h "$temporario" -p 55439 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/migrations/20261116190000_grant_aprovador_plano_teste.sql"
cd "$projeto"
FFCM_PG_SOCKET="$temporario" rtk proxy pnpm exec vitest run netlify/functions/_shared/aprovador-plano-postgres-local.test.ts --reporter=minimal --silent=passed-only
