#!/bin/sh
set -eu
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
temporario=$(rtk proxy mktemp -d "${TMPDIR:-/tmp}/ffcm-crise-integrada.XXXXXXXX")
iniciado=0
limpar() {
  if [ "$iniciado" = 1 ]; then rtk proxy pg_ctl -D "$temporario/data" -m immediate -w stop >/dev/null; fi
  rtk proxy rm -r -- "$temporario"
}
trap limpar EXIT HUP INT TERM
unset PGHOST PGHOSTADDR PGPORT PGUSER PGDATABASE PGSERVICE PGSERVICEFILE PGOPTIONS
rtk proxy initdb -D "$temporario/data" -U cadeia_fixture --no-instructions --auth=trust >/dev/null
rtk proxy pg_ctl -D "$temporario/data" -t 30 -o "-k $temporario -p 55454 -c listen_addresses= -c unix_socket_permissions=0700" -l "$temporario/postgres.log" start >/dev/null
iniciado=1
rtk proxy createdb -h "$temporario" -p 55454 -U cadeia_fixture ffcm_cadeia_local
# Fundação + fixtures da anamnese (usuários, concessões e paciente prontos) e as migrations do
# plano de crise. O cenário SQL de plano_crise_operacoes_local.sql não roda aqui: ele deixaria
# plano, marca e aprovação gravados e quebraria a asserção de "plano inexistente" do vitest.
for arquivo in \
  "$projeto/supabase/tests/anamnese_operacoes_local.sql" \
  "$projeto/supabase/migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql" \
  "$projeto/supabase/migrations/20261118100000_habilitacao_plano_crise_concessao.sql" \
  "$projeto/supabase/migrations/20261118110000_plano_crise_versoes_privadas.sql" \
  "$projeto/supabase/migrations/20261118120000_plano_crise_operacoes_privadas.sql" \
  "$projeto/supabase/migrations/20261118130000_grant_plano_crise_teste.sql"; do
  rtk proxy psql -X -h "$temporario" -p 55454 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$arquivo"
done
cd "$projeto"
FFCM_PG_SOCKET="$temporario" rtk proxy pnpm exec vitest run netlify/functions/_shared/plano-crise-postgres-local.test.ts --reporter=minimal --silent=passed-only
