#!/bin/sh
# Prova 1.3/1.4 contra o Supavisor do `supabase start` (transaction mode), não contra um
# PostgreSQL descartável. Exige a pilha local de pé; não sobe nem derruba contêiner.
#
#   PROVA_POOLER_PORT  porta publicada do transaction mode (config.toml: [db.pooler].port)
#   PROVA_DB_PORT      porta publicada do banco direto, usada só para criar a fixture
set -eu
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
porta_pooler=${PROVA_POOLER_PORT:-55425}
porta_db=${PROVA_DB_PORT:-55422}
tenant=${PROVA_POOLER_TENANT:-pooler-dev}
senha=${PROVA_PG_SENHA:-postgres}

PGPASSWORD="$senha" psql -X -h 127.0.0.1 -p "$porta_db" -U postgres -d postgres -v ON_ERROR_STOP=1 -q <<'SQL'
drop schema if exists prova_edge cascade;
create schema prova_edge;
create table prova_edge.registro (rotulo text primary key);
insert into prova_edge.registro values ('ficticio');
do $$ begin
 if not exists(select 1 from pg_roles where rolname='ffcm_edge_leitor_executor') then create role ffcm_edge_leitor_executor; end if;
 if not exists(select 1 from pg_roles where rolname='ffcm_edge_sem_grant') then create role ffcm_edge_sem_grant; end if;
end $$;
grant usage on schema prova_edge to ffcm_edge_leitor_executor;
grant select on prova_edge.registro to ffcm_edge_leitor_executor;
grant ffcm_edge_leitor_executor, ffcm_edge_sem_grant to postgres;
SQL

PROVA_PG_HOST=127.0.0.1 \
PROVA_PG_PORT="$porta_pooler" \
PROVA_PG_DB=postgres \
PROVA_PG_USER="postgres.$tenant" \
PROVA_PG_PASSWORD="$senha" \
export PROVA_PG_HOST PROVA_PG_PORT PROVA_PG_DB PROVA_PG_USER PROVA_PG_PASSWORD

echo "--- processo frio (medição de 1.4, isolate Deno contra o pooler) ---"
/usr/bin/time -p deno run --quiet --allow-env --allow-net --allow-read --allow-sys \
  --config "$projeto/supabase/functions/deno.json" \
  "$projeto/scripts/prova-conexao-supavisor-pooler.ts"
echo "--- segundo processo (cache de módulo já quente) ---"
/usr/bin/time -p deno run --quiet --allow-env --allow-net --allow-read --allow-sys \
  --config "$projeto/supabase/functions/deno.json" \
  "$projeto/scripts/prova-conexao-supavisor-pooler.ts"
