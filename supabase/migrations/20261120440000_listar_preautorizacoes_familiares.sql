-- Listagem das pré-autorizações familiares de um caso, para a tela administrativa.
-- Sem ela a equipe não tem o que cancelar: o cancelamento precisa do convite_id.
-- Mesma capacidade do convite: sessão administrativa vigente. Somente leitura.
-- Depende de 20261120430000.
-- Rollback: drop function api.listar_preautorizacoes_familiares_privado(uuid, uuid);
grant select (email_cifrado, criado_em, acesso_autorizado_em) on identidade.convite_familiar
  to ffcmapp_cancelar_preautorizacao_owner;
-- Política própria para o evento da listagem: a do cancelamento só admite a ação dele.
create policy cancelar_preaut_auditoria_listagem on auditoria.evento for insert
  to ffcmapp_cancelar_preautorizacao_owner
  with check (ator_usuario_id = (select auth_privado.uid())
    and acao = 'api.listar_preautorizacoes_familiares' and tipo_objeto = 'convite_familiar');
grant ffcmapp_cancelar_preautorizacao_owner to current_user with inherit false, set true;
grant create on schema api to ffcmapp_cancelar_preautorizacao_owner;
select set_config('ffcmapp.listar_preaut_migrador', current_user, false);
set role ffcmapp_cancelar_preautorizacao_owner;
create function api.listar_preautorizacoes_familiares_privado(p_request_id uuid, p_paciente_id uuid)
returns jsonb language plpgsql security definer set search_path = '' set row_security = on as $$
declare
  ator uuid := auth_privado.uid(); v_sessao jsonb; autorizado boolean := false; itens jsonb;
begin
  if p_request_id is null or p_paciente_id is null then
    raise exception using errcode = '22004', message = 'PARAMETRO_OBRIGATORIO';
  end if;
  v_sessao := api.consultar_sessao_nativa(p_request_id);
  if v_sessao is not null and v_sessao #>> '{usuario,perfil}' = 'administrador'
    and v_sessao #>> '{usuario,id}' = ator::text and v_sessao #>> '{usuario,ativo}' = 'true' then
    autorizado := true;
  end if;
  if autorizado then
    select coalesce(jsonb_agg(jsonb_build_object(
        'convite_id', c.id, 'paciente_id', c.paciente_id, 'estado', c.estado,
        'email', c.email_cifrado, 'criado_em', c.criado_em,
        'acesso_preautorizado_id', c.acesso_preautorizado_id,
        'acesso_autorizado_em', c.acesso_autorizado_em,
        'acesso_revogado_em', c.acesso_revogado_em) order by c.criado_em, c.id), '[]'::jsonb)
      into itens from identidade.convite_familiar c where c.paciente_id = p_paciente_id;
  end if;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values (gen_random_uuid(), ator, 'api.listar_preautorizacoes_familiares', 'convite_familiar',
      case when autorizado then p_paciente_id end, case when autorizado then 'permitido' else 'negado' end, p_request_id);
  if not autorizado then
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', p_request_id);
  end if;
  return jsonb_build_object('ok', true, 'dados', jsonb_build_object('itens', itens), 'request_id', p_request_id);
end $$;
revoke all on function api.listar_preautorizacoes_familiares_privado(uuid, uuid) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.listar_preaut_migrador'), false);
revoke create on schema api from ffcmapp_cancelar_preautorizacao_owner;
revoke ffcmapp_cancelar_preautorizacao_owner from current_user;
