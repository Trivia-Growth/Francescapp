-- RASCUNHO isolado: sem grants, gateway JWT/Vault reais ou canal SQL seguro.
-- A validação de AAD declarado não prova tag GCM; o adapter deve validar cifra.
create function experimento_atestado.verificar_criar_contato_fixture(p_transporte jsonb)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; v_ator uuid; v_sessao uuid; v_emitido timestamptz; v_expira timestamptz; v_prazo interval;
begin
 if experimento_atestado.verificar_com_chave_interna(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is not true then return false; end if;
 v_ator:=auth.uid(); v_sessao:=(auth.jwt()->>'session_id')::uuid;
 v_emitido:=(a->>'emitido_em')::timestamptz; v_expira:=(a->>'expira_em')::timestamptz;
 v_prazo:=experimento_atestado.prazo_maximo_teste();
 return coalesce(v_ator is not null and v_sessao is not null and (a->>'usuario_id')::uuid=v_ator
   and (a->>'session_id')::uuid=v_sessao and a->>'request_id'=e->>'request_id'
   and a->>'operacao'='api.criar_contato_paciente' and v_prazo>interval '0 seconds'
   and v_emitido<=clock_timestamp() and v_expira>clock_timestamp() and v_expira>v_emitido
   and v_expira-v_emitido<=v_prazo and identidade.sessao_atual_valida() is true,false);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then return false;
end $$;
revoke all on function experimento_atestado.verificar_criar_contato_fixture(jsonb) from public,anon,authenticated;

create function experimento_atestado.auditar_contato_fixture(p_id uuid,p_ator uuid,p_contato uuid,p_resultado text,p_request uuid)
returns void language plpgsql security invoker set search_path=pg_catalog as $$
declare v_linhas integer;
begin
 insert into auditoria.evento(id,ator_usuario_id,operador_restrito,acao,tipo_objeto,objeto_id,resultado,request_id)
 values(p_id,p_ator,case when p_ator is null then 'contato_prova_fixture' else null end,'api.criar_contato_paciente','contato',p_contato,p_resultado,p_request)
 on conflict (id) do nothing;
 get diagnostics v_linhas=row_count;
 if v_linhas=1 then return; end if;
 if exists(select 1 from auditoria.evento a where a.id=p_id
   and a.ator_usuario_id is not distinct from p_ator
   and a.operador_restrito is not distinct from case when p_ator is null then 'contato_prova_fixture' else null end
   and a.acao='api.criar_contato_paciente' and a.tipo_objeto='contato'
   and a.objeto_id is not distinct from p_contato and a.resultado=p_resultado and a.request_id=p_request) then return; end if;
 if exists(select 1 from auditoria.evento where id=p_id) then raise exception using errcode='23505',message='AUDITORIA_CONFLITANTE'; end if;
 raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';
end $$;
revoke all on function experimento_atestado.auditar_contato_fixture(uuid,uuid,uuid,text,uuid) from public,anon,authenticated;

create function experimento_atestado.criar_contato_com_prova_fixture(p_transporte jsonb,p_geracao bigint,p_verificador bytea)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare e jsonb:=p_transporte->'entrada'; v_ator uuid; v_request uuid; v_auditoria uuid; v_paciente uuid; v_contato uuid; v_anterior operacao.requisicao; v_linhas integer;
begin
 begin
  v_request:=(e->>'request_id')::uuid; v_auditoria:=(e->>'auditoria_id')::uuid;
  v_paciente:=(e->>'paciente_id')::uuid; v_contato:=(e->>'contato_id')::uuid;
 exception when invalid_text_representation then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end;
 if v_request is null or v_auditoria is null or v_paciente is null or v_contato is null then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
 -- A prova bloqueia concessão, usuário, sessão, credencial e prova nessa ordem.
 -- Negativa não atribui identidade não comprovada pelos fixtures de gateway.
 if saida_fixture.autorizar_prova(p_geracao,p_verificador) is not true
   or experimento_atestado.verificar_criar_contato_fixture(p_transporte) is not true then
   insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),'contato_prova_fixture','api.criar_contato_paciente','contato',v_contato,'negado',v_request);
   get diagnostics v_linhas=row_count;
   if v_linhas<>1 then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',v_request);
 end if;
 v_ator:=auth.uid();
 if not exists(select 1 from public.usuario where id=v_ator and ativo and perfil='administrador') then
   perform experimento_atestado.auditar_contato_fixture(v_auditoria,v_ator,v_contato,'negado',v_request);
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',v_request);
 end if;
 if jsonb_typeof(e) is distinct from 'object'
   or e-array['request_id','auditoria_id','paciente_id','contato_id','chave_idempotencia','digest_idempotencia','tipo','valor','aad','atestado'] <> '{}'::jsonb
   or e->'aad' is distinct from jsonb_build_object('tabela','cadastro.contato_paciente','registro_id',v_contato::text,'campo','valor','formato',1)
   or e->>'tipo' is null or e->>'tipo' not in ('email','telefone')
   or jsonb_typeof(e->'valor') is distinct from 'object'
   or (e->'valor')-array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
   or e->'valor'->'formato' is distinct from '1'::jsonb
   or jsonb_typeof(e->'valor'->'key_id') is distinct from 'string'
   or length(e->'valor'->>'key_id') not between 1 and 128
   or not coalesce(jsonb_typeof(e->'valor'->'nonce')='string' and length(e->'valor'->>'nonce') between 1 and 32768 and e->'valor'->>'nonce' ~ '^[A-Za-z0-9_-]+$',false)
   or not coalesce(jsonb_typeof(e->'valor'->'ciphertext')='string' and length(e->'valor'->>'ciphertext') between 1 and 32768 and e->'valor'->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false)
   or not coalesce(jsonb_typeof(e->'valor'->'tag')='string' and length(e->'valor'->>'tag') between 1 and 32768 and e->'valor'->>'tag' ~ '^[A-Za-z0-9_-]+$',false)
   or jsonb_typeof(e->'chave_idempotencia') is distinct from 'string'
   or not coalesce(length(e->>'chave_idempotencia') between 16 and 200 and e->>'chave_idempotencia' ~ '^[A-Za-z0-9_-]+$',false)
   or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string'
   or not coalesce(length(e->>'digest_idempotencia') between 1 and 32768 and e->>'digest_idempotencia' ~ '^[A-Za-z0-9_-]+$',false) then
   perform experimento_atestado.auditar_contato_fixture(v_auditoria,v_ator,v_contato,'negado',v_request);
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','entrada_invalida'),'request_id',v_request);
 end if;
 perform 1 from cadastro.paciente where id=v_paciente for update;
 if not found then
   perform experimento_atestado.auditar_contato_fixture(v_auditoria,v_ator,v_contato,'negado',v_request);
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','nao_encontrado'),'request_id',v_request);
 end if;
 -- Reavaliar após lock do paciente: espera pode expirar atestado.
 if experimento_atestado.verificar_criar_contato_fixture(p_transporte) is not true then
   perform experimento_atestado.auditar_contato_fixture(gen_random_uuid(),null,v_contato,'negado',v_request);
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',v_request);
 end if;
 insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
 values(gen_random_uuid(),v_ator,'api.criar_contato_paciente',e->>'chave_idempotencia',e->>'digest_idempotencia','registrada',v_contato,1)
 on conflict(ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into v_anterior;
 if not found then
   select * into v_anterior from operacao.requisicao where ator_usuario_id=v_ator and operacao='api.criar_contato_paciente' and chave_idempotencia=e->>'chave_idempotencia';
   if v_anterior.digest_entrada is distinct from e->>'digest_idempotencia' then
     perform experimento_atestado.auditar_contato_fixture(v_auditoria,v_ator,v_contato,'negado',v_request);
     return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',v_request);
   end if;
   if v_anterior.estado is distinct from 'concluida' or v_anterior.resultado_id is null
     or not exists(select 1 from cadastro.contato_paciente c where c.id=v_anterior.resultado_id and c.paciente_id=v_paciente) then
     perform experimento_atestado.auditar_contato_fixture(v_auditoria,v_ator,v_contato,'falhou',v_request);
     return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','servico_indisponivel'),'request_id',v_request);
   end if;
   if exists(select 1 from auditoria.evento a where a.id=v_auditoria) and not exists(
     select 1 from auditoria.evento a where a.id=v_auditoria and a.ator_usuario_id=v_ator
       and a.operador_restrito is null and a.acao='api.criar_contato_paciente' and a.tipo_objeto='contato'
       and a.objeto_id=v_anterior.resultado_id and a.resultado='permitido' and a.request_id=v_request) then
     raise exception using errcode='23505',message='AUDITORIA_CONFLITANTE';
   end if;
   -- Cada retry devolve projeção atual: é uma nova leitura auditável mesmo
   -- quando transporte, request e auditoria de criação são idênticos.
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
     values(gen_random_uuid(),v_ator,'api.repetir_contato_paciente','contato',v_anterior.resultado_id,'permitido',v_request);
   get diagnostics v_linhas=row_count;
   if v_linhas<>1 then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',true,'dados',experimento_atestado.projetar_paciente_fixture(v_paciente),'request_id',v_request);
 end if;
 insert into cadastro.contato_paciente(id,paciente_id,tipo,valor_cifrado) values(v_contato,v_paciente,e->>'tipo',e->'valor');
 get diagnostics v_linhas=row_count;
 if v_linhas<>1 then raise exception using errcode='P0002',message='CONTATO_NAO_INSERIDO'; end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values(v_auditoria,v_ator,'api.criar_contato_paciente','contato',v_contato,'permitido',v_request);
 get diagnostics v_linhas=row_count;
 if v_linhas<>1 then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 update operacao.requisicao set estado='concluida' where id=v_anterior.id and estado='registrada';
 get diagnostics v_linhas=row_count;
 if v_linhas<>1 then raise exception using errcode='P0002',message='LEDGER_NAO_FINALIZADO'; end if;
 return jsonb_build_object('ok',true,'dados',experimento_atestado.projetar_paciente_fixture(v_paciente),'request_id',v_request);
end $$;
revoke all on function experimento_atestado.criar_contato_com_prova_fixture(jsonb,bigint,bytea) from public,anon,authenticated;
