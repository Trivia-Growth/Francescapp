#!/bin/sh
set -eu
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGOPTIONS
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
temporario=$(rtk proxy mktemp -d /tmp/ffcm-barreira-privada.XXXXXX)
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
rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/tests/barreira_cadastro_privada_local.sql"
rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -v ON_ERROR_STOP=1 -q -c "
insert into public.usuario values ('10000000-0000-4000-8000-000000000003'),('10000000-0000-4000-8000-000000000004');
set teste.ator='10000000-0000-4000-8000-000000000003';
select operacao.reservar_cadastro_privado('10000000-0000-4000-8000-000000000003',1,'20000000-0000-4000-8000-000000000005');
set teste.ator='10000000-0000-4000-8000-000000000004';
select operacao.reservar_cadastro_privado('10000000-0000-4000-8000-000000000004',1,'20000000-0000-4000-8000-000000000006');" >/dev/null
rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -v ON_ERROR_STOP=1 -q -c "
begin; set local teste.ator='10000000-0000-4000-8000-000000000003';
select operacao.encerrar_cadastro_privado('10000000-0000-4000-8000-000000000003',1,'20000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000002');
select pg_advisory_xact_lock(1723091); select pg_sleep(3); commit;" >/dev/null &
primeiro=$!
tentativas=0
while :; do
 pronto=$(rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -Atq -c "select exists(select 1 from pg_locks where locktype='advisory' and objid=1723091 and granted)")
 [ "$pronto" = t ] && break
 tentativas=$((tentativas+1))
 [ "$tentativas" -lt 100 ] || { wait "$primeiro"; exit 1; }
 rtk proxy sleep 0.05
done
resultado=$(rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -v ON_ERROR_STOP=1 -Atq -c "
set teste.ator='10000000-0000-4000-8000-000000000004';
select operacao.encerrar_cadastro_privado('10000000-0000-4000-8000-000000000004',1,'20000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000002');")
wait "$primeiro"
[ "$resultado" = id_reutilizado ]
rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -v ON_ERROR_STOP=1 -q -c "do \$\$ begin
if not exists(select 1 from operacao.reserva_cadastro where id='20000000-0000-4000-8000-000000000006' and estado='aberta')
or not exists(select 1 from operacao.barreira_cadastro where ator_usuario_id='10000000-0000-4000-8000-000000000004' and epoca=1 and reserva_atual='20000000-0000-4000-8000-000000000006' and resultado_pendente is null)
then raise exception 'COLISAO_ALTEROU_PERDEDOR'; end if; end \$\$;"
