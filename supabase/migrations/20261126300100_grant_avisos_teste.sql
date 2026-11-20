-- PREPARAÇÃO LOCAL. Não aplicar antes de validar/revisar a fatia e autorizar ativação.
-- Padrão de 20261126100100_grant_substituicao_cm_teste.sql; falha diante de ACL desconhecida.
-- Libera somente EXECUTE do wrapper api.avisos_privado para authenticated.
-- Nenhum grant de tabela, Vault, operacao interna, ownership ou membership para papel da
-- aplicação. A autorização continua no banco: perfil, concessão, atestado, sessão e a
-- audiência de cadastro.acesso_paciente.
-- Rollback: revoke execute on function api.avisos_privado(jsonb) from authenticated;
do $$
declare
  migrador text := current_user;
  assinatura text := 'api.avisos_privado(jsonb)';
  tinha_set boolean;
begin
  if not exists(select 1 from pg_proc p join pg_roles r on r.oid = p.proowner
    where p.oid = to_regprocedure(assinatura) and r.rolname = 'ffcmapp_avisos_owner'
      and not r.rolcanlogin and not r.rolsuper and not r.rolbypassrls
      and not r.rolcreaterole and not r.rolcreatedb
      and not exists(select 1 from pg_auth_members m where m.member = r.oid)
      and p.prokind = 'f' and p.prorettype = 'jsonb'::regtype and p.pronargs = 1
      and p.proargtypes[0] = 'jsonb'::regtype
      and cardinality(p.proconfig) = 2 and p.prosecdef
      and 'row_security=on' = any(p.proconfig) and 'search_path=""' = any(p.proconfig)) then
    raise exception 'WRAPPER_INESPERADO: %', assinatura;
  end if;
  if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      where p.oid = to_regprocedure(assinatura) and (acl.grantee <> p.proowner or acl.privilege_type <> 'EXECUTE' or acl.is_grantable))
    or has_function_privilege('authenticated', to_regprocedure(assinatura), 'execute')
    or has_function_privilege('anon', to_regprocedure(assinatura), 'execute')
    or has_function_privilege('service_role', to_regprocedure(assinatura), 'execute') then
    raise exception 'ACL_INICIAL_INESPERADA: %', assinatura;
  end if;
  tinha_set := pg_has_role(migrador, 'ffcmapp_avisos_owner', 'SET');
  if not tinha_set then
    if exists(select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid
      join pg_roles u on u.oid = m.member join pg_roles g on g.oid = m.grantor
      where r.rolname = 'ffcmapp_avisos_owner' and u.rolname = migrador and g.rolname = migrador) then
      raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant %I to %I with inherit false, set true granted by %I', 'ffcmapp_avisos_owner', migrador, migrador);
  end if;
  perform set_config('role', 'ffcmapp_avisos_owner', true);
  execute format('grant execute on function %s to authenticated', assinatura);
  perform set_config('role', migrador, true);
  if not tinha_set then
    execute format('revoke %I from %I granted by %I', 'ffcmapp_avisos_owner', migrador, migrador);
  end if;
end $$;
