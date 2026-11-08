\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
\ir ../migrations/20261112080000_listar_concessoes_equipe_privado.sql
\ir ../migrations/20261112090000_owner_listar_concessoes_equipe_privado.sql
create temp table equipe_acl_antes as select oid,proacl,proowner from pg_proc where oid='api.listar_concessoes_equipe_privado(jsonb)'::regprocedure;
create role equipe_grant_migrador nologin nosuperuser nocreaterole;
grant usage on schema api to equipe_grant_migrador;
grant ffcmapp_listar_equipe_owner to equipe_grant_migrador with inherit false, set true;
grant equipe_grant_migrador to current_user with inherit false, set true;
set role equipe_grant_migrador;
\ir ../drafts/grant_listar_concessoes_equipe.sql
reset role;
do $$ begin
 if not has_function_privilege('authenticated','api.listar_concessoes_equipe_privado(jsonb)','execute') or has_function_privilege('anon','api.listar_concessoes_equipe_privado(jsonb)','execute') or has_function_privilege('service_role','api.listar_concessoes_equipe_privado(jsonb)','execute') or has_table_privilege('authenticated','identidade.concessao_equipe','select') then raise exception 'GRANT_INCORRETO'; end if;
end $$;
set role equipe_grant_migrador;
\ir ../drafts/rollback_grant_listar_concessoes_equipe.sql
reset role;
do $$ begin
 if exists(select 1 from equipe_acl_antes a join pg_proc p on p.oid=a.oid where p.proacl is distinct from a.proacl or p.proowner is distinct from a.proowner) or has_function_privilege('authenticated','api.listar_concessoes_equipe_privado(jsonb)','execute') or not pg_has_role('equipe_grant_migrador','ffcmapp_listar_equipe_owner','SET') then raise exception 'ROLLBACK_INCORRETO'; end if;
end $$;
set role equipe_grant_migrador;
\ir ../drafts/grant_listar_concessoes_equipe.sql
reset role;
create role equipe_grant_extra nologin;
grant equipe_grant_extra to authenticated;
set role ffcmapp_listar_equipe_owner;
grant execute on function api.listar_concessoes_equipe_privado(jsonb) to equipe_grant_extra;
reset role;
set role equipe_grant_migrador;
\set ON_ERROR_STOP off
\ir ../drafts/rollback_grant_listar_concessoes_equipe.sql
\set estado_rollback :SQLSTATE
\set ON_ERROR_STOP on
reset role;
select :'estado_rollback' = 'P0001' as rejeitou_residual \gset
\if :rejeitou_residual
\else
 \quit 1
\endif
do $$ begin if not has_function_privilege('authenticated','api.listar_concessoes_equipe_privado(jsonb)','execute') or not has_function_privilege('equipe_grant_extra','api.listar_concessoes_equipe_privado(jsonb)','execute') then raise exception 'GRANT_ALHEIO_REMOVIDO'; end if; end $$;
