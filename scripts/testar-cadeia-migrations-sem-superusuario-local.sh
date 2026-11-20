#!/bin/sh
# Prova que a cadeia COMPLETA de migrations aplica num banco novo sob um papel
# com CREATEROLE e SEM superusuário, reproduzindo o projeto remoto (PostgreSQL 17).
# Difere de testar-cadeia-migrations-local.sh em dois pontos decisivos:
# aplica todas as migrations do diretório, e o migrador não é superusuário.
set -eu
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
temporario=$(rtk proxy mktemp -d "${TMPDIR:-/tmp}/ffcm-cadeia-nsu.XXXXXXXX")
iniciado=0
limpar() {
  if [ "$iniciado" = 1 ]; then rtk proxy pg_ctl -D "$temporario/data" -m immediate -w stop >/dev/null; fi
  rtk proxy rm -r -- "$temporario"
}
trap limpar EXIT HUP INT TERM
unset PGHOST PGHOSTADDR PGPORT PGUSER PGDATABASE PGSERVICE PGSERVICEFILE PGOPTIONS
LC_ALL=C
export LC_ALL
rtk proxy initdb -D "$temporario/data" -U cadeia_superusuario --no-instructions --auth=trust >/dev/null
rtk proxy pg_ctl -D "$temporario/data" -t 30 -o "-k $temporario -p 5432 -c listen_addresses= -c unix_socket_permissions=0700 -c shared_preload_libraries=pg_cron -c cron.database_name=ffcm_cadeia_sem_superusuario_local -c cron.launch_active_jobs=off" -l "$temporario/postgres.log" start >/dev/null
iniciado=1
rtk proxy createdb -h "$temporario" -p 5432 -U cadeia_superusuario ffcm_cadeia_sem_superusuario_local
rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_superusuario -d ffcm_cadeia_sem_superusuario_local -v ON_ERROR_STOP=1 -q \
  -f "$projeto/supabase/tests/cadeia_migrations_sem_superusuario_bootstrap_local.sql"

# A ordem é a do nome do arquivo, idêntica à do supabase db push.
roteiro="$temporario/cadeia.sql"
{
  echo '\set ON_ERROR_STOP on'
  for arquivo in "$projeto"/supabase/migrations/*.sql; do
    printf '\\echo %s\n' "$(basename "$arquivo")"
    printf '\\ir %s\n' "$arquivo"
  done
} > "$roteiro"

# O migrador NÃO é superusuário: é esse o ponto da prova.
rtk proxy psql -X -h "$temporario" -p 5432 -U postgres -d ffcm_cadeia_sem_superusuario_local -v ON_ERROR_STOP=1 -q -f "$roteiro"

rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_superusuario -d ffcm_cadeia_sem_superusuario_local -v ON_ERROR_STOP=1 -q -c \
  "do \$\$ begin if (select rolsuper from pg_roles where rolname='postgres') then raise exception 'MIGRADOR_VIROU_SUPERUSUARIO'; end if; end \$\$;"
echo "CADEIA_COMPLETA_SEM_SUPERUSUARIO_OK: $(ls "$projeto"/supabase/migrations/*.sql | wc -l | tr -d ' ') migrations"
