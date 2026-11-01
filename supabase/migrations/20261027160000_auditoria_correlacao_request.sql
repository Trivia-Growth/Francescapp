-- D-09: request HTTP e identidade interna do ledger são distintos.
-- A assinatura antiga não possui chamador de produção nesta fundação.
drop function operacao.registrar_requisicao_auditada(uuid, text, text, text, uuid, integer, text, text, uuid, text);

create function operacao.registrar_requisicao_auditada(
  p_ator_usuario_id uuid,
  p_operacao text,
  p_chave_idempotencia text,
  p_digest_entrada text,
  p_resultado_id uuid,
  p_resultado_versao integer,
  p_acao_auditoria text,
  p_tipo_objeto text,
  p_objeto_id uuid,
  p_resultado_auditoria text,
  p_request_id uuid
)
returns operacao.requisicao
language plpgsql
security definer
set search_path = pg_catalog, operacao, auditoria
as $$
declare
  v_requisicao operacao.requisicao;
begin
  if p_request_id is null then
    raise exception using errcode = '22004', message = 'REQUEST_ID_OBRIGATORIO';
  end if;

  insert into operacao.requisicao (
    id, ator_usuario_id, operacao, chave_idempotencia, digest_entrada,
    estado, resultado_id, resultado_versao
  ) values (
    gen_random_uuid(), p_ator_usuario_id, p_operacao, p_chave_idempotencia,
    p_digest_entrada, 'registrada', p_resultado_id, p_resultado_versao
  ) on conflict (ator_usuario_id, operacao, chave_idempotencia) do nothing
  returning * into v_requisicao;

  if not found then
    select * into v_requisicao from operacao.requisicao
    where ator_usuario_id = p_ator_usuario_id and operacao = p_operacao
      and chave_idempotencia = p_chave_idempotencia;
    if v_requisicao.digest_entrada <> p_digest_entrada then
      raise exception using errcode = 'P0001', message = 'CONFLITO_IDEMPOTENCIA';
    end if;
    return v_requisicao;
  end if;

  insert into auditoria.evento (
    id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id
  ) values (
    gen_random_uuid(), p_ator_usuario_id, p_acao_auditoria, p_tipo_objeto,
    p_objeto_id, p_resultado_auditoria, p_request_id
  );
  return v_requisicao;
end;
$$;

revoke all on function operacao.registrar_requisicao_auditada(uuid, text, text, text, uuid, integer, text, text, uuid, text, uuid)
  from public, anon, authenticated;
