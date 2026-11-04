-- Preparação privada: não concede acesso à aplicação nem altera rotas da equipe.
-- A consulta identifica sessão; cada operação sobre paciente deve verificar o
-- vínculo específico e sua revogação na própria transação.
create function api.consultar_sessao_familiar_privada(p_request_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select identidade.sessao_familiar_privada(p_request_id, false);
$$;
revoke all on function api.consultar_sessao_familiar_privada(uuid) from public, anon, authenticated;

-- Encerrar continua disponível mesmo após revogação do vínculo familiar.
-- Verificar método e titular sob lock antes de reutilizar a saída auditada.
create function api.encerrar_sessao_familiar_privada(p_session_id uuid, p_request_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_usuario uuid := auth_privado.uid();
  v_texto text := auth_privado.jwt() ->> 'session_id';
  v_sessao uuid;
begin
  if p_request_id is null then
    raise exception using errcode = '22004', message = 'REQUEST_ID_OBRIGATORIO';
  end if;
  if v_texto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_sessao := v_texto::uuid;
  end if;
  if v_usuario is null or v_sessao is null or p_session_id is distinct from v_sessao then
    return false;
  end if;
  perform 1 from identidade.sessao s
    where s.session_id = v_sessao and s.usuario_id = v_usuario and s.metodo = 'familia'
    for update;
  if not found then return false; end if;
  return api.encerrar_sessao_nativa(v_sessao, p_request_id);
end $$;
revoke all on function api.encerrar_sessao_familiar_privada(uuid, uuid) from public, anon, authenticated;
