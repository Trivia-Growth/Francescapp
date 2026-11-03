#!/bin/sh
set -eu
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGOPTIONS
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
temporario=$(rtk proxy mktemp -d /tmp/ffcm-migrador-owners.XXXXXX)
iniciado=0
parar() {
 resultado=$?
 trap - EXIT HUP INT TERM
 if [ "$iniciado" -eq 1 ]; then rtk proxy pg_ctl -D "$temporario/data" -t 15 stop -m fast >/dev/null || resultado=1; fi
 case "$temporario" in
  /tmp/ffcm-migrador-owners.*) rtk proxy rm -r -- "$temporario" || resultado=1 ;;
  *) printf 'Diretório temporário inválido: %s\n' "$temporario" >&2; resultado=1 ;;
 esac
 exit "$resultado"
}
trap parar EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
rtk proxy initdb -D "$temporario/data" --no-instructions --auth=trust >/dev/null
rtk proxy pg_ctl -D "$temporario/data" -t 30 -o "-k $temporario -p 5432 -c listen_addresses= -c unix_socket_permissions=0700" -l "$temporario/postgres.log" start >/dev/null
iniciado=1
# O papel padrão da conexão difere do executor após SET ROLE NONE.
rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -v ON_ERROR_STOP=1 -q -c "create role papel_padrao_fixture nologin; do \$\$ begin execute format('alter role %I set role papel_padrao_fixture', current_user); end \$\$;"
rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -v ON_ERROR_STOP=1 -q -c 'set role none' -f "$projeto/supabase/tests/owners_migrador_local.sql"
rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -v ON_ERROR_STOP=1 -q -c 'set role none' -c "do \$\$ begin execute format('alter role %I reset role', current_user); end \$\$;"
# Interrompe a primeira migration depois do grant, dentro de uma transação.
rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -v ON_ERROR_STOP=1 -q -c 'create role migrador_falha_fixture login nosuperuser createrole'
rtk proxy awk '
 { print }
 $0 == "grant ffcmapp_atestado_vault_owner to current_user with inherit false, set true;" { encontrado++; exit }
 END { if (encontrado != 1) exit 1 }
' "$projeto/supabase/migrations/20261104120000_vault_atestado.sql" >"$temporario/falha.sql"
rtk proxy tee -a "$temporario/falha.sql" >/dev/null <<'SQL'
do $$ begin
 if not exists (select 1 from pg_auth_members
   where roleid = 'ffcmapp_atestado_vault_owner'::regrole
     and member = current_user::regrole and set_option) then
  raise exception 'Grant temporário não foi aplicado';
 end if;
 raise exception 'FALHA_INJETADA_APOS_GRANT';
end $$;
SQL
if rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -U migrador_falha_fixture -v ON_ERROR_STOP=1 -q -1 -f "$temporario/falha.sql" >"$temporario/falha.log" 2>&1; then
 printf 'Falha injetada não interrompeu a migration\n' >&2
 exit 1
fi
if ! rtk proxy grep -Fq 'FALHA_INJETADA_APOS_GRANT' "$temporario/falha.log"; then
 rtk proxy cat "$temporario/falha.log" >&2
 exit 1
fi
rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -v ON_ERROR_STOP=1 -q -c "
do \$\$ begin
 if exists (select 1 from pg_roles where rolname in ('ffcmapp_atestado_vault_owner','ffcmapp_atestado_vault_executor'))
   or exists (select 1 from pg_auth_members where member = 'migrador_falha_fixture'::regrole) then
  raise exception 'Rollback deixou papéis ou grants temporários';
 end if;
end \$\$;"
# Uma sessão que entrou com SET ROLE deve ser rejeitada antes de criar papéis.
rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -v ON_ERROR_STOP=1 -q -c 'create role migrador_com_set_fixture login nosuperuser createrole'
for migration in \
  20261104120000_vault_atestado.sql \
  20261106100000_carteira_nativa.sql \
  20261106130000_carteira_nativa.sql \
   20261106190000_wrappers_privados.sql
do
 if rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -v ON_ERROR_STOP=1 -q \
   -c 'set role migrador_com_set_fixture' -f "$projeto/supabase/migrations/$migration" >"$temporario/rejeicao.log" 2>&1; then
  printf 'Migration aceitou SET ROLE de entrada: %s\n' "$migration" >&2
  exit 1
 fi
 if ! rtk proxy grep -Fq 'Migration requer conexão direta como executor' "$temporario/rejeicao.log"; then
  rtk proxy cat "$temporario/rejeicao.log" >&2
  exit 1
 fi
done
rtk proxy psql -X -h "$temporario" -p 5432 -d postgres -v ON_ERROR_STOP=1 -q -c "
do \$\$ begin
 if exists (select 1 from pg_roles where rolname in
   ('ffcmapp_atestado_vault_owner','ffcmapp_atestado_vault_executor','ffcmapp_atestado_verificador_owner',
    'ffcmapp_carteira_owner','ffcmapp_api_cadastro_owner','ffcmapp_api_carteira_owner')) then
  raise exception 'A migration rejeitada criou papéis';
 end if;
end \$\$;"
