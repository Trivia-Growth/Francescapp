#!/bin/sh
# Cluster efêmero, sem TCP. Grants de teste não alteram migrations nem autorizam implantação.
set -eu
unset PGHOST PGHOSTADDR PGPORT PGUSER PGDATABASE PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGOPTIONS PGSSLMODE PGSSLROOTCERT PGSSLCERT PGSSLKEY PGREQUIREAUTH PGTARGETSESSIONATTRS
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
temporario=$(rtk proxy mktemp -d /tmp/ffcm-pacientes.XXXXXX)
iniciado=0
parar() {
  resultado=$?
  trap - EXIT HUP INT TERM
  if [ "$iniciado" = 1 ]; then rtk proxy pg_ctl -D "$temporario/data" -m fast -w stop >/dev/null || resultado=1; fi
  printf 'Diretório temporário preservado: %s\n' "$temporario"
  exit "$resultado"
}
trap parar EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
rtk proxy initdb -D "$temporario/data" -U cofre_admin --no-instructions --auth=trust >/dev/null
rtk proxy pg_ctl -D "$temporario/data" -t 30 -o "-k $temporario -p 5432 -c listen_addresses= -c unix_socket_permissions=0700" -l "$temporario/postgres.log" start >/dev/null
iniciado=1
rtk proxy createdb -h "$temporario" -p 5432 -U cofre_admin ffcm_cadeia_local
rtk proxy psql -X -h "$temporario" -p 5432 -U cofre_admin -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/tests/cadeia_migrations_local.sql"
rtk proxy psql -X -h "$temporario" -p 5432 -U cofre_admin -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/tests/cofre_nativo_integracao_local.sql"
FFCM_PACIENTES_SOCKET="$temporario" rtk proxy pnpm exec vitest run netlify/functions/_shared/pacientes-integracao-local.test.ts --reporter=minimal --silent=passed-only
