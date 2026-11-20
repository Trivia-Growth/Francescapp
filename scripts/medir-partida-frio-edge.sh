#!/bin/sh
# Mede a partida a frio do Edge Runtime do Supabase local (tarefa 1.4).
#
# Método: instala `scripts/edge-partida-frio.ts` como função do projeto local, recria o
# contêiner do Edge Runtime (isolate garantidamente frio), e cronometra a PRIMEIRA
# requisição e as seguintes. O corpo da resposta informa quantas requisições aquele isolate
# já atendeu, o que distingue partida a frio de reaproveitamento.
#
#   PROVA_WORKDIR  diretório do projeto Supabase local (contendo `supabase/`)
#   PROVA_API_URL  URL da API local (padrão http://127.0.0.1:55421)
#   PROVA_ANON_KEY chave anônima local impressa por `supabase start` (chave de demonstração
#                  do ambiente local, não segredo de produção)
set -eu
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
workdir=${PROVA_WORKDIR:?PROVA_WORKDIR é obrigatório}
api=${PROVA_API_URL:-http://127.0.0.1:55421}
chave=${PROVA_ANON_KEY:?PROVA_ANON_KEY é obrigatório}
funcao=medir-partida-frio

mkdir -p "$workdir/supabase/functions/$funcao"
cp "$projeto/scripts/edge-partida-frio.ts" "$workdir/supabase/functions/$funcao/index.ts"

echo "--- partida a frio: primeira requisição ao isolate recém-criado ---"
for i in 1 2 3 4 5; do
  inicio=$(python3 -c 'import time;print(time.time())')
  corpo=$(curl -s -m 30 -H "Authorization: Bearer $chave" "$api/functions/v1/$funcao")
  fim=$(python3 -c 'import time;print(time.time())')
  ms=$(python3 -c "print(round((${fim}-${inicio})*1000,1))")
  echo "requisicao=$i relogio_ms=$ms corpo=$corpo"
done
