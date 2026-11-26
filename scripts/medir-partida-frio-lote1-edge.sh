#!/bin/sh
# Mede a partida a frio das Edge Functions do lote 1 sob o tráfego do próprio lote (3.4).
#
# Cada publicação cria uma versão nova, logo o primeiro pedido seguinte é garantidamente
# a um isolate novo — é o que distingue partida a frio de reaproveitamento, em vez de supor.
# Os pedidos seguintes medem o mesmo caminho já quente.
#
#   FFCM_EDGE_BASE        origem das Edge Functions
#   FFCM_EDGE_INVOCACAO   credencial de invocação (nunca impressa)
set -eu
base=${FFCM_EDGE_BASE:?}
credencial=${FFCM_EDGE_INVOCACAO:?}
repeticoes=${FFCM_EDGE_REPETICOES:-5}

medir() {
  curl -s -o /dev/null -w '%{http_code} %{time_total}\n' \
    -H "Authorization: Bearer $credencial" "$1"
}

for par in \
  'configuracao-sistema /api/admin/configuracao-sistema' \
  'regras-atendimento /api/regras-atendimento' \
  'auditoria /api/admin/auditoria' \
  'preautorizacoes-familiares /api/admin/preautorizacoes-familiares' \
  'solicitacoes-titular /api/admin/solicitacoes-titular'
do
  funcao=${par%% *}
  caminho=${par#* }
  alvo="$base/functions/v1/$funcao$caminho"
  i=1
  while [ "$i" -le "$repeticoes" ]; do
    printf '%s pedido=%s %s\n' "$funcao" "$i" "$(medir "$alvo")"
    i=$((i + 1))
  done
done
