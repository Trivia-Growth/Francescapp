-- Operação explícita da coordenação; usar login técnico JÁ existente do pool.
-- psql -v runtime_login=<nome> -f scripts/autorizar-agenda-executor.sql
\set ON_ERROR_STOP on
begin;
select set_config('ffcmapp.agenda_runtime_login', :'runtime_login', true);
do $$
declare alvo text:=current_setting('ffcmapp.agenda_runtime_login');
begin
 if not exists(select 1 from pg_roles where rolname=alvo and rolcanlogin and not rolsuper
   and not rolbypassrls and not rolcreaterole and not rolcreatedb)
   or alvo in ('anon','authenticated','service_role')
   or not pg_has_role(alvo,'ffcmapp_vault_executor','SET')
   or has_table_privilege(alvo,'vault.decrypted_secrets','SELECT')
   or has_column_privilege(alvo,'vault.secrets','secret','SELECT')
   or pg_has_role(alvo,'ffcmapp_agenda_google_owner','MEMBER')
   or pg_has_role(alvo,'ffcmapp_agenda_vault_owner','MEMBER') then
  raise exception 'LOGIN_POOL_INCOMPATIVEL_COM_AGENDA';
 end if;
 if not exists(select 1 from pg_roles where rolname='ffcmapp_agenda_google_executor' and not rolcanlogin
   and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb)
   or not has_function_privilege('ffcmapp_agenda_google_executor','identidade.agenda_google_operacao_privada(jsonb,text)','EXECUTE')
   or has_table_privilege('ffcmapp_agenda_google_executor','vault.decrypted_secrets','SELECT') then
  raise exception 'EXECUTOR_AGENDA_INCOMPATIVEL';
 end if;
 execute format('grant ffcmapp_agenda_google_executor to %I with inherit false, set true',alvo);
end $$;
commit;
