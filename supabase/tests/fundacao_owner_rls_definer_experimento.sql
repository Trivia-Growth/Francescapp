-- SQL exclusivamente experimental: owner de função separado do owner da tabela.
-- Não comprova JWT, gateway, Supabase, provisionamento nem políticas finais.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database() <> 'ffcm_owner_fixture' or inet_server_addr() is not null
   or current_setting('unix_socket_directories') not like '/tmp/ffcm-admissao.%' then
   raise exception 'cluster e banco descartáveis obrigatórios';
 end if;
end $$;
create role d06_func_owner_fixture nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role d06_executor_fixture nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create schema d06_definer_fixture;
revoke all on schema d06_definer_fixture from public,anon,authenticated;
create table d06_definer_fixture.seguro(id integer primary key, valor text not null);
insert into d06_definer_fixture.seguro values(1,'dado-ficticio-permitido'),(2,'dado-ficticio-negado');
alter table d06_definer_fixture.seguro enable row level security;
alter table d06_definer_fixture.seguro force row level security;
revoke all on d06_definer_fixture.seguro from public,anon,authenticated,d06_executor_fixture;
grant usage,create on schema d06_definer_fixture to d06_func_owner_fixture;
grant usage on schema d06_definer_fixture to d06_executor_fixture,anon,authenticated;
grant select(id,valor) on d06_definer_fixture.seguro to d06_func_owner_fixture;
create policy func_owner_select on d06_definer_fixture.seguro for select to d06_func_owner_fixture using(id=1);
set local role d06_func_owner_fixture;
alter default privileges revoke execute on functions from public;
create function d06_definer_fixture.consultar(p_id integer) returns text
 language sql security definer set search_path=pg_catalog,pg_temp as $$
 select s.valor from d06_definer_fixture.seguro s where s.id=p_id
 $$;
reset role;
revoke create on schema d06_definer_fixture from d06_func_owner_fixture;
revoke all on function d06_definer_fixture.consultar(integer) from public,anon,authenticated;
grant execute on function d06_definer_fixture.consultar(integer) to d06_executor_fixture;

do $$ begin
 if pg_has_role('d06_executor_fixture','d06_func_owner_fixture','member')
   or has_schema_privilege('d06_func_owner_fixture','d06_definer_fixture','create')
   or has_table_privilege('d06_executor_fixture','d06_definer_fixture.seguro','select')
   or has_column_privilege('d06_executor_fixture','d06_definer_fixture.seguro','valor','select')
   or has_column_privilege('d06_executor_fixture','d06_definer_fixture.seguro','id','select')
   or has_column_privilege('anon','d06_definer_fixture.seguro','id','select')
   or has_column_privilege('anon','d06_definer_fixture.seguro','valor','select')
   or has_column_privilege('authenticated','d06_definer_fixture.seguro','id','select')
   or has_column_privilege('authenticated','d06_definer_fixture.seguro','valor','select')
   or has_function_privilege('anon','d06_definer_fixture.consultar(integer)','execute')
   or has_function_privilege('authenticated','d06_definer_fixture.consultar(integer)','execute')
   or not exists(select 1 from pg_proc where oid='d06_definer_fixture.consultar(integer)'::regprocedure
     and proowner='d06_func_owner_fixture'::regrole and prosecdef
     and proconfig @> array['search_path=pg_catalog, pg_temp'])
 then raise exception 'privilégios ou contrato da função incorretos'; end if;
end $$;
set local role d06_executor_fixture;
do $$ begin
 if d06_definer_fixture.consultar(1) is distinct from 'dado-ficticio-permitido'
   or d06_definer_fixture.consultar(2) is not null then raise exception 'RLS não limitou função'; end if;
 begin perform valor from d06_definer_fixture.seguro; raise exception 'leitura direta permitida';
 exception when insufficient_privilege then null; end;
 begin perform id from d06_definer_fixture.seguro; raise exception 'leitura direta de id permitida';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform d06_definer_fixture.consultar(1); raise exception 'anon executou função';
 exception when insufficient_privilege then null; end;
 begin perform id from d06_definer_fixture.seguro; raise exception 'anon leu id';
 exception when insufficient_privilege then null; end;
 begin perform valor from d06_definer_fixture.seguro; raise exception 'anon leu valor';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin perform d06_definer_fixture.consultar(1); raise exception 'authenticated executou função';
 exception when insufficient_privilege then null; end;
 begin perform id from d06_definer_fixture.seguro; raise exception 'authenticated leu id';
 exception when insufficient_privilege then null; end;
 begin perform valor from d06_definer_fixture.seguro; raise exception 'authenticated leu valor';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
