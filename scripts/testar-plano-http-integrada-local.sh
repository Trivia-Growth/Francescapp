#!/bin/sh
set -eu
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
temporario=$(rtk proxy mktemp -d "${TMPDIR:-/tmp}/ffcm-plano-integrada.XXXXXXXX")
iniciado=0
limpar() {
  if [ "$iniciado" = 1 ]; then rtk proxy pg_ctl -D "$temporario/data" -m immediate -w stop >/dev/null; fi
  rtk proxy rm -r -- "$temporario"
}
trap limpar EXIT HUP INT TERM
unset PGHOST PGHOSTADDR PGPORT PGUSER PGDATABASE PGSERVICE PGSERVICEFILE PGOPTIONS
rtk proxy initdb -D "$temporario/data" -U cadeia_fixture --no-instructions --auth=trust >/dev/null
rtk proxy pg_ctl -D "$temporario/data" -t 30 -o "-k $temporario -p 5432 -c listen_addresses= -c unix_socket_permissions=0700" -l "$temporario/postgres.log" start >/dev/null
iniciado=1
rtk proxy createdb -h "$temporario" -p 5432 -U cadeia_fixture ffcm_cadeia_local
rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/tests/plano_composicao_local.sql"
rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/migrations/20261108130000_plano_cuidado_paginacao_privada.sql"
rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql"
rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/migrations/20261112122000_plano_auditoria_obrigatoria.sql"
rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/migrations/20261112200000_auditoria_plano_auth_nao_admitido.sql"
rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/migrations/20261111160000_admissao_familiar_privada.sql"
rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/migrations/20261124100000_objetivo_cuidado_visibilidade.sql"
rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/migrations/20261124110000_plano_cuidado_familia_privada.sql"
cd "$projeto"
FFCM_PG_SOCKET="$temporario" rtk proxy pnpm exec vitest run netlify/functions/_shared/plano-http-postgres-local.test.ts --reporter=minimal --silent=passed-only
