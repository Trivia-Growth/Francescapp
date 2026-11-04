-- Consulta privada: ausência não prova falha nem permite repetir a concessão.
-- Sem rota ou grant à aplicação; composição futura exige revisão e provas
-- de concorrência, autorização e revogação.
create function cadastro.consultar_vinculo_familiar_privado(
  p_operacao_id uuid, p_request_id uuid, p_paciente_id uuid, p_familiar_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_sessao jsonb;
  v_ator uuid := auth_privado.uid();
  v_acesso cadastro.acesso_paciente;
  v_estado text;
begin
  if p_operacao_id is null or p_request_id is null or p_paciente_id is null
    or p_familiar_id is null then
    raise exception using errcode = '22004', message = 'PARAMETRO_OBRIGATORIO';
  end if;

  v_sessao := api.consultar_sessao_nativa(p_request_id);
  if v_sessao is null or v_sessao #>> '{usuario,perfil}' is distinct from 'administrador'
    or v_sessao #>> '{usuario,id}' is distinct from v_ator::text then
    return jsonb_build_object('ok', false, 'codigo', 'sem_permissao');
  end if;

  select * into v_acesso from cadastro.acesso_paciente a
    where a.id = p_operacao_id and a.concedido_por_usuario_id = v_ator
      and a.paciente_id = p_paciente_id and a.usuario_id = p_familiar_id
    for share;
  if not found then
    v_estado := 'pendente';
  elsif v_acesso.revogada_em is not null then
    v_estado := 'revogada';
  else
    v_estado := 'confirmada';
  end if;

  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values (gen_random_uuid(), v_ator, 'consultar_vinculo_familiar', 'acesso_paciente',
      case when v_estado = 'pendente' then null else p_operacao_id end, 'permitido', p_request_id);
  return jsonb_build_object('ok', true, 'estado', v_estado);
end $$;
revoke all on function cadastro.consultar_vinculo_familiar_privado(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- Apenas o papel privado existente pode executar e auditar esta consulta.
create policy familiar_owner_auditoria_consulta on auditoria.evento for insert to ffcmapp_familiar_owner
  with check (ator_usuario_id = (select auth_privado.uid())
    and acao = 'consultar_vinculo_familiar' and tipo_objeto = 'acesso_paciente');
grant execute on function cadastro.consultar_vinculo_familiar_privado(uuid, uuid, uuid, uuid)
  to ffcmapp_familiar_owner;
