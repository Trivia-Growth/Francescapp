#!/bin/bash
# Ensaio de migrations sobre o ESQUEMA de produção, num PostgreSQL Supabase descartável.
#
#   PROJETO_REF=<ref> preparar <dir>  Só leitura remota: dump de esquema (sem dados), papéis (sem senhas),
#                           memberships, histórico de migrations e grants em vault/extensions
#                           (que o dump do CLI não traz). <dir> deve ficar FORA do repositório.
#                           Observação: `supabase db dump --remote` cria/renova o papel temporário
#                           de login do CLI no projeto; as demais consultas usam --read-only.
#   ensaiar <dir> <sql>...  Local, sem rede: restaura <dir> e executa cada <sql> como
#                           supabase_admin (o arquivo troca de papel com `\c - postgres`).
#                           O repositório fica montado em /repo dentro do contêiner.
#
# Limites: a imagem não roda as migrations do GoTrue; auth.sessions/identities e auth.jwt() são
# stand-ins mínimos. Dados, Auth real, PostgREST e provedores externos não fazem parte do ensaio.
set -euo pipefail
projeto=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
imagem=${IMAGEM:-public.ecr.aws/supabase/postgres:17.12.0.002}
conteiner=${CONTEINER:-ffcm-ensaio-producao}
modo=${1:?modo: preparar|ensaiar}; dir=${2:?diretório do dump}; shift 2

consulta() { # leitura remota; devolve a coluna "t" da primeira linha
  local arquivo; arquivo=$(mktemp); printf '%s\n' "$1" > "$arquivo"
  supabase db query --remote="${PROJETO_REF:?defina PROJETO_REF}" --read-only --output-format json -f "$arquivo" 2>/dev/null |
    python3 -I -c 'import json,sys;t=sys.stdin.read();print(json.loads(t[t.index("{"):])["rows"][0]["t"] or "")'
  rm -f -- "$arquivo"
}

