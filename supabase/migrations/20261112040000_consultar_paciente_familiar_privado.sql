-- Preparação privada; revisão e provas reais precedem integração e ativação.
select set_config('ffcmapp.consulta_paciente_familiar_migrador', current_user, false);
do $$
begin
  if not pg_has_role(current_user, 'ffcmapp_carteira_familiar_owner', 'SET') then
    if exists (select 1 from pg_auth_members m
      join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member
      join pg_roles g on g.oid = m.grantor
      where r.rolname = 'ffcmapp_carteira_familiar_owner' and u.rolname = current_user
        and g.rolname = current_user) then
      raise exception 'Associação existente não permite SET ROLE';
    end if;
    execute format('grant ffcmapp_carteira_familiar_owner to %I with inherit false, set true granted by %I', current_user, current_user);
    perform set_config('ffcmapp.consulta_paciente_familiar_membership_temporaria', 'sim', false);
  else
    perform set_config('ffcmapp.consulta_paciente_familiar_membership_temporaria', 'nao', false);
  end if;
  if not has_schema_privilege('ffcmapp_carteira_familiar_owner', 'api', 'CREATE') then
    grant create on schema api to ffcmapp_carteira_familiar_owner;
    perform set_config('ffcmapp.consulta_paciente_familiar_create_temporario', 'sim', false);
  else
    perform set_config('ffcmapp.consulta_paciente_familiar_create_temporario', 'nao', false);
  end if;
end $$;
create policy carteira_familiar_auditoria_paciente on auditoria.evento for insert to ffcmapp_carteira_familiar_owner
  with check (ator_usuario_id = (select auth_privado.uid()) and acao = 'api.consultar_paciente_familiar' and tipo_objeto = 'paciente');
set role ffcmapp_carteira_familiar_owner;
create function api.consultar_paciente_familiar_privado(p_request_id uuid, p_paciente_id uuid)
returns jsonb language plpgsql security definer set search_path = '' set row_security = on as $$
declare
  v_ator uuid := auth_privado.uid(); v_sessao uuid; v_texto text := auth_privado.jwt()->>'session_id';
  v_autorizado boolean := false; v_paciente jsonb;
begin
  if p_request_id is null or p_paciente_id is null then
    raise exception using errcode = '22023', message = 'PARAMETRO_INVALIDO';
  end if;
  if v_texto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then v_sessao := v_texto::uuid; end if;
  if v_ator is not null and v_sessao is not null and bloqueios_auth.travar(v_ator, v_sessao) is true
    and exists (select 1 from auth_privado.sessoes() s where s.id = v_sessao and s.user_id = v_ator and (s.not_after is null or s.not_after > clock_timestamp()))
    and exists (select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'password') then
    perform 1 from public.usuario u where u.id = v_ator and u.ativo and u.perfil = 'familia' for share;
    if found then
      perform 1 from cadastro.acesso_paciente a where a.usuario_id = v_ator and a.paciente_id = p_paciente_id and a.revogada_em is null for share;
      if found then
        perform 1 from identidade.sessao s where s.session_id = v_sessao and s.usuario_id = v_ator and s.metodo = 'familia' and s.concessao_id is null and s.concessao_versao_admissao is null and s.revogada_em is null and s.encerrada_em is null for share;
        v_autorizado := found;
      end if;
    end if;
  end if;
  if v_autorizado then
    select jsonb_build_object('paciente_id', p.id, 'nome', p.nome_cifrado, 'nome_preferencia', p.nome_preferencia_cifrado, 'versao', p.versao)
      into v_paciente from cadastro.paciente p where p.id = p_paciente_id;
    v_autorizado := found and exists (select 1 from auth_privado.sessoes() s where s.id = v_sessao and s.user_id = v_ator and (s.not_after is null or s.not_after > clock_timestamp()));
  end if;
  if v_ator is not null and exists (select 1 from public.usuario u where u.id = v_ator) then
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values (gen_random_uuid(), v_ator, 'api.consultar_paciente_familiar', 'paciente', case when v_autorizado then p_paciente_id else null end, case when v_autorizado then 'permitido' else 'negado' end, p_request_id);
  end if;
  if not v_autorizado then return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', p_request_id); end if;
  return jsonb_build_object('ok', true, 'dados', v_paciente, 'request_id', p_request_id);
end $$;
revoke all on function api.consultar_paciente_familiar_privado(uuid, uuid) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.consulta_paciente_familiar_migrador'), false);
do $$
begin
  if current_setting('ffcmapp.consulta_paciente_familiar_create_temporario') = 'sim' then
    revoke create on schema api from ffcmapp_carteira_familiar_owner;
  end if;
  if current_setting('ffcmapp.consulta_paciente_familiar_membership_temporaria') = 'sim' then
    execute format('revoke ffcmapp_carteira_familiar_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;
