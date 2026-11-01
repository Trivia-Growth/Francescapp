#!/bin/sh
# Mesmo cluster descartável do teste de wrappers, sem rede ou Docker.
set -eu
FFCM_AUDITORIA_PROJETO=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
export FFCM_AUDITORIA_PROJETO
rtk proxy sed \
 -e 's@^raiz=.*@raiz=$FFCM_AUDITORIA_PROJETO@' \
 -e 's/wrappers_privados_local.sql/auditoria_atestado_local.sql/' \
 -e 's/-U wrappers_fixture wrappers_fixture/-U wrappers_fixture ffcm_cadeia_local/' \
 -e 's/-d wrappers_fixture/-d ffcm_cadeia_local/' \
 -e 's/$(mktemp /$(rtk proxy mktemp /' \
 -e 's/then pg_ctl /then rtk proxy pg_ctl /' \
 -e 's/^initdb /rtk proxy initdb /' \
 -e 's/^pg_ctl /rtk proxy pg_ctl /' \
 -e 's/^createdb /rtk proxy createdb /' \
 -e 's/^psql /rtk proxy psql /' \
 "$FFCM_AUDITORIA_PROJETO/scripts/testar-wrappers-privados-local.sh" | rtk proxy sh
