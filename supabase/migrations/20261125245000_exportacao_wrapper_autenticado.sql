-- FR-032/066: restore only the authenticated public export wrapper after203900.
-- Additive local migration; function bodies and historical migrations remain unchanged.
begin;
do $$
declare
  migrador text := current_user;
  item record;
  tinha_set boolean;
  antes record;
  membros jsonb;
  schemas jsonb;
begin
  select jsonb_agg(to_jsonb(m) order by roleid,member,grantor) into membros from pg_auth_members m;
  select jsonb_agg(to_jsonb(n) order by oid) into schemas from (select oid,nspacl from pg_namespace) n;
  select prosrc,proowner,proconfig,proargtypes,prorettype,proacl into antes from pg_proc where oid='api.exportacao_operacao_privada(jsonb)'::regprocedure;
  for item in select * from (values
    ('ffcmapp_exportacao_owner', 'api.exportacao_operacao_privada(jsonb)')
  ) as alvos(owner_nome, assinatura) loop
    if not exists(select 1 from pg_proc p join pg_roles r on r.oid = p.proowner
      where p.oid = to_regprocedure(item.assinatura) and r.rolname = item.owner_nome
        and not r.rolcanlogin and not r.rolsuper and not r.rolbypassrls
        and not r.rolcreaterole and not r.rolcreatedb
        and not exists(select 1 from pg_auth_members m where m.member = r.oid)
        and p.prosecdef and 'row_security=on' = any(p.proconfig) and 'search_path=""' = any(p.proconfig)) then
      raise exception 'WRAPPER_INESPERADO: %', item.assinatura;
    end if;
    if has_function_privilege('authenticated', to_regprocedure(item.assinatura), 'execute')
      or has_function_privilege('anon', to_regprocedure(item.assinatura), 'execute')
      or has_function_privilege('service_role', to_regprocedure(item.assinatura), 'execute') then
      raise exception 'ACL_INICIAL_INESPERADA: %', item.assinatura;
    end if;
    tinha_set := pg_has_role(migrador, item.owner_nome, 'SET');
    if not tinha_set then
      if exists(select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid
        join pg_roles u on u.oid = m.member join pg_roles g on g.oid = m.grantor
        where r.rolname = item.owner_nome and u.rolname = migrador and g.rolname = migrador) then
        raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';
      end if;
      execute format('grant %I to %I with inherit false, set true granted by %I', item.owner_nome, migrador, migrador);
    end if;
    perform set_config('role', item.owner_nome, true);
    execute format('grant execute on function %s to authenticated', item.assinatura);
    if not exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid=to_regprocedure(item.assinatura) and a.grantor=p.proowner and a.grantee='authenticated'::regrole and a.privilege_type='EXECUTE' and not a.is_grantable) then raise exception 'EXPORTACAO_GRANT_INESPERADO';end if;
    perform set_config('role', migrador, true);
    if not tinha_set then
      execute format('revoke %I from %I granted by %I', item.owner_nome, migrador, migrador);
    end if;
  end loop;
  if membros is distinct from (select jsonb_agg(to_jsonb(m) order by roleid,member,grantor) from pg_auth_members m) or schemas is distinct from (select jsonb_agg(to_jsonb(n) order by oid) from (select oid,nspacl from pg_namespace) n) then raise exception 'EXPORTACAO_MEMBERSHIP_SCHEMA_ALTERADOS';end if;
  if exists(select 1 from pg_proc p where p.oid='api.exportacao_operacao_privada(jsonb)'::regprocedure and row(p.prosrc,p.proowner,p.proconfig,p.proargtypes,p.prorettype) is distinct from row(antes.prosrc,antes.proowner,antes.proconfig,antes.proargtypes,antes.prorettype)) then raise exception 'EXPORTACAO_CONTRATO_ALTERADO';end if;
  if (select count(*) from (select a.* from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid='api.exportacao_operacao_privada(jsonb)'::regprocedure except select * from aclexplode(coalesce(antes.proacl,acldefault('f',antes.proowner)))) delta)<>1 then raise exception 'EXPORTACAO_ACL_DELTA_INESPERADO';end if;
  if exists(select * from aclexplode(coalesce(antes.proacl,acldefault('f',antes.proowner))) except select a.* from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid='api.exportacao_operacao_privada(jsonb)'::regprocedure) then raise exception 'EXPORTACAO_ACL_REMOVIDA';end if;
end $$;
commit;
