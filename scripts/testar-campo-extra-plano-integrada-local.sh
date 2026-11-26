#!/bin/sh
set -eu
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
temporario=$(rtk proxy mktemp -d "${TMPDIR:-/tmp}/ffcm-campo-extra-integrada.XXXXXXXX")
iniciado=0
limpar() {
  if [ "$iniciado" = 1 ]; then rtk proxy pg_ctl -D "$temporario/data" -m immediate -w stop >/dev/null; fi
  rtk proxy rm -r -- "$temporario"
}
trap limpar EXIT HUP INT TERM
unset PGHOST PGHOSTADDR PGPORT PGUSER PGDATABASE PGSERVICE PGSERVICEFILE PGOPTIONS
rtk proxy initdb -D "$temporario/data" -U cadeia_fixture --no-instructions --auth=trust >/dev/null
rtk proxy pg_ctl -D "$temporario/data" -t 30 -o "-k $temporario -p 55438 -c listen_addresses= -c unix_socket_permissions=0700" -l "$temporario/postgres.log" start >/dev/null
iniciado=1
rtk proxy createdb -h "$temporario" -p 55438 -U cadeia_fixture ffcm_cadeia_local
# Só fundação + fixtures de anamnese (usuários/concessões administrador+profissional já
# prontos) e as migrations do catálogo de campos extras — sem rodar o cenário de teste SQL
# de campo_extra_plano_local.sql, que deixaria linhas criadas e quebraria a asserção de
# "listagem vazia" do teste vitest.
rtk proxy psql -X -h "$temporario" -p 55438 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/tests/anamnese_operacoes_local.sql"
rtk proxy psql -X -h "$temporario" -p 55438 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/migrations/20261116130000_campo_extra_plano_catalogo.sql"
rtk proxy psql -X -h "$temporario" -p 55438 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/migrations/20261116140000_campo_extra_plano_operacoes_privadas.sql"
rtk proxy psql -X -h "$temporario" -p 55438 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/migrations/20261116180000_grant_campo_extra_plano_teste.sql"
cd "$projeto"
FFCM_PG_SOCKET="$temporario" rtk proxy pnpm exec vitest run netlify/functions/_shared/campo-extra-plano-postgres-local.test.ts --reporter=minimal --silent=passed-only
