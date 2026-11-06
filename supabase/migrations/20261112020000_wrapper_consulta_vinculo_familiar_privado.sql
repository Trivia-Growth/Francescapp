-- Preparação privada: nenhum papel da aplicação recebe execução.
select set_config('ffcmapp.consulta_familiar_migrador', current_user, false);
do $$
begin
  if not pg_has_role(current_user, 'ffcmapp_familiar_owner', 'SET') then
    -- Não alterar opções de associação já existente.
    if exists (select 1 from pg_auth_members m
      join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member
      join pg_roles g on g.oid = m.grantor
      where r.rolname = 'ffcmapp_familiar_owner' and u.rolname = current_user
        and g.rolname = current_user) then
      raise exception 'Associação existente não permite SET ROLE';
    end if;
    execute format('grant ffcmapp_familiar_owner to %I with inherit false, set true granted by %I', current_user, current_user);
    perform set_config('ffcmapp.consulta_familiar_membership_temporaria', 'sim', false);
  else
    perform set_config('ffcmapp.consulta_familiar_membership_temporaria', 'nao', false);
  end if;
  if not has_schema_privilege('ffcmapp_familiar_owner', 'api', 'CREATE') then
    grant create on schema api to ffcmapp_familiar_owner;
    perform set_config('ffcmapp.consulta_familiar_create_temporario', 'sim', false);
  else
    perform set_config('ffcmapp.consulta_familiar_create_temporario', 'nao', false);
  end if;
end $$;

create function api.consultar_vinculo_familiar_privado(
  p_operacao_id uuid, p_request_id uuid, p_paciente_id uuid, p_familiar_id uuid
) returns jsonb language sql security definer set search_path = '' set row_security = on as $$
  select cadastro.consultar_vinculo_familiar_privado(
    p_operacao_id, p_request_id, p_paciente_id, p_familiar_id
  );
$$;
alter function api.consultar_vinculo_familiar_privado(uuid, uuid, uuid, uuid)
  owner to ffcmapp_familiar_owner;
set role ffcmapp_familiar_owner;
revoke all on function api.consultar_vinculo_familiar_privado(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.consulta_familiar_migrador'), false);
do $$
begin
  if current_setting('ffcmapp.consulta_familiar_create_temporario') = 'sim' then
    revoke create on schema api from ffcmapp_familiar_owner;
  end if;
  if current_setting('ffcmapp.consulta_familiar_membership_temporaria') = 'sim' then
    execute format('revoke ffcmapp_familiar_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;
