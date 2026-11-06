#!/bin/sh
set -eu
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
temporario=$(rtk proxy mktemp -d "${TMPDIR:-/tmp}/ffcm-cadeia.XXXXXXXX")
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
rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/tests/plano_cuidado_reserva_local.sql"


# A primeira transação segura o paciente; a segunda precisa aguardar antes da barreira.
rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -c "begin; set local statement_timeout='10s'; select 1 from cadastro.paciente where id='40000000-0000-4000-8000-000000000001' for update; select pg_advisory_xact_lock(868600); select pg_sleep(3); select public.criar_plano_concorrente_fixture(); commit;" >"$temporario/primeiro" 2>&1 &
primeiro=$!
while [ "$(rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -Atq -c "select exists(select 1 from pg_locks where locktype='advisory' and objid=868600 and granted)")" != t ]; do
  kill -0 "$primeiro" 2>/dev/null || { rtk proxy cat "$temporario/primeiro"; exit 1; }
done
rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -Atq -c "set statement_timeout='10s'; set application_name='plano_reserva_concorrente'; select set_config('request.jwt.claims','{\"sub\":\"10000000-0000-4000-8000-000000000002\"}',false); select operacao.reservar_plano_privado('10000000-0000-4000-8000-000000000002',3,'30000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001');" >"$temporario/segundo" 2>&1 &
segundo=$!
while [ "$(rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -Atq -c "select exists(select 1 from pg_stat_activity where application_name='plano_reserva_concorrente' and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0)")" != t ]; do
  kill -0 "$segundo" 2>/dev/null || { rtk proxy cat "$temporario/segundo"; exit 1; }
  kill -0 "$primeiro" 2>/dev/null || { rtk proxy cat "$temporario/primeiro"; exit 1; }
done
wait "$primeiro" || { rtk proxy cat "$temporario/primeiro"; exit 1; }
wait "$segundo" || { rtk proxy cat "$temporario/segundo"; exit 1; }
rtk proxy rg -q '^bloqueada$' "$temporario/segundo"
