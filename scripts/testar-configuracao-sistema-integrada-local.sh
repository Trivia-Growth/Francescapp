#!/bin/sh
set -eu
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
temporario=$(rtk proxy mktemp -d "${TMPDIR:-/tmp}/ffcm-configuracao-integrada.XXXXXXXX")
iniciado=0
limpar() {
  if [ "$iniciado" = 1 ]; then rtk proxy pg_ctl -D "$temporario/data" -m immediate -w stop >/dev/null; fi
  rtk proxy rm -r -- "$temporario"
}
trap limpar EXIT HUP INT TERM
unset PGHOST PGHOSTADDR PGPORT PGUSER PGDATABASE PGSERVICE PGSERVICEFILE PGOPTIONS
rtk proxy initdb -D "$temporario/data" -U configuracao_fixture --no-instructions --auth=trust >/dev/null
rtk proxy pg_ctl -D "$temporario/data" -t 30 -o "-k $temporario -p 55448 -c listen_addresses= -c unix_socket_permissions=0700" -l "$temporario/postgres.log" start >/dev/null
iniciado=1
rtk proxy createdb -h "$temporario" -p 55448 -U configuracao_fixture ffcm_cadeia_local
# Só fundação + fixtures de anamnese (administrador e profissional prontos) e as migrations de
# configuração — sem rodar configuracao_sistema_local.sql, que já altera valores e quebraria as
# asserções de estado inicial do teste vitest.
for arquivo in \
  "$projeto/supabase/tests/anamnese_operacoes_local.sql" \
  "$projeto/supabase/migrations/20261117400000_configuracao_sistema.sql" \
  "$projeto/supabase/migrations/20261117410000_configuracao_sistema_operacoes_privadas.sql" \
  "$projeto/supabase/migrations/20261117420000_configuracao_sistema_leitor_servidor.sql" \
  "$projeto/supabase/migrations/20261117430000_grant_configuracao_sistema_teste.sql"; do
  rtk proxy psql -X -h "$temporario" -p 55448 -U configuracao_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$arquivo"
done
cd "$projeto"
FFCM_PG_SOCKET="$temporario" rtk proxy pnpm exec vitest run netlify/functions/_shared/configuracao-sistema-postgres-local.test.ts --reporter=minimal --silent=passed-only
