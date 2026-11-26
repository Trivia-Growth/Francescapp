#!/bin/sh
# Levanta um PostgreSQL descartável e roda a prova de conexão do isolate (tarefas 1.3 e 1.4).
# Mesmo padrão dos demais `testar-*-local.sh`: initdb + pg_ctl em diretório temporário.
set -eu
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
temporario=$(mktemp -d "${TMPDIR:-/tmp}/ffcm-conexao-supavisor.XXXXXXXX")
iniciado=0
limpar() {
  if [ "$iniciado" = 1 ]; then pg_ctl -D "$temporario/data" -m immediate -w stop >/dev/null; fi
  rm -r -- "$temporario"
}
trap limpar EXIT HUP INT TERM
unset PGHOST PGHOSTADDR PGPORT PGUSER PGDATABASE PGSERVICE PGSERVICEFILE PGOPTIONS
porta=${PROVA_PG_PORT:-55449}
initdb -D "$temporario/data" -U edge_fixture --no-instructions --auth=trust >/dev/null
pg_ctl -D "$temporario/data" -t 30 \
  -o "-p $porta -c listen_addresses=127.0.0.1" \
  -l "$temporario/postgres.log" start >/dev/null
iniciado=1
createdb -h 127.0.0.1 -p "$porta" -U edge_fixture ffcm_edge_local
psql -X -h 127.0.0.1 -p "$porta" -U edge_fixture -d ffcm_edge_local -v ON_ERROR_STOP=1 -q <<'SQL'
create schema prova_edge;
create table prova_edge.registro (rotulo text primary key);
insert into prova_edge.registro values ('ficticio');
create role ffcm_edge_leitor_executor;
create role ffcm_edge_sem_grant;
grant usage on schema prova_edge to ffcm_edge_leitor_executor;
grant select on prova_edge.registro to ffcm_edge_leitor_executor;
grant ffcm_edge_leitor_executor, ffcm_edge_sem_grant to edge_fixture;
SQL

export PROVA_PG_HOST=127.0.0.1
export PROVA_PG_PORT="$porta"
export PROVA_PG_DB=ffcm_edge_local
export PROVA_PG_USER=edge_fixture
export PROVA_PG_PASSWORD=sem-senha-no-trust

echo "--- processo frio (medição de partida a frio, tarefa 1.4) ---"
/usr/bin/time -p deno run --quiet --allow-env --allow-net --allow-read --allow-sys \
  --config "$projeto/supabase/functions/deno.json" \
  "$projeto/scripts/prova-conexao-supavisor-local.ts"
echo "--- segundo processo (cache de módulo já quente) ---"
/usr/bin/time -p deno run --quiet --allow-env --allow-net --allow-read --allow-sys \
  --config "$projeto/supabase/functions/deno.json" \
  "$projeto/scripts/prova-conexao-supavisor-local.ts"