if [ "$modo" = preparar ]; then
  case "$(cd "$dir" && pwd)/" in "$projeto"/*) echo "DUMP_DENTRO_DO_REPOSITORIO"; exit 1;; esac
  (cd "$projeto" && supabase db dump --remote="$PROJETO_REF" -f "$dir/schema.sql" && supabase db dump --remote="$PROJETO_REF" --role-only -f "$dir/roles.sql")
  if grep -qE '^(INSERT|COPY) ' "$dir/schema.sql" || grep -qiE 'password|encrypted' "$dir/roles.sql"; then echo "DUMP_COM_DADOS_OU_SENHA"; exit 1; fi
  consulta "select string_agg(format('grant %I to %I with admin %s, inherit %s, set %s granted by %I;',r.rolname,u.rolname,m.admin_option::text,m.inherit_option::text,m.set_option::text,g.rolname),E'\n' order by 1) t
    from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor
    where (r.rolname like 'ffcmapp%' or u.rolname like 'ffcmapp%') and u.rolname<>'postgres'" > "$dir/members.sql"
  consulta "select 'insert into supabase_migrations.schema_migrations(version,name) values '||string_agg(format('(%L,%L)',version,name),',' order by version)||';' t from supabase_migrations.schema_migrations" > "$dir/historico.sql"
  consulta "select string_agg(g,E'\n') t from (
     select format('grant usage on schema vault to %I;',r.rolname) g from pg_roles r where r.rolname like 'ffcmapp%' and has_schema_privilege(r.oid,'vault','usage')
     union all select format('grant select on vault.decrypted_secrets to %I;',r.rolname) from pg_roles r where r.rolname like 'ffcmapp%' and has_table_privilege(r.oid,'vault.decrypted_secrets','select')
     union all select format('grant select (%I) on vault.secrets to %I;',a.attname,r.rolname) from pg_roles r cross join pg_attribute a where a.attrelid='vault.secrets'::regclass and a.attnum>0 and not a.attisdropped and r.rolname like 'ffcmapp%' and has_column_privilege(r.oid,'vault.secrets',a.attname,'select') and not has_table_privilege(r.oid,'vault.secrets','select')
     union all select format('grant execute on function %s to %I;',p.oid::regprocedure,r.rolname) from pg_roles r cross join pg_proc p where r.rolname like 'ffcmapp%' and p.pronamespace='vault'::regnamespace and has_function_privilege(r.oid,p.oid,'execute') and not has_function_privilege('public',p.oid,'execute')
     union all select format('set role postgres; grant usage on schema extensions to %I; reset role;',r.rolname) from pg_roles r where r.rolname like 'ffcmapp%' and has_schema_privilege(r.oid,'extensions','usage')) s" > "$dir/privilegios_externos.sql"
  consulta "$(cat "$projeto/supabase/tests/ensaio_producao_inventario.sql")" > "$dir/inventario_producao.txt"
  echo "PREPARADO: $dir"; exit 0
fi

[ "$modo" = ensaiar ] || { echo "MODO_INVALIDO"; exit 1; }
docker rm -f "$conteiner" >/dev/null 2>&1 || true
docker run -d --name "$conteiner" --network none -v "$projeto:/repo:ro" -v "$(cd "$dir" && pwd):/dump:ro" \
  -e POSTGRES_PASSWORD=ensaio-descartavel "$imagem" >/dev/null
[ "${MANTER:-0}" = 1 ] || trap 'docker rm -f "$conteiner" >/dev/null 2>&1 || true' EXIT
until docker exec "$conteiner" pg_isready -U postgres -h localhost >/dev/null 2>&1; do sleep 2; done; sleep 5
psql_como() { local papel=$1; shift; docker exec -i "$conteiner" psql -X -U "$papel" -h localhost -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
# Papéis criados como postgres reproduzem a membership ADMIN automática de produção (PG16+).
sed '/"supabase_admin" SET/d;/^GRANT /d' "$dir/roles.sql" | psql_como postgres >/dev/null
psql_como postgres < "$dir/members.sql"
psql_como supabase_admin < "$dir/schema.sql" >/dev/null 2>&1 || { echo "FALHA_RESTAURACAO"; exit 1; }
psql_como supabase_admin >/dev/null <<'SQL'
-- Default privileges da restauração concedem a anon/authenticated o que produção não concede.
revoke all on public.usuario from anon, authenticated;
alter table auth.users add column email_confirmed_at timestamptz;
create table auth.sessions(id uuid primary key, user_id uuid not null references auth.users(id), not_after timestamptz);
create table auth.identities(id uuid primary key default gen_random_uuid(), provider_id text not null, user_id uuid not null references auth.users(id), identity_data jsonb not null, provider text not null, unique(provider_id,provider));
alter table auth.sessions owner to supabase_auth_admin; alter table auth.identities owner to supabase_auth_admin;
grant all on auth.sessions, auth.identities to postgres;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
alter function auth.jwt() owner to supabase_auth_admin;
-- Histórico como o do CLI; o conteúdo vem de produção (historico.sql).
create schema supabase_migrations authorization postgres;
create table supabase_migrations.schema_migrations(version text primary key, statements text[], name text);
alter table supabase_migrations.schema_migrations owner to postgres;
create or replace function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
SQL
psql_como supabase_admin < "$dir/privilegios_externos.sql" >/dev/null
psql_como supabase_admin < "$dir/historico.sql" >/dev/null
local_inv=$(psql_como supabase_admin -At < "$projeto/supabase/tests/ensaio_producao_inventario.sql")
if [ "$local_inv" != "$(cat "$dir/inventario_producao.txt")" ]; then
  echo "INVENTARIO_DIVERGENTE: local=$local_inv producao=$(cat "$dir/inventario_producao.txt")"; exit 1
fi
echo "INVENTARIO_IGUAL_A_PRODUCAO: $local_inv"
for arquivo in "$@"; do
  echo "== $arquivo"
  if saida=$(psql_como supabase_admin -f "/repo/$arquivo" 2>&1); then rc=0; else rc=$?; fi
  printf '%s\n' "$saida" | grep -E 'NOTICE:  [A-Z0-9_]+_OK|ERROR|DETAIL|CONTEXT' || true
  [ "$rc" = 0 ] || { echo "FALHOU: $arquivo"; exit 1; }
done
