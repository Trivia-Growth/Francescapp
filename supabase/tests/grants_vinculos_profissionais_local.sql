\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
\ir ../migrations/20261109100000_editar_paciente_privado.sql
\ir ../migrations/20261112050000_conceder_acesso_paciente_privado.sql
\ir ../migrations/20261112060000_revogar_acesso_paciente_privado.sql
\ir ../migrations/20261112070000_owners_acesso_paciente_privado.sql
\ir ../migrations/20261112170000_listar_vinculos_profissionais_privado.sql
\ir ../migrations/20261112180000_barreira_acesso_paciente.sql
create temp table acl_vinculos as select oid, proowner, proacl from pg_proc where oid in (
 'api.conceder_acesso_paciente_privado(jsonb)'::regprocedure,
 'api.revogar_acesso_paciente_privado(jsonb)'::regprocedure,
 'api.listar_vinculos_profissionais_privado(uuid,uuid,uuid)'::regprocedure,
 'api.acesso_barreira_composicao(jsonb)'::regprocedure);
create role migrador_grants_vinculos nologin nosuperuser nocreaterole;
grant usage on schema api to migrador_grants_vinculos;
grant ffcmapp_conceder_acesso_owner, ffcmapp_revogar_acesso_owner, ffcmapp_listar_vinculos_owner, ffcmapp_acesso_barreira_owner to migrador_grants_vinculos with inherit false, set true;
grant migrador_grants_vinculos to current_user with inherit false, set true;
set role migrador_grants_vinculos;
\ir ../drafts/20261112190000_grants_vinculos_profissionais.sql
reset role;
do $$ begin
 if (select count(*) from acl_vinculos) <> 4 or exists(select 1 from acl_vinculos a where
  not has_function_privilege('authenticated',a.oid,'execute') or has_function_privilege('anon',a.oid,'execute') or has_function_privilege('service_role',a.oid,'execute')) then raise exception 'GRANTS_INCORRETOS'; end if;
 if has_table_privilege('authenticated','cadastro.acesso_paciente','select') then raise exception 'TABELA_EXPOSTA'; end if;
end $$;
set role migrador_grants_vinculos;
\ir ../drafts/20261112190100_rollback_grants_vinculos_profissionais.sql
reset role;
do $$ begin
 if exists(select 1 from acl_vinculos a join pg_proc p on p.oid=a.oid where p.proowner<>a.proowner or p.proacl is distinct from a.proacl or has_function_privilege('authenticated',p.oid,'execute')) then raise exception 'ROLLBACK_INCORRETO'; end if;
end $$;

-- Grant herdado adicional impede rollback parcial e preserva o grant alheio.
set role migrador_grants_vinculos;
\ir ../drafts/20261112190000_grants_vinculos_profissionais.sql
reset role;
create role acesso_vinculo_extra nologin;
grant acesso_vinculo_extra to authenticated;
set role ffcmapp_acesso_barreira_owner;
grant execute on function api.acesso_barreira_composicao(jsonb) to acesso_vinculo_extra;
reset role;
set role migrador_grants_vinculos;
\set ON_ERROR_STOP off
\ir ../drafts/20261112190100_rollback_grants_vinculos_profissionais.sql
\set estado_rollback :SQLSTATE
\set ON_ERROR_STOP on
reset role;
select :'estado_rollback' = 'P0001' as rejeitou_residual \gset
\if :rejeitou_residual
\else
 \quit 1
\endif
do $$ begin
 if exists(select 1 from acl_vinculos a where not has_function_privilege('authenticated',a.oid,'execute'))
  or not has_function_privilege('acesso_vinculo_extra','api.acesso_barreira_composicao(jsonb)','execute') then
  raise exception 'ROLLBACK_PARCIAL_OU_GRANT_ALHEIO_REMOVIDO';
 end if;
end $$;
