-- EXPERIMENTO: SEM GRANTS DE PRODUÇÃO. Depende de fixtures e verificador experimental.
-- AAD declarado e assinado não prova tag AES-GCM; JWT/Vault reais não foram testados.
-- Concorrência com revogação/perfil, replay e limites da entrada seguem em aberto.
create function experimento_atestado.registrar_negacao_fixture(p_id uuid,p_ator uuid,p_paciente uuid,p_request uuid)
returns void language plpgsql security invoker set search_path=pg_catalog as $$
declare v_linhas integer;
begin
 insert into auditoria.evento (id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values (p_id,p_ator,'api.criar_paciente','paciente',p_paciente,'negado',p_request)
 on conflict (id) do nothing;
 get diagnostics v_linhas = row_count;
 if v_linhas = 1 then return; end if;
 if exists (select 1 from auditoria.evento e where e.id=p_id
     and e.ator_usuario_id=p_ator and e.acao='api.criar_paciente' and e.tipo_objeto='paciente'
     and e.objeto_id=p_paciente and e.resultado='negado' and e.request_id=p_request) then return; end if;
 if exists (select 1 from auditoria.evento e where e.id=p_id) then
   raise exception using errcode='23505',message='AUDITORIA_CONFLITANTE';
 end if;
 raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';
end $$;
revoke all on function experimento_atestado.registrar_negacao_fixture(uuid,uuid,uuid,uuid) from public;
-- Só chamar este helper em contexto com gateway JWT verificado: a fixture não o prova.
create function experimento_atestado.auditar_negacao_confiavel(p_transporte jsonb) returns void
language plpgsql security invoker set search_path = pg_catalog as $$
declare
 e jsonb := p_transporte -> 'entrada';
 prova jsonb := e -> 'atestado';
 ator uuid;
 v_usuario uuid;
 v_sessao uuid;
 v_sessao_claim uuid;
 v_request uuid;
 v_request_claim uuid;
begin
 begin
   ator := auth.uid();
   v_usuario := (prova ->> 'usuario_id')::uuid;
   v_sessao := (prova ->> 'session_id')::uuid;
   v_sessao_claim := (auth.jwt() ->> 'session_id')::uuid;
   v_request := (e ->> 'request_id')::uuid;
   v_request_claim := (prova ->> 'request_id')::uuid;
 exception when invalid_text_representation then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end;
 if ator is null or nullif(prova ->> 'session_id','') is null
    or nullif(auth.jwt() ->> 'session_id','') is null
    or nullif(prova ->> 'request_id','') is null or nullif(e ->> 'request_id','') is null
    or v_usuario is distinct from ator or v_sessao is distinct from v_sessao_claim
    or v_request_claim is distinct from v_request
    or prova ->> 'operacao' is distinct from 'api.criar_paciente'
    or not exists (select 1 from public.usuario u where u.id=ator)
    or experimento_atestado.verificar_com_chave_interna(p_transporte ->> 'entrada_canonica',
      p_transporte ->> 'dados_canonicos',e - 'atestado',prova - 'mac',prova ->> 'mac') is distinct from true then
   return;
 end if;
 perform experimento_atestado.registrar_negacao_fixture((e ->> 'auditoria_id')::uuid,ator,(e ->> 'paciente_id')::uuid,(e ->> 'request_id')::uuid);
end $$;
revoke all on function experimento_atestado.auditar_negacao_confiavel(jsonb) from public;

-- Somente após autorização: projeta estado atual, nunca a resposta salva no ledger.
create function experimento_atestado.projetar_paciente_fixture(p_paciente uuid) returns jsonb
language sql stable security invoker set search_path = pg_catalog as $$
  select jsonb_build_object(
    'paciente_id',p.id,'nome',p.nome_cifrado,'nome_preferencia',p.nome_preferencia_cifrado,
    'data_nascimento',p.data_nascimento_cifrada,'versao',p.versao,
    'contatos',coalesce((select jsonb_agg(jsonb_build_object('contato_id',c.id,'tipo',c.tipo,
      'valor',c.valor_cifrado,'versao',c.versao) order by c.criado_em,c.id)
      from cadastro.contato_paciente c where c.paciente_id=p.id),'[]'::jsonb))
  from cadastro.paciente p where p.id=p_paciente
$$;
revoke all on function experimento_atestado.projetar_paciente_fixture(uuid) from public;

create function experimento_atestado.criar_paciente(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  e jsonb := p_transporte -> 'entrada';
  prova jsonb := e -> 'atestado';
  ator uuid;
  request uuid;
  paciente uuid;
  auditoria_id uuid;
  sessao_id uuid;
  v_concessao_id uuid;
  campo text;
  anterior operacao.requisicao;
  resultado jsonb;
  linhas_atualizadas integer;
begin
  begin
    ator := auth.uid();
    request := (e ->> 'request_id')::uuid;
    paciente := (e ->> 'paciente_id')::uuid;
    auditoria_id := (e ->> 'auditoria_id')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end;
  if request is null or paciente is null or auditoria_id is null or ator is null
     or e ->> 'chave_idempotencia' is null or e ->> 'digest_idempotencia' is null
     or prova ->> 'request_id' is distinct from request::text
     or experimento_atestado.verificar_criar_paciente(
       p_transporte ->> 'entrada_canonica', p_transporte ->> 'dados_canonicos',
       e - 'atestado', prova - 'mac', prova ->> 'mac'
     ) is distinct from true then
    if request is not null and paciente is not null and auditoria_id is not null then
      perform experimento_atestado.auditar_negacao_confiavel(p_transporte);
    end if;
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',request);
  end if;
  sessao_id := (auth.jwt() ->> 'session_id')::uuid;
  select s.concessao_id into v_concessao_id from identidade.sessao s where s.session_id=sessao_id and s.usuario_id=ator;
  if v_concessao_id is null then
    perform experimento_atestado.auditar_negacao_confiavel(p_transporte);
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',request);
  end if;
  perform 1 from identidade.concessao_equipe c where c.id=v_concessao_id for update;
  if not found then perform experimento_atestado.auditar_negacao_confiavel(p_transporte); return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',request); end if;
  perform 1 from public.usuario u where u.id=ator for update;
  if not found then perform experimento_atestado.auditar_negacao_confiavel(p_transporte); return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',request); end if;
  perform 1 from identidade.sessao s where s.session_id=sessao_id for update;
  if not found then perform experimento_atestado.auditar_negacao_confiavel(p_transporte); return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',request); end if;
  if not exists (select 1 from identidade.sessao s join identidade.concessao_equipe c on c.id=s.concessao_id
    where s.session_id=sessao_id and s.usuario_id=ator and s.concessao_id=v_concessao_id
      and s.revogada_em is null and c.usuario_id=ator and c.estado='vinculada') then
    perform experimento_atestado.auditar_negacao_confiavel(p_transporte);
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',request);
  end if;
  -- Espera pelos locks pode ter expirado o atestado.
  if experimento_atestado.verificar_criar_paciente(
    p_transporte ->> 'entrada_canonica', p_transporte ->> 'dados_canonicos',
    e - 'atestado', prova - 'mac', prova ->> 'mac'
  ) is distinct from true then
    perform experimento_atestado.auditar_negacao_confiavel(p_transporte);
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',request);
  end if;
  if not exists (select 1 from public.usuario u where u.id = ator and u.ativo and u.perfil = 'administrador') then
    perform experimento_atestado.registrar_negacao_fixture(auditoria_id,ator,paciente,request);
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',request);
  end if;
  if jsonb_typeof(e -> 'aad') is distinct from 'object'
     or (e -> 'aad') - array['nome','nome_preferencia','data_nascimento'] <> '{}'::jsonb then
    perform experimento_atestado.registrar_negacao_fixture(auditoria_id,ator,paciente,request);
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','entrada_invalida'),'request_id',request);
  end if;
  foreach campo in array array['nome', 'nome_preferencia', 'data_nascimento'] loop
    if (e ? campo) is distinct from (e -> 'aad' ? campo) then
      perform experimento_atestado.registrar_negacao_fixture(auditoria_id,ator,paciente,request);
      return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','entrada_invalida'),'request_id',request);
    end if;
    if e ? campo and ((e -> 'aad' -> campo) is distinct from jsonb_build_object(
      'tabela','cadastro.paciente','registro_id',paciente::text,'campo',campo,'formato',1)
      or jsonb_typeof(e -> campo) is distinct from 'object'
      or (e -> campo) - array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
      or e -> campo -> 'formato' is distinct from '1'::jsonb
      or jsonb_typeof(e -> campo -> 'key_id') is distinct from 'string'
      or length(e -> campo ->> 'key_id') not between 1 and 128
      or jsonb_typeof(e -> campo -> 'nonce') is distinct from 'string'
      or coalesce(length(e -> campo ->> 'nonce') between 1 and 32768 and (e -> campo ->> 'nonce') ~ '^[A-Za-z0-9_-]+$',false) is not true
      or jsonb_typeof(e -> campo -> 'ciphertext') is distinct from 'string'
      or coalesce(length(e -> campo ->> 'ciphertext') between 1 and 32768 and (e -> campo ->> 'ciphertext') ~ '^[A-Za-z0-9_-]+$',false) is not true
      or jsonb_typeof(e -> campo -> 'tag') is distinct from 'string'
      or coalesce(length(e -> campo ->> 'tag') between 1 and 32768 and (e -> campo ->> 'tag') ~ '^[A-Za-z0-9_-]+$',false) is not true) then
      perform experimento_atestado.registrar_negacao_fixture(auditoria_id,ator,paciente,request);
      return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','entrada_invalida'),'request_id',request);
    end if;
  end loop;
  if not e ? 'nome' then
    perform experimento_atestado.registrar_negacao_fixture(auditoria_id,ator,paciente,request);
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','entrada_invalida'),'request_id',request);
  end if;
  insert into operacao.requisicao (id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
  values (gen_random_uuid(),ator,'api.criar_paciente',e ->> 'chave_idempotencia',e ->> 'digest_idempotencia','registrada',paciente,1)
  on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
  if not found then
    select * into anterior from operacao.requisicao where ator_usuario_id=ator and operacao='api.criar_paciente' and chave_idempotencia=e ->> 'chave_idempotencia';
    if anterior.digest_entrada is distinct from e ->> 'digest_idempotencia' then
      perform experimento_atestado.registrar_negacao_fixture(auditoria_id,ator,paciente,request);
      return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',request);
    end if;
    if anterior.estado is distinct from 'concluida' or anterior.resultado_id is null
       or anterior.resultado_versao is null or anterior.resultado_versao < 1
       or not exists (select 1 from cadastro.paciente p where p.id=anterior.resultado_id) then
      return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','servico_indisponivel'),'request_id',request);
    end if;
    resultado := experimento_atestado.projetar_paciente_fixture(anterior.resultado_id);
    if resultado is null then
      return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','servico_indisponivel'),'request_id',request);
    end if;
    -- Cada leitura de retry é evidenciada, inclusive repetição do mesmo request.
    insert into auditoria.evento (id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values (gen_random_uuid(),ator,'api.criar_paciente.repeticao','paciente',anterior.resultado_id,'permitido',request);
    get diagnostics linhas_atualizadas = row_count;
    if linhas_atualizadas <> 1 then
      raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';
    end if;
    return jsonb_build_object('ok',true,'dados',resultado,'request_id',request);
  end if;
  insert into cadastro.paciente (id,nome_cifrado,nome_preferencia_cifrado,data_nascimento_cifrada,criado_por_usuario_id)
  values (paciente,e -> 'nome',e -> 'nome_preferencia',e -> 'data_nascimento',ator);
  get diagnostics linhas_atualizadas = row_count;
  if linhas_atualizadas <> 1 then
    raise exception using errcode = 'P0002', message = 'PACIENTE_NAO_INSERIDO';
  end if;
  insert into auditoria.evento (id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values (auditoria_id,ator,'api.criar_paciente','paciente',paciente,'permitido',request);
  get diagnostics linhas_atualizadas = row_count;
  if linhas_atualizadas <> 1 then
    raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA';
  end if;
  update operacao.requisicao set estado='concluida' where id=anterior.id and estado='registrada';
  get diagnostics linhas_atualizadas = row_count;
  if linhas_atualizadas <> 1 then
    raise exception using errcode = 'P0002', message = 'LEDGER_NAO_FINALIZADO';
  end if;
  resultado := experimento_atestado.projetar_paciente_fixture(paciente);
  if resultado is null then
    raise exception using errcode='P0002',message='PACIENTE_NAO_PROJETADO';
  end if;
  resultado := jsonb_build_object('ok',true,'dados',resultado,'request_id',request);
  return resultado;
end $$;
revoke all on function experimento_atestado.criar_paciente(jsonb) from public;
