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
# Injeta falha após a primeira concessão; toda a fixture deve reverter.
rtk proxy awk '/^grant ffcmapp_auth_nativo_owner to current_user;$/ {print; print "select 1/0;"; next} {print}' \
  "$projeto/supabase/migrations/20261105130000_auth_nativo_sessao.sql" >"$temporario/migration-falha.sql"
if rtk proxy psql -X -q --single-transaction -h "$temporario" -d ffcm_auth_nativo_teste_local \
  -v ON_ERROR_STOP=1 -v falha_injetada=1 -v migration_injetada="$temporario/migration-falha.sql" \
  -f "$projeto/supabase/tests/auth_nativo_migrador_local.sql" >"$temporario/falha.log" 2>&1; then
  printf 'Falha injetada não ocorreu.\n'
  exit 1
fi
if ! rtk proxy rg -q 'division by zero' "$temporario/falha.log"; then
  rtk proxy tail -35 "$temporario/falha.log"
  exit 1
fi
rtk proxy psql -X -q -h "$temporario" -d ffcm_auth_nativo_teste_local -v ON_ERROR_STOP=1 \
  -c "do \$\$ begin if exists (select 1 from pg_roles where rolname in ('postgres', 'migrador_fixture', 'ffcmapp_auth_nativo_owner', 'ffcmapp_email_hmac_owner')) or exists (select 1 from pg_namespace where nspname in ('identidade','auth')) then raise exception 'ROLLBACK_INCOMPLETO'; end if; end \$\$;"
if ! rtk proxy psql -X -q --single-transaction -h "$temporario" -d ffcm_auth_nativo_teste_local \
  -v ON_ERROR_STOP=1 -v falha_injetada=0 -f "$projeto/supabase/tests/auth_nativo_migrador_local.sql" >"$temporario/teste.log" 2>&1; then
  rtk proxy tail -35 "$temporario/teste.log"
  exit 1
fi
printf 'Rollback, migração e ACLs locais verificados; transação do runner remoto não comprovada.\n'
