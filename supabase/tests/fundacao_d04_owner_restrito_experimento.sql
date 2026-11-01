-- Experimento autônomo, exclusivamente em PostgreSQL descartável.
-- Não é migração; não comprova Supabase, Vault ou autorização do usuário final.
\set ON_ERROR_STOP on
begin;
create role d04_teste_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role d04_teste_runtime nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role d04_teste_anon nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create schema d04_teste;
revoke all on schema d04_teste from public;
grant usage on schema d04_teste to d04_teste_owner, d04_teste_runtime, d04_teste_anon;
create table d04_teste.credencial (id integer primary key, estado text not null);
alter table d04_teste.credencial enable row level security;
alter table d04_teste.credencial force row level security;
revoke all on d04_teste.credencial from public, d04_teste_runtime, d04_teste_anon;
grant select, update on d04_teste.credencial to d04_teste_owner;
create policy owner_select on d04_teste.credencial for select to d04_teste_owner using (true);
create policy owner_update on d04_teste.credencial for update to d04_teste_owner using (true) with check (true);
insert into d04_teste.credencial values (1, 'disponivel'), (2, 'incerta');

-- PostgreSQL exige CREATE no schema ao transferir a propriedade da função.
grant create on schema d04_teste to d04_teste_owner;
create function d04_teste.iniciar(p_id integer) returns boolean
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  update d04_teste.credencial set estado = 'em_troca'
    where id = p_id and estado = 'disponivel';
  return found;
end $$;
alter function d04_teste.iniciar(integer) owner to d04_teste_owner;
revoke create on schema d04_teste from d04_teste_owner;
revoke all on function d04_teste.iniciar(integer) from public, d04_teste_anon;
grant execute on function d04_teste.iniciar(integer) to d04_teste_runtime;

do $$ begin
  if pg_has_role('d04_teste_runtime', 'd04_teste_owner', 'MEMBER')
    or has_table_privilege('d04_teste_runtime', 'd04_teste.credencial', 'SELECT')
    or has_table_privilege('d04_teste_runtime', 'd04_teste.credencial', 'UPDATE')
    or has_function_privilege('d04_teste_anon', 'd04_teste.iniciar(integer)', 'EXECUTE')
    or has_schema_privilege('d04_teste_owner', 'd04_teste', 'CREATE') then
    raise exception 'fronteira de privilégios inválida';
  end if;
end $$;

set local role d04_teste_runtime;
do $$ begin
  begin
    perform * from d04_teste.credencial;
    raise exception 'runtime leu credencial diretamente';
  exception when insufficient_privilege then null; end;
  begin
    update d04_teste.credencial set estado = 'disponivel' where id = 2;
    raise exception 'runtime alterou credencial diretamente';
  exception when insufficient_privilege then null; end;
  if not d04_teste.iniciar(1) or d04_teste.iniciar(1) or d04_teste.iniciar(2)
    or d04_teste.iniciar(999) then
    raise exception 'transição controlada falhou';
  end if;
end $$;
reset role;
set local role d04_teste_anon;
do $$ begin
  begin
    perform d04_teste.iniciar(1);
    raise exception 'anon executou função';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
