-- Preparação privada: reutiliza roteamento nativo por método autenticado.
-- Não ativa rota ou concessões; requer revisão e provas de autorização.
-- Preparação privada, sem grants ou rota. Exige revisão independente e provas
-- reais de autorização, concorrência e revogação antes de qualquer integração.
-- p_operacao_id identifica a concessão: repetição não restaura vínculo revogado.
create or replace function cadastro.conceder_acesso_familiar_privado(
  p_operacao_id uuid, p_request_id uuid, p_paciente_id uuid,
  p_familiar_id uuid, p_motivo_cifrado jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_sessao jsonb;
  v_ator uuid := auth_privado.uid();
  v_existente cadastro.acesso_paciente;
  v_id uuid;
begin
  if p_operacao_id is null or p_request_id is null or p_paciente_id is null
    or p_familiar_id is null or p_motivo_cifrado is null then
    raise exception using errcode = '22004', message = 'PARAMETRO_OBRIGATORIO';
  end if;

  -- A consulta mantém os bloqueios da sessão e da concessão até o commit.
  v_sessao := api.consultar_sessao_nativa(p_request_id);
  if v_sessao is null or v_sessao #>> '{usuario,perfil}' is distinct from 'administrador'
    or v_sessao #>> '{usuario,id}' is distinct from v_ator::text then
    return jsonb_build_object('ok', false, 'codigo', 'sem_permissao');
  end if;

  -- Serializa concessões para a mesma identidade; perfil de equipe nunca muda.
  perform 1 from public.usuario u where u.id = p_familiar_id
    and u.perfil = 'familia' and u.ativo for update;
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'familiar_indisponivel');
  end if;
  perform 1 from cadastro.paciente p where p.id = p_paciente_id for share;
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'paciente_indisponivel');
  end if;

  select * into v_existente from cadastro.acesso_paciente a
    where a.id = p_operacao_id for update;
  if found then
    if v_existente.paciente_id is distinct from p_paciente_id
      or v_existente.usuario_id is distinct from p_familiar_id
      or v_existente.concedido_por_usuario_id is distinct from v_ator
      or v_existente.motivo_concessao_cifrado is distinct from p_motivo_cifrado then
      return jsonb_build_object('ok', false, 'codigo', 'operacao_divergente');
    end if;
    if v_existente.revogada_em is not null then
      return jsonb_build_object('ok', false, 'codigo', 'acesso_revogado');
    end if;
    v_id := v_existente.id;
  else
    if exists (select 1 from cadastro.acesso_paciente a where a.usuario_id = p_familiar_id
      and a.paciente_id = p_paciente_id and a.revogada_em is null) then
      return jsonb_build_object('ok', false, 'codigo', 'acesso_ja_existente');
    end if;
    insert into cadastro.acesso_paciente(id, paciente_id, usuario_id,
      concedido_por_usuario_id, motivo_concessao_cifrado)
      values (p_operacao_id, p_paciente_id, p_familiar_id, v_ator, p_motivo_cifrado);
    v_id := p_operacao_id;
  end if;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values (gen_random_uuid(), v_ator, 'conceder_acesso_familiar', 'acesso_paciente', v_id, 'permitido', p_request_id);
  return jsonb_build_object('ok', true, 'acesso_id', v_id);
end $$;
revoke all on function cadastro.conceder_acesso_familiar_privado(uuid, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;

-- Wrapper invoker permanece inacessível à aplicação até revisão e grants explícitos.
create function api.conceder_acesso_familiar_privado(
  p_operacao_id uuid, p_request_id uuid, p_paciente_id uuid,
  p_familiar_id uuid, p_motivo_cifrado jsonb
) returns jsonb language sql security invoker set search_path = '' as $$
  select cadastro.conceder_acesso_familiar_privado(
    p_operacao_id, p_request_id, p_paciente_id, p_familiar_id, p_motivo_cifrado
  );
$$;
revoke all on function api.conceder_acesso_familiar_privado(uuid, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
