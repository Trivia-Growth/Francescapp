#!/bin/sh
set -eu
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGOPTIONS
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
temporario=$(rtk proxy mktemp -d /tmp/ffcm-concorrencia-revogar.XXXXXX)
iniciado=0
parar() {
 resultado=$?
 trap - EXIT HUP INT TERM
 if [ "$iniciado" -eq 1 ]; then rtk proxy pg_ctl -D "$temporario/data" -t 15 stop -m fast >/dev/null || resultado=1; fi
 if [ "$resultado" -eq 0 ]; then rtk proxy rm -r "$temporario"; else printf 'Fixture preservada: %s\n' "$temporario" >&2; fi
 exit "$resultado"
}
trap parar EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
rtk proxy initdb -D "$temporario/data" -U cadeia_fixture --no-instructions --auth=trust >/dev/null
rtk proxy pg_ctl -D "$temporario/data" -t 30 -o "-k $temporario -p 5432 -c listen_addresses= -c unix_socket_permissions=0700" -l "$temporario/postgres.log" start >/dev/null
iniciado=1
rtk proxy createdb -h "$temporario" -p 5432 -U cadeia_fixture ffcm_cadeia_local
rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/tests/concorrencia_revogar_encerrar_fixture.sql" >/dev/null
ator=10000000-0000-4000-8000-000000000001
paciente=40000000-0000-4000-8000-000000000002
contexto="set request.jwt.claims='{\"sub\":\"$ator\",\"session_id\":\"20000000-0000-4000-8000-000000000001\",\"amr\":[{\"method\":\"oauth\"}]}'; set statement_timeout='15s';"
for n in 1 2; do
 reserva="a0000000-0000-4000-8000-00000000000$n"
 acesso="b0000000-0000-4000-8000-00000000000$n"
 comando="c0000000-0000-4000-8000-00000000000$n"
 pedido="d0000000-0000-4000-8000-00000000000$n"
 auditoria="e0000000-0000-4000-8000-00000000000$n"
 chave="revogar-concorrencia-$n"
 rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -Atq -c "$contexto insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado) values('$acesso','$paciente','10000000-0000-4000-8000-000000000002','$ator','{\"formato\":1,\"key_id\":\"teste\",\"nonce\":\"aaaaaaaaaaaaaaaa\",\"ciphertext\":\"YQ\",\"tag\":\"aaaaaaaaaaaaaaaaaaaaaa\"}'); select operacao.reservar_concessao_acesso_profissional_privado('$ator',$n,'$reserva','$paciente','revogar','$acesso',1);" | rtk proxy grep -qx aberta
 revogar="select public.revogar_concorrencia_fixture('$reserva','$acesso',$n,'$pedido','$auditoria','$chave');"
 encerrar="select operacao.encerrar_concessao_acesso_profissional_privado('$ator',$n,'$reserva','$comando');"
 if [ "$n" = 1 ]; then primeiro="$revogar"; segundo="$encerrar"; else primeiro="$encerrar"; segundo="$revogar"; fi
 rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -Atq -c "begin; $contexto $primeiro select pg_advisory_xact_lock(9150$n); select pg_sleep(6); commit;" >"$temporario/primeiro$n" &
 pid_primeiro=$!
 tentativas=0
 while [ "$(rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -Atq -c "select exists(select 1 from pg_locks where locktype='advisory' and objid=9150$n and granted)")" != t ]; do
  tentativas=$((tentativas+1)); [ "$tentativas" -lt 100 ] || { wait "$pid_primeiro" || :; exit 1; }; rtk proxy sleep 0.05
 done
 rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -Atq -c "set application_name='revogar_perdedor_$n'; $contexto $segundo" >"$temporario/segundo$n" &
 pid_segundo=$!
 tentativas=0
 while [ "$(rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -Atq -c "select exists(select 1 from pg_stat_activity where application_name='revogar_perdedor_$n' and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0)")" != t ]; do
  tentativas=$((tentativas+1)); [ "$tentativas" -lt 80 ] || { wait "$pid_segundo" || :; wait "$pid_primeiro" || :; exit 1; }; rtk proxy sleep 0.05
 done
 wait "$pid_primeiro"
 wait "$pid_segundo"
 if [ "$n" = 1 ]; then
  rtk proxy grep -q '"ok": true' "$temporario/primeiro$n"
  rtk proxy grep -qx confirmada "$temporario/segundo$n"
  esperado=confirmada; versao=2; revogada='is not null'; quantidade=1; auditado=permitido
 else
  rtk proxy grep -qx cancelada "$temporario/primeiro$n"
  rtk proxy grep -q '"codigo": "conflito"' "$temporario/segundo$n"
  esperado=cancelada; versao=1; revogada='is null'; quantidade=0; auditado=negado
 fi
 rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -c "do \$\$ begin
 if not exists(select 1 from cadastro.acesso_paciente where id='$acesso' and versao=$versao and revogada_em $revogada)
 or (select count(*) from operacao.requisicao where chave_idempotencia='$chave')<>$quantidade
 or (select count(*) from auditoria.evento where request_id='$pedido' and resultado='$auditado')<>1
 or not exists(select 1 from operacao.reserva_concessao_acesso_profissional where id='$reserva' and estado='$esperado')
 or not exists(select 1 from operacao.recibo_barreira_concessao_acesso_profissional where id='$comando' and resultado='$esperado')
 or not exists(select 1 from operacao.barreira_concessao_acesso_profissional where ator_usuario_id='$ator' and epoca=$((n+1)) and reserva_atual is null and resultado_pendente='$comando')
 then raise exception 'ESTADO_CONCORRENTE_INVALIDO'; end if; end \$\$;"
 if [ "$n" = 1 ]; then
  rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -Atq -c "$contexto select operacao.reconhecer_barreira_concessao_acesso_profissional_privado('$comando',gen_random_uuid());" | rtk proxy grep -qx reconhecido
 fi
 printf 'Cenário %s: bloqueio observado e estado final verificado.\n' "$n"
done
