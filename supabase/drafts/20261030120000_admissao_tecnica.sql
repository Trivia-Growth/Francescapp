-- Rascunho D-04/D-06: somente identidade comprovada por adapter restrito.
-- Não concede execução a runtime algum. Requer o rascunho de fencing.
-- Entrada sem request_id válido é rejeitada antes de auditar: não há correlação
-- válida. Negativas auditadas só persistem se o chamador confirmar a transação.
create or replace function identidade.admitir_sessao_tecnica(p_entrada jsonb)
returns jsonb language plpgsql security invoker set search_path = pg_catalog as $$
declare
  v_usuario uuid; v_sessao uuid; v_request uuid; v_concessao uuid;
  v_perfil text; v_versao integer; v_concessao_versao integer;
  v_envelope jsonb; v_admitida boolean := false;
  v_auditoria_id uuid;
begin
  -- A entrada é validada também na fronteira do servidor; parâmetros não
  -- constituem prova de identidade. Sem request válido não há envelope válido.
  if jsonb_typeof(p_entrada) is distinct from 'object'
    or p_entrada - array['identidade','request_id','credencial_refresh'] <> '{}'::jsonb
    or jsonb_typeof(p_entrada->'identidade') is distinct from 'object'
    or (p_entrada->'identidade') - array['usuario_id','session_id','metodo'] <> '{}'::jsonb
    or p_entrada->'identidade'->>'metodo' is distinct from 'tecnica'
    or coalesce(p_entrada->>'request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(p_entrada->'identidade'->>'usuario_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(p_entrada->'identidade'->>'session_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then raise exception 'entrada inválida' using errcode = '22023'; end if;
  v_usuario := (p_entrada->'identidade'->>'usuario_id')::uuid;
  v_sessao := (p_entrada->'identidade'->>'session_id')::uuid;
  v_request := (p_entrada->>'request_id')::uuid;
  v_envelope := p_entrada->'credencial_refresh';
  if not coalesce(jsonb_typeof(v_envelope) = 'object'
    and v_envelope - array['formato','key_id','nonce','ciphertext','tag'] = '{}'::jsonb
    and v_envelope->'formato' = '1'::jsonb
    and jsonb_typeof(v_envelope->'key_id') = 'string'
    and length(v_envelope->>'key_id') between 1 and 128
    and jsonb_typeof(v_envelope->'nonce') = 'string' and length(v_envelope->>'nonce') between 1 and 32768 and (v_envelope->>'nonce') ~ '^[A-Za-z0-9_-]+$'
    and jsonb_typeof(v_envelope->'ciphertext') = 'string' and length(v_envelope->>'ciphertext') between 1 and 32768 and (v_envelope->>'ciphertext') ~ '^[A-Za-z0-9_-]+$'
    and jsonb_typeof(v_envelope->'tag') = 'string' and length(v_envelope->>'tag') between 1 and 32768 and (v_envelope->>'tag') ~ '^[A-Za-z0-9_-]+$', false)
  then raise exception 'entrada inválida' using errcode = '22023'; end if;

  -- Leitura inicial não autoriza: a exceção e a autoridade são relidas sob lock.
  select e.concessao_id into v_concessao from identidade.excecao_tecnica e where e.usuario_id = v_usuario;
  if v_concessao is not null then
    perform 1 from identidade.concessao_equipe c where c.id = v_concessao for update;
    perform 1 from public.usuario u where u.id = v_usuario for update;
    perform 1 from identidade.excecao_tecnica e where e.usuario_id = v_usuario for update;
    select u.perfil, u.versao, c.versao into v_perfil, v_versao, v_concessao_versao
      from identidade.excecao_tecnica e
      join identidade.concessao_equipe c on c.id = e.concessao_id and c.id = v_concessao
        and c.usuario_id = e.usuario_id and c.estado = 'vinculada'
      join public.usuario u on u.id = e.usuario_id and u.ativo
      where e.usuario_id = v_usuario;
    if found then
      insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
        values (v_sessao,v_usuario,v_concessao,v_concessao_versao,'tecnica')
        on conflict (session_id) do nothing;
      v_admitida := found;
      if v_admitida then
        insert into identidade.credencial_sessao(session_id,estado,envelope)
          values (v_sessao,'disponivel',v_envelope);
      end if;
    end if;
  end if;
  insert into auditoria.evento(id,ator_usuario_id,operador_restrito,acao,tipo_objeto,objeto_id,resultado,request_id)
    values (gen_random_uuid(),case when v_admitida then v_usuario else null end,
      case when v_admitida then null else 'admissao_tecnica' end,
      'sessao.admitir_tecnica','sessao',v_sessao,
      case when v_admitida then 'permitido' else 'negado' end,v_request)
    returning id into v_auditoria_id;
  if v_auditoria_id is null then
    raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA';
  end if;
  if not v_admitida then
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',v_request);
  end if;
  return jsonb_build_object('ok',true,'dados',jsonb_build_object('usuario_id',v_usuario,'session_id',v_sessao,
    'concessao_id',v_concessao,'perfil',v_perfil,'versao_usuario',v_versao),'request_id',v_request);
end $$;
revoke all on function identidade.admitir_sessao_tecnica(jsonb) from public, anon, authenticated;
