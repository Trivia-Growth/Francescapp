#!/bin/sh
# Prova isolada: ator e efeito são fictícios; não exercita Auth, atestado,
# auditoria, RLS ou criação real de paciente. Não conecta a Supabase.
set -eu

raiz=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
diretorio=$(mktemp -d /tmp/ffcm-barreira.XXXXXXXX)
iniciado=0
encerrar() {
  if [ "$iniciado" -eq 1 ]; then
    pg_ctl -D "$diretorio/data" -m fast -w stop >/dev/null
  fi
  printf 'Cluster descartável preservado em %s\n' "$diretorio" >&2
}
trap encerrar EXIT
trap 'exit 1' HUP INT TERM

initdb -D "$diretorio/data" -U barreira_fixture -A trust --no-locale >/dev/null
pg_ctl -D "$diretorio/data" -o "-k $diretorio -p 55432 -c listen_addresses=" -l "$diretorio/postgres.log" -w start >/dev/null
iniciado=1
createdb -h "$diretorio" -p 55432 -U barreira_fixture barreira_cadastro_fixture
psql -X -q -v ON_ERROR_STOP=1 -h "$diretorio" -p 55432 -U barreira_fixture -d barreira_cadastro_fixture -f "$raiz/supabase/tests/fundacao_barreira_cadastro_nativa_fixture.sql"
