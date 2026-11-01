#!/bin/sh
# Exclusivamente PostgreSQL descartável, sem TCP e sem dados reais.
set -eu
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGPASSFILE \
  PGSERVICE PGSERVICEFILE PGOPTIONS PGCONNECT_TIMEOUT PGSSLMODE PGREQUIRESSL \
  PGSSLROOTCERT PGSSLCERT PGSSLKEY PGSSLCRL PGSSLCOMPRESSION PGCHANNELBINDING \
  PGREQUIREAUTH PGTARGETSESSIONATTRS PGAPPNAME PGCLIENTENCODING PGGEQO \
  PGGSSENCMODE PGKRBSRVNAME
PGUSER=$(rtk proxy id -un)
export PGUSER
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
temporario=$(rtk proxy mktemp -d /tmp/ffcm-recibo.XXXXXX)
token=${temporario##*/}
iniciado=0
parar() {
  resultado=$?
  trap - EXIT HUP INT TERM
  if [ "$iniciado" -eq 1 ] && rtk proxy pg_ctl -D "$temporario/data" status >/dev/null 2>&1; then
    if ! rtk proxy pg_ctl -D "$temporario/data" -t 15 stop -m fast; then resultado=1; fi
  fi
  printf 'Diretório temporário preservado: %s\n' "$temporario"
  exit "$resultado"
}
trap parar EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
rtk proxy initdb -D "$temporario/data" --no-instructions --auth=trust
iniciado=1
rtk proxy pg_ctl -D "$temporario/data" -t 30 -o "-k $temporario -p 5432 -c listen_addresses= -c unix_socket_permissions=0700 -c ffcm_fixture.token_servidor=$token" -l "$temporario/postgres.log" start
PGSSLMODE=disable PGCONNECT_TIMEOUT=5 PGOPTIONS="-c statement_timeout=30000 -c lock_timeout=10000 -c ffcm_fixture.token_esperado=$token -c ffcm_fixture.socket_esperado=$temporario -c ffcm_fixture.data_esperado=$temporario/data"
export PGSSLMODE PGCONNECT_TIMEOUT PGOPTIONS
if rtk proxy psql -X -h "$temporario" -p 5432 -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -f "$projeto/supabase/tests/recibo_identidade_gateway_experimento.sql"; then
  printf 'Falha: guarda aceitou banco incorreto.\n' >&2
  exit 1
fi
rtk proxy psql -X -h "$temporario" -p 5432 -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -c 'create database ffcm_recibo_fixture;'
if PGOPTIONS="-c ffcm_fixture.token_esperado=incorreto -c ffcm_fixture.socket_esperado=$temporario -c ffcm_fixture.data_esperado=$temporario/data" \
  rtk proxy psql -X -h "$temporario" -p 5432 -U "$PGUSER" -d ffcm_recibo_fixture -v ON_ERROR_STOP=1 -f "$projeto/supabase/tests/recibo_identidade_gateway_experimento.sql"; then
  printf 'Falha: guarda aceitou token incorreto.\n' >&2
  exit 1
fi
rtk proxy psql -X -h "$temporario" -p 5432 -U "$PGUSER" -d ffcm_recibo_fixture -v ON_ERROR_STOP=1 -f "$projeto/supabase/tests/recibo_identidade_gateway_experimento.sql"
rtk proxy psql -X -h "$temporario" -p 5432 -U "$PGUSER" -d ffcm_recibo_fixture -v ON_ERROR_STOP=1 -f "$projeto/supabase/tests/recibo_identidade_atomicidade_fixture.sql"
# A primeira conexão só recebe COMMIT depois de observarmos o bloqueio da segunda.
rtk proxy mkfifo "$temporario/comandos"
exec 3<>"$temporario/comandos"
PGAPPNAME=ffcm_recibo_primeiro rtk proxy psql -X -qAt -h "$temporario" -p 5432 -U "$PGUSER" -d ffcm_recibo_fixture -v ON_ERROR_STOP=1 <"$temporario/comandos" >"$temporario/primeiro.out" &
primeiro=$!
printf '%s\n' "begin; set local role recibo_executor_fixture; select recibo_fixture.operar_vinculado('concorrente', convert_to('dados fictícios', 'UTF8'));" >&3
pid_primeiro=
for tentativa in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
  pid_primeiro=$(rtk proxy psql -X -qAt -h "$temporario" -p 5432 -U "$PGUSER" -d ffcm_recibo_fixture -c "select min(pid) from pg_stat_activity where application_name='ffcm_recibo_primeiro' and state='idle in transaction' having count(*)=1;")
  if [ -n "$pid_primeiro" ]; then
    break
  fi
  rtk proxy sleep 0.1
done
case "$pid_primeiro" in ''|*[!0-9]*)
  printf 'Falha: primeira transação não atingiu a barreira.\n' >&2
  exit 1
  ;;
esac
PGAPPNAME=ffcm_recibo_segundo rtk proxy psql -X -qAt -h "$temporario" -p 5432 -U "$PGUSER" -d ffcm_recibo_fixture -v ON_ERROR_STOP=1 -c "begin; set local role recibo_executor_fixture; select recibo_fixture.operar_vinculado('concorrente', convert_to('dados fictícios', 'UTF8')); commit;" >"$temporario/segundo.out" &
segundo=$!
bloqueado=0
for tentativa in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
  bloqueado=$(rtk proxy psql -X -qAt -h "$temporario" -p 5432 -U "$PGUSER" -d ffcm_recibo_fixture -c "select count(*) from pg_stat_activity a where a.application_name='ffcm_recibo_segundo' and a.pid <> $pid_primeiro and a.state='active' and $pid_primeiro = any(pg_blocking_pids(a.pid)) and (select count(*) from pg_stat_activity b where b.pid=$pid_primeiro and b.application_name='ffcm_recibo_primeiro' and b.state='idle in transaction')=1;")
  if [ "$bloqueado" = 1 ]; then break; fi
  rtk proxy sleep 0.1
done
if [ "$bloqueado" != 1 ]; then
  printf 'Falha: bloqueio da segunda transação não foi comprovado.\n' >&2
  exit 1
fi
printf '%s\n' 'commit;' '\q' >&3
exec 3>&-
wait "$primeiro"
wait "$segundo"
if [ "$(rtk proxy sed -n '1p' "$temporario/primeiro.out")" != t ] || [ "$(rtk proxy sed -n '1p' "$temporario/segundo.out")" != f ]; then
  printf 'Falha: consumo concorrente não teve um único vencedor.\n' >&2
  exit 1
fi
rtk proxy psql -X -h "$temporario" -p 5432 -U "$PGUSER" -d ffcm_recibo_fixture -v ON_ERROR_STOP=1 -c 'do $$ begin if (select count(*) from recibo_fixture.operacao_vinculada where id=$v$concorrente$v$ and dados=convert_to($v$dados fictícios$v$, $v$UTF8$v$)) <> 1 or (select count(*) from recibo_fixture.auditoria where id=$v$concorrente$v$) <> 1 then raise exception $v$operação ou auditoria duplicada$v$; end if; end $$;'
