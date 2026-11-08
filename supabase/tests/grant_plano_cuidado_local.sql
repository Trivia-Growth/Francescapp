\set ON_ERROR_STOP on
\ir plano_composicao_local.sql
\ir ../migrations/20261108130000_plano_cuidado_paginacao_privada.sql
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
\ir ../migrations/20261112122000_plano_auditoria_obrigatoria.sql
\ir ../migrations/20261112200000_auditoria_plano_auth_nao_admitido.sql
create temp table acl_plano_antes as select oid, proacl, proowner from pg_proc where oid in ('api.plano_cuidado_privado(jsonb)'::regprocedure, 'api.plano_composicao_privada(jsonb)'::regprocedure);
create role migrador_grant_plano_fixture nologin nosuperuser nocreaterole;
grant usage on schema api to migrador_grant_plano_fixture;
grant ffcmapp_plano_owner to migrador_grant_plano_fixture with inherit false, set true;
grant migrador_grant_plano_fixture to current_user with inherit false, set true;
set role migrador_grant_plano_fixture;
\ir ../drafts/grant_plano_cuidado.sql
reset role;
do $$ begin
 if not has_function_privilege('authenticated','api.plano_composicao_privada(jsonb)','execute')
 or has_function_privilege('anon','api.plano_composicao_privada(jsonb)','execute')
 or has_function_privilege('service_role','api.plano_composicao_privada(jsonb)','execute')
 or not has_function_privilege('authenticated','api.plano_cuidado_privado(jsonb)','execute')
 or has_function_privilege('anon','api.plano_cuidado_privado(jsonb)','execute')
 or has_function_privilege('service_role','api.plano_cuidado_privado(jsonb)','execute')
 or not pg_has_role('migrador_grant_plano_fixture','ffcmapp_plano_owner','SET')
 then raise exception 'GRANT_OU_MEMBERSHIP_INCORRETO'; end if;
end $$;
set role migrador_grant_plano_fixture;
\ir ../drafts/rollback_grant_plano_cuidado.sql
reset role;
do $$ begin
 if exists(select 1 from pg_proc p cross join acl_plano_antes a where p.oid=a.oid
  and (p.proacl is distinct from a.proacl or p.proowner is distinct from a.proowner))
 or has_function_privilege('authenticated','api.plano_cuidado_privado(jsonb)','execute')
 or has_function_privilege('authenticated','api.plano_composicao_privada(jsonb)','execute')
 or not pg_has_role('migrador_grant_plano_fixture','ffcmapp_plano_owner','SET')
 then raise exception 'ROLLBACK_OU_MEMBERSHIP_INCORRETO'; end if;
end $$;

-- Grant herdado impede rollback parcial e permanece intacto.
set role migrador_grant_plano_fixture;
\ir ../drafts/grant_plano_cuidado.sql
reset role;
create role acesso_plano_extra nologin;
grant acesso_plano_extra to authenticated;
set role ffcmapp_plano_owner;
grant execute on function api.plano_composicao_privada(jsonb) to acesso_plano_extra;
reset role;
set role migrador_grant_plano_fixture;
\set ON_ERROR_STOP off
\ir ../drafts/rollback_grant_plano_cuidado.sql
\set estado_rollback :SQLSTATE
\set ON_ERROR_STOP on
reset role;
select :'estado_rollback' = 'P0001' as rejeitou_residual \gset
\if :rejeitou_residual
\else
 \quit 1
\endif
do $$ begin
 if exists(select 1 from acl_plano_antes a where not has_function_privilege('authenticated',a.oid,'execute'))
 or not has_function_privilege('acesso_plano_extra','api.plano_composicao_privada(jsonb)','execute') then
  raise exception 'ROLLBACK_PARCIAL_OU_GRANT_ALHEIO_REMOVIDO';
 end if;
end $$;
