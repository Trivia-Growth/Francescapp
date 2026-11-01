#!/bin/sh
set -eu
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGOPTIONS
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
temporario=$(rtk proxy mktemp -d /tmp/ffcm-concorrencia-criar.XXXXXX)
iniciado=0
parar() {
 resultado=$?
 trap - EXIT HUP INT TERM
 if [ "$iniciado" -eq 1 ]; then rtk proxy pg_ctl -D "$temporario/data" -t 15 stop -m fast >/dev/null || resultado=1; fi
 printf 'Diretório temporário preservado: %s\n' "$temporario"
 exit "$resultado"
}
trap parar EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
rtk proxy initdb -D "$temporario/data" --no-instructions --auth=trust >/dev/null
rtk proxy pg_ctl -D "$temporario/data" -t 30 -o "-k $temporario -p 5432 -c listen_addresses= -c unix_socket_permissions=0700" -l "$temporario/postgres.log" start >/dev/null
iniciado=1
rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/tests/concorrencia_criar_encerrar_fixture.sql" >/dev/null
for n in 3 4; do
 ator="10000000-0000-4000-8000-00000000000$n"
 reserva="20000000-0000-4000-8000-00000000000$n"
 paciente="60000000-0000-4000-8000-00000000000$n"
 pedido="70000000-0000-4000-8000-00000000000$n"
 auditoria="80000000-0000-4000-8000-00000000000$n"
 comando="30000000-0000-4000-8000-00000000000$n"
 contexto="set teste.ator='$ator'; set teste.jwt='{\"session_id\":\"$ator\",\"amr\":[{\"method\":\"oauth\"}]}'; set statement_timeout='15s';"
 criar="select teste_concorrencia.criar('$ator','$reserva','$paciente','$pedido','$auditoria');"
 encerrar="select operacao.encerrar_cadastro_privado('$ator',1,'$reserva','$comando');"
 rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -v ON_ERROR_STOP=1 -Atq -c "$contexto select operacao.reservar_cadastro_privado('$ator',1,'$reserva');" >/dev/null
 if [ "$n" = 3 ]; then primeiro="$criar"; segundo="$encerrar"; else primeiro="$encerrar"; segundo="$criar"; fi
 rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -v ON_ERROR_STOP=1 -Atq -c "begin; $contexto $primeiro select pg_advisory_xact_lock(9140$n); select pg_sleep(6); commit;" >"$temporario/primeiro$n" &
 pid_primeiro=$!
 tentativas=0
 while [ "$(rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -Atq -c "select exists(select 1 from pg_locks where locktype='advisory' and objid=9140$n and granted)")" != t ]; do
  tentativas=$((tentativas+1)); [ "$tentativas" -lt 100 ] || { wait "$pid_primeiro"; exit 1; }; rtk proxy sleep 0.05
 done
 rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -v ON_ERROR_STOP=1 -Atq -c "set application_name='concorrencia_perdedor_$n'; $contexto $segundo" >"$temporario/segundo$n" &
 pid_segundo=$!
 tentativas=0
 while [ "$(rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -Atq -c "select exists(select 1 from pg_stat_activity where application_name='concorrencia_perdedor_$n' and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0)")" != t ]; do
  tentativas=$((tentativas+1)); [ "$tentativas" -lt 80 ] || { wait "$pid_segundo" || :; wait "$pid_primeiro" || :; exit 1; }; rtk proxy sleep 0.05
 done
 wait "$pid_primeiro"
 wait "$pid_segundo"
 if [ "$n" = 3 ]; then
  rtk proxy grep -q '"ok": true' "$temporario/primeiro$n"
  rtk proxy grep -qx confirmada "$temporario/segundo$n"
  esperado=confirmada; quantidade=1; auditado=permitido
 else
  rtk proxy grep -qx cancelada "$temporario/primeiro$n"
  rtk proxy grep -q '"codigo": "conflito"' "$temporario/segundo$n"
  esperado=cancelada; quantidade=0; auditado=negado
 fi
 rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -v ON_ERROR_STOP=1 -q -c "do \$\$ begin
 if (select count(*) from cadastro.paciente where id='$paciente')<>$quantidade
 or (select count(*) from operacao.requisicao where ator_usuario_id='$ator' and resultado_id='$paciente')<>$quantidade
 or (select count(*) from auditoria.evento where id='$auditoria' and ator_usuario_id='$ator' and resultado='$auditado' and request_id='$pedido')<>1
 or (select count(*) from operacao.recibo_barreira_cadastro where id='$comando' and resultado='$esperado')<>1
 or not exists(select 1 from operacao.reserva_cadastro where id='$reserva' and estado='$esperado')
 or not exists(select 1 from operacao.barreira_cadastro where ator_usuario_id='$ator' and epoca=2 and reserva_atual is null and resultado_pendente='$comando')
 then raise exception 'ESTADO_CONCORRENTE_INVALIDO'; end if; end \$\$;"
 printf 'Cenário %s: bloqueio observado e estado final verificado.\n' "$n"
done
