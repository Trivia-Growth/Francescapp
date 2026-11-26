#!/bin/sh
# Prova de domínio contra o Supabase local levantado por `supabase start` (tarefas 0.2 e 2.3).
# Aplica a fixture fictícia pelo banco direto e roda a prova sob Deno, atravessando o
# Supavisor em transaction mode quando ele estiver de pé (PROVA_PG_PORT).
#
#   PROVA_DB_PORT      porta publicada do banco direto (config.toml: [db].port)
#   PROVA_PG_PORT      porta usada pela prova: pooler ([db.pooler].port) ou o banco direto
set -eu
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
porta_db=${PROVA_DB_PORT:-55422}
porta_prova=${PROVA_PG_PORT:-55422}
tenant=${PROVA_POOLER_TENANT:-pooler-dev}
senha=${PROVA_PG_SENHA:-postgres}

if [ "$porta_prova" = "$porta_db" ]; then usuario=postgres; else usuario="postgres.$tenant"; fi

PGPASSWORD="$senha" psql -X -h 127.0.0.1 -p "$porta_db" -U postgres -d postgres -v ON_ERROR_STOP=1 -q \
  -f "$projeto/scripts/fixture-regras-atendimento-supabase-local.sql" >/dev/null

PROVA_PG_HOST=127.0.0.1 PROVA_PG_PORT="$porta_prova" PROVA_PG_DB=postgres \
PROVA_PG_USER="$usuario" PROVA_PG_PASSWORD="$senha" \
  deno run --quiet --allow-env --allow-net --allow-read --allow-sys \
  --config "$projeto/supabase/functions/deno.json" \
  "$projeto/scripts/prova-regras-atendimento-supabase-local.ts"
