-- RPCs autenticadas, com autorização, atestado e auditoria no banco.
-- A aplicação e as rotas continuam desativadas até revisão e provas de ativação.
select set_config('ffcmapp.migrador_rpc_cadastro', current_user, false);
select set_config('ffcmapp.rpc_cadastro_tinha_owner', pg_has_role(current_user, 'ffcmapp_api_cadastro_owner', 'SET')::text, false);
do $$ begin
  if current_setting('ffcmapp.rpc_cadastro_tinha_owner')='false' then
    if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid
      join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor
      where r.rolname='ffcmapp_api_cadastro_owner' and u.rolname=current_user and g.rolname=current_user) then
      raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant ffcmapp_api_cadastro_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  end if;
end $$;
set role ffcmapp_api_cadastro_owner;
grant execute on function api.criar_paciente(jsonb), api.cadastro_composicao(jsonb) to authenticated;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_rpc_cadastro'), false);
do $$ begin
  if current_setting('ffcmapp.rpc_cadastro_tinha_owner')='false' then
    execute format('revoke ffcmapp_api_cadastro_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;
