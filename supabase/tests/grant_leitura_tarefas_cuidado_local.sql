\set ON_ERROR_STOP on
\ir tarefa_rls_local.sql
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
\ir ../migrations/20261112270000_auditoria_tarefas_auth_nao_admitido.sql
\ir ../migrations/20261112280000_leitura_tarefas_cuidado_privada.sql
create temp table tarefas_acl_antes as select oid,proacl,proowner from pg_proc where oid in ('api.tarefa_cuidado_privado(jsonb)'::regprocedure,'api.tarefa_cuidado_operacao_privada(jsonb)'::regprocedure,'api.ler_tarefas_cuidado_privado(jsonb)'::regprocedure);
create role tarefas_grant_migrador nologin nosuperuser nocreaterole;
grant usage on schema api to tarefas_grant_migrador;
grant ffcmapp_tarefa_owner to tarefas_grant_migrador with inherit false, set true;
grant tarefas_grant_migrador to current_user with inherit false, set true;
set role tarefas_grant_migrador;
\ir ../drafts/grant_leitura_tarefas_cuidado.sql
reset role;
do $$ begin
 if not has_function_privilege('authenticated','api.ler_tarefas_cuidado_privado(jsonb)','execute') or has_function_privilege('anon','api.ler_tarefas_cuidado_privado(jsonb)','execute') or has_function_privilege('service_role','api.ler_tarefas_cuidado_privado(jsonb)','execute') or has_function_privilege('authenticated','api.tarefa_cuidado_privado(jsonb)','execute') or has_function_privilege('authenticated','api.tarefa_cuidado_operacao_privada(jsonb)','execute') then raise exception 'GRANT_INCORRETO'; end if;
end $$;
set role tarefas_grant_migrador;
\ir ../drafts/rollback_grant_leitura_tarefas_cuidado.sql
reset role;
do $$ begin
 if exists(select 1 from tarefas_acl_antes a join pg_proc p on p.oid=a.oid where p.proacl is distinct from a.proacl or p.proowner is distinct from a.proowner) or not pg_has_role('tarefas_grant_migrador','ffcmapp_tarefa_owner','SET') then raise exception 'ROLLBACK_INCORRETO'; end if;
end $$;
-- O grant deve falhar fechado caso a RPC compartilhada esteja exposta.
set role ffcmapp_tarefa_owner;
grant execute on function api.tarefa_cuidado_privado(jsonb) to authenticated;
reset role;
set role tarefas_grant_migrador;
\set ON_ERROR_STOP off
\ir ../drafts/grant_leitura_tarefas_cuidado.sql
\set estado_guard :SQLSTATE
\set ON_ERROR_STOP on
reset role;
select :'estado_guard' = 'P0001' as rejeitou_escrita \gset
\if :rejeitou_escrita
\else
 \quit 1
\endif
do $$ begin if has_function_privilege('authenticated','api.ler_tarefas_cuidado_privado(jsonb)','execute') then raise exception 'GRANT_LEITURA_COM_ESCRITA_ABERTA'; end if; end $$;
set role ffcmapp_tarefa_owner;
revoke execute on function api.tarefa_cuidado_privado(jsonb) from authenticated;
reset role;
set role tarefas_grant_migrador;
\ir ../drafts/grant_leitura_tarefas_cuidado.sql
reset role;
create role tarefas_grant_extra nologin;
grant tarefas_grant_extra to authenticated;
set role ffcmapp_tarefa_owner;
grant execute on function api.ler_tarefas_cuidado_privado(jsonb) to tarefas_grant_extra;
reset role;
set role tarefas_grant_migrador;
\set ON_ERROR_STOP off
\ir ../drafts/rollback_grant_leitura_tarefas_cuidado.sql
\set estado_rollback :SQLSTATE
\set ON_ERROR_STOP on
reset role;
select :'estado_rollback' = 'P0001' as rejeitou_residual \gset
\if :rejeitou_residual
\else
 \quit 1
\endif
do $$ begin if not has_function_privilege('authenticated','api.ler_tarefas_cuidado_privado(jsonb)','execute') or not has_function_privilege('tarefas_grant_extra','api.ler_tarefas_cuidado_privado(jsonb)','execute') or has_function_privilege('authenticated','api.tarefa_cuidado_privado(jsonb)','execute') then raise exception 'GRANT_ALHEIO_OU_ESCRITA'; end if; end $$;
