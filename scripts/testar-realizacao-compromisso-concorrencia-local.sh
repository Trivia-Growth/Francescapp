#!/bin/sh
set -eu
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGOPTIONS
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
temporario=$(rtk proxy mktemp -d "${TMPDIR:-/tmp}/ffcm-realizacao-conc.XXXXXX")
iniciado=0
limpar() {
  if [ "$iniciado" = 1 ]; then rtk proxy pg_ctl -D "$temporario/data" -m immediate -w stop >/dev/null; fi
  rtk proxy rm -r -- "$temporario"
}
trap limpar EXIT HUP INT TERM
rtk proxy initdb -D "$temporario/data" -U cadeia_fixture --no-instructions --auth=trust >/dev/null
rtk proxy pg_ctl -D "$temporario/data" -t 30 -o "-k $temporario -p 55472 -c listen_addresses= -c unix_socket_permissions=0700" -l "$temporario/postgres.log" start >/dev/null
iniciado=1
rtk proxy createdb -h "$temporario" -p 55472 -U cadeia_fixture ffcm_cadeia_local
psql() { rtk proxy psql -X -h "$temporario" -p 55472 -U cadeia_fixture -d ffcm_cadeia_local "$@"; }
psql -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/tests/realizacao_compromisso_concorrencia_local.sql" >"$temporario/preparo.log" 2>&1 || { rtk proxy cat "$temporario/preparo.log"; exit 1; }

primeiro='11111111-1111-4111-8111-111111111111'
segundo='22222222-2222-4222-8222-222222222222'
# Conexão 1 grava a versão 1 e segura a transação; conexão 2 tenta a MESMA versão e bloqueia.
psql -v ON_ERROR_STOP=1 -Atq -c "begin; set statement_timeout='30s'; select public.registrar_realizacao_fixture('$primeiro','conc-1','realizado'); select pg_advisory_xact_lock(99121); select pg_sleep(6); commit;" >"$temporario/conexao1" 2>&1 &
pid1=$!
tentativas=0
while [ "$(psql -Atq -c "select exists(select 1 from pg_locks where locktype='advisory' and objid=99121 and granted)")" != t ]; do
  tentativas=$((tentativas+1)); [ "$tentativas" -lt 200 ] || { wait "$pid1" || :; echo 'conexao 1 nao chegou ao lock'; exit 1; }; rtk proxy sleep 0.05
done
psql -v ON_ERROR_STOP=1 -Atq -c "begin; set application_name='realizacao_concorrente'; set statement_timeout='30s'; select public.registrar_realizacao_fixture('$segundo','conc-2','faltou'); commit;" >"$temporario/conexao2" 2>&1 &
pid2=$!
tentativas=0
while [ "$(psql -Atq -c "select exists(select 1 from pg_stat_activity where application_name='realizacao_concorrente' and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0)")" != t ]; do
  tentativas=$((tentativas+1)); [ "$tentativas" -lt 200 ] || { wait "$pid2" || :; wait "$pid1" || :; echo 'conexao 2 nao bloqueou'; exit 1; }; rtk proxy sleep 0.05
done
echo 'bloqueio observado: a segunda conexao esperou a primeira no indice unico de versao'
wait "$pid1"
wait "$pid2"
rtk proxy grep -q '"ok": true' "$temporario/conexao1" || { rtk proxy cat "$temporario/conexao1"; exit 1; }
rtk proxy grep -q '"codigo": "conflito"' "$temporario/conexao2" || { rtk proxy cat "$temporario/conexao2"; exit 1; }
psql -v ON_ERROR_STOP=1 -q -c "do \$\$ begin
 if (select count(*) from cadastro.realizacao_compromisso where evento_id='evt-concorrente')<>1
  or not exists(select 1 from cadastro.realizacao_compromisso where id='$primeiro' and versao=1 and situacao='realizado')
  or exists(select 1 from cadastro.realizacao_compromisso where id='$segundo')
  or exists(select 1 from cadastro.realizacao_compromisso where evento_id='evt-concorrente' and situacao='faltou')
  or exists(select 1 from operacao.requisicao where chave_idempotencia='conc-2')
  or not exists(select 1 from auditoria.evento where acao='api.registrar_realizacao_compromisso' and resultado='negado')
 then raise exception 'ESTADO_CONCORRENTE_INVALIDO'; end if; end \$\$;"
echo "realizacao do compromisso: versao vigente duplicada recusada pelo banco em duas conexoes"
