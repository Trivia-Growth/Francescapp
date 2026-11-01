#!/bin/sh
set -eu
FFCM_CARTEIRA_NATIVA_PROJETO=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
export FFCM_CARTEIRA_NATIVA_PROJETO
unset FFCM_TESTE_EXECUTOR_CADASTRO FFCM_TESTE_EXECUTOR_CARTEIRA
rtk proxy sed \
  -e 's@^projeto=.*@projeto=$FFCM_CARTEIRA_NATIVA_PROJETO@' \
  -e 's/fundacao_verificador_atestado_local.sql/fundacao_carteira_nativa_autorizacao_fixture.sql/' \
  "$FFCM_CARTEIRA_NATIVA_PROJETO/scripts/testar-carteira-local.sh" | rtk proxy sh
