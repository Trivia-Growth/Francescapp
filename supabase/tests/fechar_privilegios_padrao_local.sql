-- Prova local da tarefa 2.2: privilégio padrão de PUBLIC fechado para funções futuras
-- criadas pelo migrador (postgres), em qualquer schema. Roda como o próprio superusuário
-- "postgres" do cluster descartável, igual ao papel usado para migrar no projeto real.
create schema identidade;
create schema cadastro;
create schema auditoria;
create schema operacao;
create schema bloqueios_auth;
create schema auth_privado;
create schema api;

-- Antes da migration: função nova sem revoke explícito nasce executável por PUBLIC (comportamento padrão do PostgreSQL).
create function identidade.antes_da_migration() returns boolean language sql as $$ select true $$;
do $$ begin
  if not has_function_privilege('public', 'identidade.antes_da_migration()', 'EXECUTE') then
    raise exception 'PRE_CONDICAO_FALHOU: esperava PUBLIC executar por padrão antes da migration';
  end if;
end $$;
drop function identidade.antes_da_migration();

-- Aplica a migration sob prova (escopo global por papel: testado isoladamente que `IN
-- SCHEMA`, com GRANT ou REVOKE, nunca exclui o PUBLIC embutido em funções nesta versão do
-- PostgreSQL -- só o REVOKE global do papel funciona de verdade).
alter default privileges for role postgres
revoke execute on functions from public;

do $$ begin
  if (select count(*) from pg_default_acl where defaclrole='postgres'::regrole and defaclobjtype='f' and defaclnamespace=0)<>1 then
    raise exception 'MIGRATION_NAO_REGISTROU_DEFAULT_ACL_GLOBAL';
  end if;
end $$;

-- Depois da migration: função nova sem revoke explícito, em qualquer um dos sete schemas do
-- projeto (e em public, já que o escopo é por papel, não por schema), nasce sem EXECUTE
-- para PUBLIC (nem para anon/authenticated/service_role, que herdam de PUBLIC); o dono
-- (postgres) continua podendo executar a própria função.
create role anon_fixture_2_2 noinherit nologin;
create role authenticated_fixture_2_2 noinherit nologin;
create role service_role_fixture_2_2 noinherit nologin;
do $$
declare v_schema text; v_funcao text;
begin
  foreach v_schema in array array['identidade','cadastro','auditoria','operacao','bloqueios_auth','auth_privado','api','public'] loop
    execute format('create function %I.funcao_sem_revoke_explicito() returns boolean language sql as $f$ select true $f$', v_schema);
    v_funcao := format('%I.funcao_sem_revoke_explicito()', v_schema);
    if has_function_privilege('public', v_funcao, 'EXECUTE')
      or has_function_privilege('anon_fixture_2_2', v_funcao, 'EXECUTE')
      or has_function_privilege('authenticated_fixture_2_2', v_funcao, 'EXECUTE')
      or has_function_privilege('service_role_fixture_2_2', v_funcao, 'EXECUTE') then
      raise exception 'DEFAULT_NAO_FECHADO em %', v_schema;
    end if;
    if not has_function_privilege(current_user, v_funcao, 'EXECUTE') then
      raise exception 'DONO_PERDEU_EXECUCAO em %', v_schema;
    end if;
    execute format('drop function %I.funcao_sem_revoke_explicito()', v_schema);
  end loop;
end $$;
drop role anon_fixture_2_2;
drop role authenticated_fixture_2_2;
drop role service_role_fixture_2_2;
