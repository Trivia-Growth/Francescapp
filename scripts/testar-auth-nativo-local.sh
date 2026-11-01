#!/bin/sh
# PostgreSQL nativo descartável, sem Docker, sem TCP e sem tocar serviços existentes.
set -eu
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGOPTIONS
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
temporario=$(rtk proxy mktemp -d /tmp/ffcm-auth-nativo.XXXXXX)
iniciado=0
parar() {
  resultado=$?; trap - EXIT HUP INT TERM
  if [ "$iniciado" -eq 1 ] && rtk proxy pg_ctl -D "$temporario/data" status >/dev/null 2>&1; then
    rtk proxy pg_ctl -D "$temporario/data" -t 15 stop -m fast >/dev/null || resultado=1
  fi
  printf 'Fixture local encerrada; arquivos preservados em %s\n' "$temporario"
  exit "$resultado"
}
trap parar EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
rtk proxy initdb -D "$temporario/data" --no-instructions --auth=trust >"$temporario/initdb.log"
iniciado=1
rtk proxy pg_ctl -D "$temporario/data" -t 30 -o "-k $temporario -c listen_addresses= -c unix_socket_permissions=0700" -l "$temporario/postgres.log" start >"$temporario/start.log"
rtk proxy createdb -h "$temporario" ffcm_auth_nativo_teste_local
if ! rtk proxy psql -X -q -h "$temporario" -d ffcm_auth_nativo_teste_local -v ON_ERROR_STOP=1 -f "$projeto/supabase/tests/auth_nativo_sessao_local.sql" >"$temporario/teste.log" 2>&1; then
  rtk proxy tail -35 "$temporario/teste.log"
  exit 1
fi
printf 'Migração e casos locais de admissão/consulta passaram; Auth/gateway reais não comprovados.\n'
