#!/bin/sh
# Testes com COMMIT, exclusivamente em cluster PostgreSQL novo e isolado.
# Não usa Docker, rede TCP, credenciais, Supabase remoto ou dados reais.
set -eu

# Não deixar initdb, o servidor, psql ou dblink herdarem serviços, hosts,
# identidades ou opções fornecidos pelo ambiente do usuário.
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGPASSFILE \
  PGSERVICE PGSERVICEFILE PGOPTIONS PGCONNECT_TIMEOUT PGSSLMODE PGREQUIRESSL \
  PGSSLROOTCERT PGSSLCERT PGSSLKEY PGSSLCRL PGSSLCOMPRESSION PGCHANNELBINDING \
  PGREQUIREAUTH PGTARGETSESSIONATTRS PGAPPNAME PGCLIENTENCODING PGGEQO \
  PGGSSENCMODE PGKRBSRVNAME
PGUSER=$(rtk proxy id -un)
export PGUSER

diretorio_projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
diretorio_teste=$(rtk proxy mktemp -d /tmp/ffcm-admissao.XXXXXX)
porta_teste=5432
cluster_iniciado=0

parar_cluster() {
  resultado=$?
  trap - EXIT HUP INT TERM
  if [ "$cluster_iniciado" -eq 1 ] && rtk proxy pg_ctl -D "$diretorio_teste/data" status >/dev/null 2>&1; then
    if ! rtk proxy pg_ctl -D "$diretorio_teste/data" -t 15 stop -m fast; then
      printf '%s\n' 'Falha ao parar PostgreSQL temporário; verifique o diretório informado.' >&2
      resultado=1
    fi
  fi
  printf 'Diretório temporário preservado: %s\n' "$diretorio_teste"
  exit "$resultado"
}
trap parar_cluster EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

rtk proxy initdb -D "$diretorio_teste/data" --no-instructions --auth=trust
cluster_iniciado=1
rtk proxy pg_ctl -D "$diretorio_teste/data" -t 30 \
  -o "-k $diretorio_teste -p $porta_teste -c listen_addresses=" \
  -l "$diretorio_teste/postgres.log" start

# Os parâmetros explícitos tornam impossível reutilizar PGHOST/PGDATABASE ou
# um serviço remoto configurado no ambiente. Socket criado com mktemp privado.
PGSSLMODE=disable
PGCONNECT_TIMEOUT=5
PGOPTIONS='-c statement_timeout=30000 -c lock_timeout=10000'
export PGSSLMODE PGCONNECT_TIMEOUT PGOPTIONS
rtk proxy psql -X -h "$diretorio_teste" -p "$porta_teste" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 \
  -c 'create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);'
rtk proxy psql -X -h "$diretorio_teste" -p "$porta_teste" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 \
  -c "create function auth.uid() returns uuid language sql stable as \$\$ select null::uuid \$\$; create function auth.jwt() returns jsonb language sql stable as \$\$ select '{}'::jsonb \$\$;"
rtk proxy psql -X -h "$diretorio_teste" -p "$porta_teste" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 \
  -f "$diretorio_projeto/supabase/migrations/20261017113000_fundacao_identidade_cadastro.sql"
rtk proxy psql -X -h "$diretorio_teste" -p "$porta_teste" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 \
  -f "$diretorio_projeto/supabase/drafts/20261029110000_sessao_renovacao_fencing.sql"
rtk proxy psql -X -h "$diretorio_teste" -p "$porta_teste" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 \
  -f "$diretorio_projeto/supabase/tests/fundacao_cadastro_prova_concorrencia.sql"
