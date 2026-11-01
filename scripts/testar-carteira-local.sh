#!/bin/sh
# Cluster exclusivo descartável. Não conecta ao Supabase nem usa dados reais.
set -eu
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGPASSFILE \
  PGSERVICE PGSERVICEFILE PGOPTIONS PGCONNECT_TIMEOUT PGSSLMODE PGREQUIRESSL \
  PGSSLROOTCERT PGSSLCERT PGSSLKEY PGSSLCRL PGSSLCOMPRESSION PGCHANNELBINDING \
  PGREQUIREAUTH PGTARGETSESSIONATTRS PGAPPNAME PGCLIENTENCODING PGGEQO \
  PGGSSENCMODE PGKRBSRVNAME
PGUSER=$(rtk proxy id -un)
export PGUSER
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
temporario=$(rtk proxy mktemp -d /tmp/ffcm-admissao.XXXXXX)
token=${temporario##*/}
iniciado=0
parar() {
  resultado=$?
  trap - EXIT HUP INT TERM
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
rtk proxy psql -X -h "$temporario" -p 5432 -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -c 'create database ffcm_carteira_fixture;'
rtk proxy psql -X -h "$temporario" -p 5432 -U "$PGUSER" -d ffcm_carteira_fixture -v ON_ERROR_STOP=1 -c 'create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);'
rtk proxy psql -X -h "$temporario" -p 5432 -U "$PGUSER" -d ffcm_carteira_fixture -v ON_ERROR_STOP=1 -c "create function auth.uid() returns uuid language sql stable as \$\$ select null::uuid \$\$; create function auth.jwt() returns jsonb language sql stable as \$\$ select '{}'::jsonb \$\$;"
rtk proxy psql -X -h "$temporario" -p 5432 -U "$PGUSER" -d ffcm_carteira_fixture -v ON_ERROR_STOP=1 -f "$projeto/supabase/migrations/20261017113000_fundacao_identidade_cadastro.sql"
rtk proxy psql -X -h "$temporario" -p 5432 -U "$PGUSER" -d ffcm_carteira_fixture -v ON_ERROR_STOP=1 -f "$projeto/supabase/drafts/20261029110000_sessao_renovacao_fencing.sql"
rtk proxy psql -X -h "$temporario" -p 5432 -U "$PGUSER" -d ffcm_carteira_fixture -v ON_ERROR_STOP=1 -f "$projeto/supabase/tests/fundacao_carteira_leitura_fixture.sql"
rtk proxy psql -X -h "$temporario" -p 5432 -U "$PGUSER" -d ffcm_carteira_fixture -v ON_ERROR_STOP=1 -f "$projeto/supabase/tests/fundacao_carteira_concorrencia_fixture.sql"
rtk proxy psql -X -h "$temporario" -p 5432 -U "$PGUSER" -d ffcm_carteira_fixture -v ON_ERROR_STOP=1 -f "$projeto/supabase/tests/fundacao_vault_atestado_local.sql"
rtk proxy psql -X -h "$temporario" -p 5432 -U "$PGUSER" -d ffcm_carteira_fixture -v ON_ERROR_STOP=1 -f "$projeto/supabase/tests/fundacao_verificador_atestado_local.sql"
if [ "${FFCM_TESTE_EXECUTOR_CADASTRO:-0}" = 1 ]; then
  rtk proxy psql -X -h "$temporario" -p 5432 -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -c 'create database ffcm_reserva_paciente_fixture template ffcm_carteira_fixture;'
fi
if [ "${FFCM_TESTE_EXECUTOR_CARTEIRA:-0}" = 1 ]; then
  rtk proxy psql -X -h "$temporario" -p 5432 -U "$PGUSER" -d ffcm_carteira_fixture -v ON_ERROR_STOP=1 -f "$projeto/supabase/tests/fundacao_carteira_executor_integracao_fixture.sql"
  FFCM_CARTEIRA_SOCKET="$temporario" FFCM_CARTEIRA_ADMIN="$PGUSER" rtk proxy pnpm exec vitest run supabase/functions/_shared/carteira-postgres-integracao.test.ts
fi
if [ "${FFCM_TESTE_EXECUTOR_CADASTRO:-0}" = 1 ]; then
  rtk proxy psql -X -h "$temporario" -p 5432 -U "$PGUSER" -d ffcm_reserva_paciente_fixture -v ON_ERROR_STOP=1 -f "$projeto/supabase/tests/fundacao_paciente_executor_integracao_fixture.sql"
  FFCM_PACIENTE_SOCKET="$temporario" FFCM_PACIENTE_ADMIN="$PGUSER" rtk proxy pnpm exec vitest run packages/cadastro/test/paciente-executor-postgres-integracao.test.ts
fi
