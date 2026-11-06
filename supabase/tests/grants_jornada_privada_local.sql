\set ON_ERROR_STOP on
\ir contato_autorizacao_local.sql
\ir ../migrations/20261109110000_barreira_edicao_paciente_privada.sql
\ir ../migrations/20261109130000_edicao_paciente_composicao.sql
\ir ../migrations/20261110200000_edicao_paciente_wrappers_privados.sql
\ir ../migrations/20261110210000_consultar_paciente_edicao_privado.sql
\ir ../migrations/20261112050000_conceder_acesso_paciente_privado.sql
\ir ../migrations/20261112060000_revogar_acesso_paciente_privado.sql
\ir ../migrations/20261112070000_owners_acesso_paciente_privado.sql
create temp table grants_antes as
 select p.oid,p.proowner,p.proacl,has_function_privilege('anon',p.oid,'execute') anon,
  has_function_privilege('service_role',p.oid,'execute') servico,
  has_function_privilege('authenticated',p.oid,'execute') autenticado
 from pg_proc p where p.oid in (
 'api.consultar_paciente_edicao_privado(jsonb)'::regprocedure,
 'api.edicao_paciente_composicao_privada(jsonb)'::regprocedure,
 'api.editar_paciente_privado(jsonb)'::regprocedure,
 'api.contato_barreira_composicao(jsonb)'::regprocedure,
 'api.criar_contato_paciente(jsonb)'::regprocedure,
 'api.conceder_acesso_paciente_privado(jsonb)'::regprocedure,
 'api.revogar_acesso_paciente_privado(jsonb)'::regprocedure);
do $$ begin
 if (select count(*) from grants_antes) <> 7 or exists(select 1 from grants_antes where autenticado or anon or servico) then raise exception 'PRECONDICAO_GRANTS'; end if;
end $$;
\ir ../drafts/20261112130000_grants_jornada_privada.sql
do $$ begin
 if exists(select 1 from grants_antes a join pg_proc p on p.oid=a.oid
  where p.proowner<>a.proowner or not has_function_privilege('authenticated',p.oid,'execute')
   or has_function_privilege('anon',p.oid,'execute') is distinct from a.anon
   or has_function_privilege('service_role',p.oid,'execute') is distinct from a.servico) then
  raise exception 'GRANTS_OU_OWNER_INCORRETOS';
 end if;
 if exists(select 1 from grants_antes a join pg_proc p on p.oid=a.oid where
  (select coalesce(jsonb_agg(to_jsonb(x) order by x.grantee,x.grantor,x.privilege_type,x.is_grantable),'[]'::jsonb)
   from aclexplode(coalesce(a.proacl,acldefault('f',a.proowner))) x where x.grantee <> 'authenticated'::regrole::oid)
  is distinct from
  (select coalesce(jsonb_agg(to_jsonb(x) order by x.grantee,x.grantor,x.privilege_type,x.is_grantable),'[]'::jsonb)
   from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x where x.grantee <> 'authenticated'::regrole::oid)) then
  raise exception 'ACL_DE_OUTROS_PAPEIS_ALTERADA';
 end if;
 if has_table_privilege('authenticated','cadastro.acesso_paciente','select')
  or has_table_privilege('authenticated','cadastro.contato_paciente','select') then
  raise exception 'ACESSO_TABELA_INDEVIDO';
 end if;
end $$;
