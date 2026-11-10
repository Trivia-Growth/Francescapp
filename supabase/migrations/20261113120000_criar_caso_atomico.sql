-- Cadastro de caso novo atômico (recorte 2B): paciente, contatos e primeiro retrato (situação e responsável)
-- numa só gravação. Substitui o formato mínimo: nome, preferência, nascimento, contatos, situação e responsável
-- passam a ser exigidos pelo banco; a ausência de qualquer um é recusada sem criar linha.
-- Parte da definição de 20261110140000 (comparar por diff); só as inclusões marcadas mudam. O primeiro retrato
-- nasce sem motivo (o evento de criação é a origem); mudanças posteriores seguem exigindo motivo.
-- Sem grants à aplicação; privilégios do papel dono da criação são o mínimo para as inclusões.
-- Reversão: reaplicar a definição de 20261110140000. Preparação local, sem operação remota.

create function operacao.envelope_cifrado_valido(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(p) is distinct from 'object' or p - array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb then return false; end if;
 return p->'formato' = '1'::jsonb
  and jsonb_typeof(p->'key_id')='string' and coalesce(length(p->>'key_id') between 1 and 128,false)
  and jsonb_typeof(p->'nonce')='string' and coalesce(p->>'nonce','') ~ '^[A-Za-z0-9_-]{16}$'
  and jsonb_typeof(p->'tag')='string' and coalesce(p->>'tag','') ~ '^[A-Za-z0-9_-]{22}$'
  and jsonb_typeof(p->'ciphertext')='string' and coalesce(length(p->>'ciphertext') between 1 and 32768 and p->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false);
end $$;
revoke all on function operacao.envelope_cifrado_valido(jsonb) from public, anon, authenticated, service_role;
grant execute on function operacao.envelope_cifrado_valido(jsonb) to ffcmapp_api_cadastro_owner;

-- Papel dono da criação: insere contatos e o primeiro retrato, lê só o responsável elegível; nunca altera nem apaga.
grant insert (id,paciente_id,tipo,valor_cifrado) on cadastro.contato_paciente to ffcmapp_api_cadastro_owner;
create policy api_cadastro_contato_insercao on cadastro.contato_paciente for insert to ffcmapp_api_cadastro_owner
 with check (exists (select 1 from cadastro.paciente p where p.id=contato_paciente.paciente_id and p.criado_por_usuario_id=(select auth_privado.uid())));
grant insert (id,paciente_id,versao,situacao,responsavel_usuario_id,auditoria_id,ator_usuario_id) on cadastro.acompanhamento_caso to ffcmapp_api_cadastro_owner;
create policy acompanhamento_insercao_criacao on cadastro.acompanhamento_caso for insert to ffcmapp_api_cadastro_owner
 with check (ator_usuario_id=(select auth_privado.uid()) and versao=1);
create policy api_cadastro_usuario_elegivel on public.usuario for select to ffcmapp_api_cadastro_owner
 using (ativo and perfil in ('administrador','profissional'));
create policy api_cadastro_usuario_elegivel_lock on public.usuario for update to ffcmapp_api_cadastro_owner
 using (ativo and perfil in ('administrador','profissional')) with check (false);

create or replace function operacao.criar_paciente_privado(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado';
 ator uuid; sessao uuid; req uuid; paciente uuid; reserva uuid; auditoria_id uuid; epoca bigint;
 inicio timestamptz; fim timestamptz; concessao uuid; dominio text; sujeito text;
 google record; b operacao.barreira_cadastro; r operacao.reserva_cadastro;
 anterior operacao.requisicao; campo text; autorizado boolean:=false; repeticao boolean:=false; resultado jsonb;
 v_contato jsonb; v_id uuid; v_ids uuid[]:='{}'; v_responsavel uuid; v_n integer;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','reserva_id','geracao_reserva','auditoria_id','chave_idempotencia','digest_idempotencia','nome','nome_preferencia','data_nascimento','contatos','situacao','responsavel_id','aad','atestado'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  reserva:=(e->>'reserva_id')::uuid; epoca:=(e->>'geracao_reserva')::bigint; auditoria_id:=(e->>'auditoria_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or reserva is null or auditoria_id is null or epoca is null or epoca<1
  or inicio is null or fim is null or a->>'usuario_id' is distinct from ator::text
  or a->>'session_id' is distinct from sessao::text or a->>'request_id' is distinct from req::text
  or a->>'operacao' is distinct from 'api.criar_paciente'
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
 if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='oauth') then
  select i.provider_id,i.identity_data into google from auth_privado.identidades() i where i.user_id=ator and i.provider='google'
   and bloqueios_auth.travar(ator,sessao)
   and exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=ator and j.provider='google')=1;
  if google.identity_data->>'sub'=google.provider_id and google.identity_data->>'email_verified'='true' and google.identity_data#>>'{custom_claims,hd}'=dominio then
   select c.id,c.subject_google into concessao,sujeito from identidade.concessao_equipe c
    where c.usuario_id=ator and c.estado='vinculada' and c.metodo='google_workspace' and c.perfil='administrador' for share;
   if found and sujeito=google.provider_id then
    perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='administrador' for share;
    if found then
     perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.concessao_id=concessao
      and s.metodo='google_workspace' and s.revogada_em is null and s.encerrada_em is null for share;
     if found then
      perform 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp());
      autorizado:=found;
     end if;
    end if;
   end if;
  end if;
 end if;
 -- Exceção individual: mesma ordem de bloqueios das demais operações privadas.
 if not autorizado and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') then
  select c.id into concessao from identidade.concessao_equipe c
   where c.usuario_id=ator and c.estado='vinculada' and c.metodo='tecnica' and c.perfil='administrador' for share;
  if found then
   perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='administrador' for share;
   if found then
    perform 1 from identidade.excecao_tecnica x where x.usuario_id=ator and x.concessao_id=concessao for share;
    if found then
     perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.concessao_id=concessao
      and s.metodo='tecnica' and s.revogada_em is null and s.encerrada_em is null for share;
     if found then
      perform 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp());
      autorizado:=found;
     end if;
    end if;
   end if;
  end if;
 end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,'api.criar_paciente','paciente',paciente,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or length(btrim(e->>'chave_idempotencia')) not between 1 and 256
  or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string' or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$'
  or jsonb_typeof(e->'aad') is distinct from 'object' or (e->'aad') - array['nome','nome_preferencia','data_nascimento'] <> '{}'::jsonb
  or not (e ? 'nome' and e ? 'nome_preferencia' and e ? 'data_nascimento') then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
 foreach campo in array array['nome','nome_preferencia','data_nascimento'] loop
  if (e ? campo) is distinct from (e->'aad' ? campo) or (e ? campo and (
    e->'aad'->campo is distinct from jsonb_build_object('tabela','cadastro.paciente','registro_id',paciente::text,'campo',campo,'formato',1)
    or jsonb_typeof(e->campo) is distinct from 'object' or (e->campo) - array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
    or e->campo->'formato' is distinct from '1'::jsonb or jsonb_typeof(e->campo->'key_id') is distinct from 'string'
    or coalesce(length(e->campo->>'key_id') between 1 and 128,false) is not true
    or jsonb_typeof(e->campo->'nonce') is distinct from 'string' or coalesce(e->campo->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
    or jsonb_typeof(e->campo->'tag') is distinct from 'string' or coalesce(e->campo->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
    or jsonb_typeof(e->campo->'ciphertext') is distinct from 'string' or coalesce(length(e->campo->>'ciphertext') between 1 and 32768 and e->campo->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true)) then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
 end loop;
 -- Caso novo: contatos com AAD próprio, situação do conjunto fechado e responsável indicado.
 if jsonb_typeof(e->'contatos') is distinct from 'array'
  or (case when jsonb_typeof(e->'contatos')='array' then jsonb_array_length(e->'contatos') else 0 end) not between 1 and 10
  or coalesce(e->>'situacao','') not in ('entrada','ativo','pausado','encerrado','transferido')
  or jsonb_typeof(e->'situacao') is distinct from 'string' or jsonb_typeof(e->'responsavel_id') is distinct from 'string' then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 begin
  v_responsavel:=(e->>'responsavel_id')::uuid;
  for v_contato in select value from jsonb_array_elements(e->'contatos') loop
   if jsonb_typeof(v_contato) is distinct from 'object' then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
   v_id:=(v_contato->>'contato_id')::uuid;
   if v_id is null or v_id = any(v_ids) or v_contato - array['contato_id','tipo','valor','aad'] <> '{}'::jsonb
    or v_contato->>'tipo' is null or v_contato->>'tipo' not in ('email','telefone')
    or v_contato->'aad' is distinct from jsonb_build_object('tabela','cadastro.contato_paciente','registro_id',v_id::text,'campo','valor','formato',1)
    or operacao.envelope_cifrado_valido(v_contato->'valor') is not true then
    raise exception using errcode='22023',message='ENTRADA_INVALIDA';
   end if;
   v_ids:=v_ids||v_id;
  end loop;
 exception when invalid_text_representation then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end;

 select * into b from operacao.barreira_cadastro where ator_usuario_id=ator for update;
 select rc.* into r from operacao.reserva_cadastro rc where rc.id=reserva and rc.ator_usuario_id=ator and rc.epoca=epoca for update;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.criar_paciente','paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if not found or b.epoca is distinct from epoca or b.reserva_atual is distinct from reserva or b.resultado_pendente is not null
  or r.estado not in ('aberta','confirmada') or fim<=clock_timestamp() then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.criar_paciente','paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
 end if;
 if r.estado='confirmada' then
  if r.chave_idempotencia is distinct from e->>'chave_idempotencia' or r.digest_idempotencia is distinct from e->>'digest_idempotencia' then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,'api.criar_paciente','paciente',paciente,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
  paciente:=r.paciente_id;
  repeticao:=true;
 else
  -- Responsável elegível (ativo, Administrador ou Profissional), travado até o fim da gravação.
  perform 1 from public.usuario u where u.id=v_responsavel and u.ativo and u.perfil in ('administrador','profissional') for share;
  if not found then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,'api.criar_paciente','paciente',paciente,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','responsavel_invalido'),'request_id',req);
  end if;
  insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
   values(gen_random_uuid(),ator,'api.criar_paciente',e->>'chave_idempotencia',e->>'digest_idempotencia','registrada',paciente,1)
   on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
  if not found then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,'api.criar_paciente','paciente',paciente,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
  insert into cadastro.paciente(id,nome_cifrado,nome_preferencia_cifrado,data_nascimento_cifrada,criado_por_usuario_id)
   values(paciente,e->'nome',e->'nome_preferencia',e->'data_nascimento',ator);
  if not found then raise exception using errcode='P0002',message='PACIENTE_NAO_INSERIDO'; end if;
  insert into cadastro.contato_paciente(id,paciente_id,tipo,valor_cifrado)
   select (c.item->>'contato_id')::uuid,paciente,c.item->>'tipo',c.item->'valor' from jsonb_array_elements(e->'contatos') c(item);
  get diagnostics v_n = row_count;
  if v_n is distinct from jsonb_array_length(e->'contatos') then raise exception using errcode='P0002',message='CONTATO_NAO_INSERIDO'; end if;
  update operacao.requisicao set estado='concluida' where id=anterior.id;
  if not found then raise exception using errcode='P0002',message='LEDGER_NAO_FINALIZADO'; end if;
  update operacao.reserva_cadastro set estado='confirmada',chave_idempotencia=e->>'chave_idempotencia',digest_idempotencia=e->>'digest_idempotencia',paciente_id=paciente where id=reserva;
  if not found then raise exception using errcode='P0002',message='RESERVA_NAO_CONFIRMADA'; end if;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(case when repeticao then gen_random_uuid() else auditoria_id end,ator,'api.criar_paciente','paciente',paciente,'permitido',req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 -- Primeiro retrato do caso: versão do paciente, sem motivo; o evento de criação é a origem.
 if not repeticao then
  insert into cadastro.acompanhamento_caso(id,paciente_id,versao,situacao,responsavel_usuario_id,auditoria_id,ator_usuario_id)
   select gen_random_uuid(),p.id,p.versao,e->>'situacao',v_responsavel,auditoria_id,ator from cadastro.paciente p where p.id=paciente;
  if not found then raise exception using errcode='P0002',message='ACOMPANHAMENTO_NAO_INSERIDO'; end if;
 end if;
 select jsonb_build_object('paciente_id',p.id,'nome',p.nome_cifrado,'nome_preferencia',p.nome_preferencia_cifrado,'data_nascimento',p.data_nascimento_cifrada,'versao',p.versao,
  'contatos',coalesce((select jsonb_agg(jsonb_build_object('contato_id',c.id,'tipo',c.tipo,'valor',c.valor_cifrado,'versao',c.versao) order by c.criado_em,c.id) from cadastro.contato_paciente c where c.paciente_id=p.id),'[]'::jsonb))
  into resultado from cadastro.paciente p where p.id=paciente;
 if resultado is null then raise exception using errcode='P0002',message='PACIENTE_NAO_PROJETADO'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req);
end $$;
