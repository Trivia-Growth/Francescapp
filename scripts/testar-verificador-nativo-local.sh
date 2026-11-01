#!/bin/sh
# Reutiliza preparação do cluster descartável; Vault é simulado, não Supabase real.
set -eu
FFCM_VERIFICADOR_PROJETO=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
export FFCM_VERIFICADOR_PROJETO
unset FFCM_TESTE_EXECUTOR_CADASTRO FFCM_TESTE_EXECUTOR_CARTEIRA
rtk proxy sed \
  -e 's@^projeto=.*@projeto=$FFCM_VERIFICADOR_PROJETO@' \
  -e 's/fundacao_verificador_atestado_local.sql/fundacao_verificador_nativo_local.sql/' \
  "$FFCM_VERIFICADOR_PROJETO/scripts/testar-carteira-local.sh" | rtk proxy sh
