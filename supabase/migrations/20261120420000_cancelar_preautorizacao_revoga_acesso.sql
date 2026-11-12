-- Cancelar a pré-autorização passa a fechar também o acesso já materializado.
--
-- Antes desta migration havia um descompasso real: depois da primeira entrada, a
-- autorização vive em `cadastro.acesso_paciente`, e cancelar a pré-autorização em
-- `identidade.convite_familiar` não tocava nessa linha. Quem cancelasse esperando
-- fechar o acesso deixaria a leitura aberta, porque a revalidação a cada leitura olha
-- `acesso_paciente.revogada_em`. As duas pontas passam a cair na mesma transação.
--
-- A versão de 2 argumentos é removida de propósito: manter um caminho que fecha pela
-- metade é o próprio risco. A revogação exige motivo cifrado, como toda revogação de
-- acesso. Depende de 20261119250000 e 20261120400000.
-- Rollback: restaurar a definição de 2 argumentos de 20261119250000_convite_familiar.sql.
drop function identidade.cancelar_preautorizacao_familiar_privado(uuid, uuid);

create function identidade.cancelar_preautorizacao_familiar_privado(
  p_convite_id uuid, p_request_id uuid, p_motivo_revogacao jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_ator uuid := auth_privado.uid(); v_sessao jsonb; v_convite record; v_fechados integer := 0;
begin
  if p_convite_id is null or p_request_id is null or p_motivo_revogacao is null then
    raise exception using errcode = '22004', message = 'PARAMETRO_OBRIGATORIO';
  end if;
  v_sessao := api.consultar_sessao_nativa(p_request_id);
  if v_sessao is null or v_sessao #>> '{usuario,perfil}' is distinct from 'administrador'
    or v_sessao #>> '{usuario,id}' is distinct from v_ator::text
    or v_sessao #>> '{usuario,ativo}' is distinct from 'true' then
    return jsonb_build_object('ok', false, 'codigo', 'sem_permissao');
  end if;
  select estado, acesso_preautorizado_id, acesso_revogado_em into v_convite
    from identidade.convite_familiar where id = p_convite_id for update;
  if not found or v_convite.acesso_preautorizado_id is null then
    return jsonb_build_object('ok', false, 'codigo', 'convite_indisponivel');
  end if;
  if v_convite.acesso_revogado_em is null then
    update identidade.convite_familiar set acesso_revogado_em = clock_timestamp(),
      acesso_revogado_por = v_ator, atualizado_em = clock_timestamp() where id = p_convite_id;
  end if;
  -- Mesma transação: o acesso materializado a partir desta pré-autorização fecha junto.
  -- Repetir o cancelamento não altera a revogação já registrada.
  update cadastro.acesso_paciente set revogada_em = clock_timestamp(),
      revogado_por_usuario_id = v_ator, motivo_revogacao_cifrado = p_motivo_revogacao,
      versao = versao + 1
    where id = v_convite.acesso_preautorizado_id and revogada_em is null;
  get diagnostics v_fechados = row_count;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values (gen_random_uuid(), v_ator, 'cancelar_preautorizacao_familiar', 'convite_familiar', p_convite_id, 'permitido', p_request_id);
  return jsonb_build_object('ok', true, 'convite_id', p_convite_id, 'acessos_fechados', v_fechados);
end $$;
revoke all on function identidade.cancelar_preautorizacao_familiar_privado(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
