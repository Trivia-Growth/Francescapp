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
rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -f "$projeto/supabase/tests/anamnese_operacoes_local.sql"

# Primeira gravação pausa dentro da auditoria; segunda disputa o mesmo paciente/chave.
rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -Atq \
  -c "set application_name='anamnese_concorrente_fixture'; set fixture.pausar_auditoria='sim'; select public.gravar_anamnese_fixture('concorrente','50000000-0000-4000-8000-000000000001');" >"$temporario/primeira" &
primeira=$!
tentativas=0
while :; do
  pronto=$(rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -Atq -c "select count(*) from pg_stat_activity where application_name='anamnese_concorrente_fixture' and wait_event='PgSleep'")
  [ "$pronto" = 1 ] && break
  tentativas=$((tentativas + 1))
  if [ "$tentativas" -ge 100 ]; then rtk proxy kill "$primeira" 2>/dev/null || :; wait "$primeira" || :; exit 1; fi
  rtk proxy sleep 0.02
done
rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -Atq \
  -c "select public.gravar_anamnese_fixture('concorrente','50000000-0000-4000-8000-000000000002');" >"$temporario/segunda"
wait "$primeira"
rtk proxy python3 - "$temporario/primeira" "$temporario/segunda" <<'PYTEST'
import json, sys
primeira, segunda = [json.loads(open(path).read()) for path in sys.argv[1:]]
assert primeira['ok'] and not primeira['repeticao'], primeira
assert segunda['ok'] and segunda['repeticao'], segunda
assert primeira['dados'] == segunda['dados'], (primeira, segunda)
PYTEST
rtk proxy psql -X -h "$temporario" -p 5432 -U cadeia_fixture -d ffcm_cadeia_local -v ON_ERROR_STOP=1 -q -c "do \$\$ begin if (select count(*) from operacao.requisicao where chave_idempotencia='concorrente') <> 1 or (select count(*) from cadastro.anamnese_versao where paciente_id='40000000-0000-4000-8000-000000000002') <> 1 or (select count(*) from auditoria.evento where objeto_id='40000000-0000-4000-8000-000000000002' and resultado='permitido') <> 2 then raise exception 'CONCORRENCIA_INCONSISTENTE'; end if; end \$\$;"
