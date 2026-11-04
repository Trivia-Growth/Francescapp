-- Cadastro vazio: o provisionamento e a concessão de EXECUTE são operações separadas.
-- A identidade é o login da conexão, nunca um argumento ou SET ROLE.
create role ffcmapp_operador_resolver_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create table auditoria.operador_tecnico (
 codigo text primary key check (codigo ~ '^op_[0-9a-f]{32}$'),
 papel_oid oid not null unique,
 papel_nome name not null unique,
 ativo boolean not null default false
);
alter table auditoria.operador_tecnico enable row level security;
revoke all on auditoria.operador_tecnico from public, anon, authenticated, service_role;
grant usage on schema auditoria to ffcmapp_operador_resolver_owner;
grant select (codigo,papel_oid,papel_nome,ativo), update (ativo) on auditoria.operador_tecnico to ffcmapp_operador_resolver_owner;
create policy operador_resolver_leitura on auditoria.operador_tecnico for select to ffcmapp_operador_resolver_owner using (true);
create policy operador_resolver_lock on auditoria.operador_tecnico for update to ffcmapp_operador_resolver_owner using (true) with check (false);

-- Criação sob owner sem login, com CREATE e membership temporários.
select set_config('ffcmapp.operador_migrador', current_user, false);
grant ffcmapp_operador_resolver_owner to current_user;
grant create on schema auditoria to ffcmapp_operador_resolver_owner;
set role ffcmapp_operador_resolver_owner;
create function auditoria.operador_tecnico_atual() returns text
language plpgsql security definer set search_path = '' as $$
declare v_codigo text;
begin
 select o.codigo into v_codigo from auditoria.operador_tecnico o
 join pg_catalog.pg_roles r on r.oid=o.papel_oid and r.rolname=o.papel_nome
 where r.rolname=session_user and r.rolcanlogin and o.ativo
 for share of o;
 if not found then raise exception using errcode='42501', message='OPERADOR_NAO_AUTORIZADO'; end if;
 return v_codigo;
end $$;
revoke all on function auditoria.operador_tecnico_atual() from public, anon, authenticated, service_role;
reset role;
revoke create on schema auditoria from ffcmapp_operador_resolver_owner;
do $$ begin execute format('revoke ffcmapp_operador_resolver_owner from %I',current_setting('ffcmapp.operador_migrador')); end $$;
