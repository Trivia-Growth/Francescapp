-- Libera wrappers do plano após revisão e provas no ambiente-alvo.
-- Rollback: desligar flags, executar rollback_grant_plano_cuidado.sql e reconciliar mutações em voo.
do $$
declare
 migrador text := current_user;
 item record;
 tinha_set boolean;
begin
 for item in select * from (values
  ('ffcmapp_plano_owner','api.plano_cuidado_privado(jsonb)'),
  ('ffcmapp_plano_owner','api.plano_composicao_privada(jsonb)')
 ) as alvos(owner_nome, assinatura) loop
  if not exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid=to_regprocedure(item.assinatura) and r.rolname=item.owner_nome
      and not r.rolcanlogin and not r.rolsuper and not r.rolbypassrls
      and not r.rolcreaterole and not r.rolcreatedb
      and not exists(select 1 from pg_auth_members m where m.member=r.oid)
      and p.prosecdef and 'row_security=on'=any(p.proconfig) and 'search_path=""'=any(p.proconfig)) then
   raise exception 'WRAPPER_INESPERADO: %', item.assinatura;
  end if;
  if has_function_privilege('authenticated',to_regprocedure(item.assinatura),'execute')
   or has_function_privilege('anon',to_regprocedure(item.assinatura),'execute')
   or has_function_privilege('service_role',to_regprocedure(item.assinatura),'execute') then
   raise exception 'ACL_INICIAL_INESPERADA: %', item.assinatura;
  end if;
  tinha_set := pg_has_role(migrador,item.owner_nome,'SET');
  if not tinha_set then
   if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid
     join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor
     where r.rolname=item.owner_nome and u.rolname=migrador and g.rolname=migrador) then
    raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';
   end if;
   execute format('grant %I to %I with inherit false, set true granted by %I',item.owner_nome,migrador,migrador);
  end if;
  perform set_config('role',item.owner_nome,true);
  execute format('grant execute on function %s to authenticated',item.assinatura);
  perform set_config('role',migrador,true);
  if not tinha_set then
   execute format('revoke %I from %I granted by %I',item.owner_nome,migrador,migrador);
  end if;
 end loop;
end $$;
