-- Convergência DF-023: devolve a autenticação compartilhada (`identidade.contexto_acesso_vigente`)
-- e a barreira de reserva às duas operações privadas que a aplicação manual de 24/11/2026 regrediu
-- em produção.
--
-- O que aconteceu. `20261125170000_acessos_consumidores_autenticacao.sql` (DF-023) reescreveu a
-- autenticação de 49 operações privadas, cada uma com guarda de hash. Depois dela, duas migrations
-- com número ANTERIOR foram executadas à mão em produção, por `create or replace` com corpos
-- escritos a partir de fontes antigas:
--   - `20261124200000_acesso_caso_para_administrador.sql` sobre `operacao.conceder_acesso_paciente_privado`:
--     o corpo vivo (md5 34e955842072e19ad68f52c54f9d41db) perdeu a DF-023 e também a barreira de
--     reserva de 20261112180000/20261112220000 — não aceita `reserva_id`/`geracao_reserva`, que a
--     borda envia, e recusa a concessão no validador do transporte com 42501, sem auditoria;
--     perdeu ainda o registro auditado de Auth sem perfil e duas conferências AUDITORIA_NAO_INSERIDA.
--   - `20261124160000_segredos_integracoes_cofre_gerenciado.sql` sobre
--     `operacao.segredos_integracoes_operacao_privada`: o corpo vivo (md5 8684da5c2d6cfa09614aae1127669122)
--     tem a correção do cofre, mas não a DF-023.
--
-- Corpos de destino, reconstruídos e conferidos por md5 (prova em
-- supabase/tests/convergencia_df023_producao_local.sql):
--   - concessão: corpo de 20261112220000 (md5 2a6759ee0abf06037afc8a6c82018005) + os dois fragmentos
--     da 170000 (resultado md5 6cbb09b406a4586968885a132ffcea8b, o hash_novo da própria 170000) +
--     a única troca intencional da 20261124200000: destinatário 'profissional' ou 'administrador'.
--   - cofre: corpo de 20261124160000 (o vigente) + os mesmos dois fragmentos da 170000.
-- Nenhuma outra linha muda. Owner (postgres), SECURITY INVOKER, search_path='' e ACL ficam como
-- estão: `create or replace` preserva ACL, e a guarda final confere.
--
-- O que NÃO muda: as policies de 20261112070000 continuam aceitando só profissional como
-- destinatário; conceder a administrador depende de 20261128240000, que é decisão separada. A troca
-- de retenção do cofre (valor anterior não preservado, `vault.update_secret`) segue pendente de
-- confirmação, como já estava em produção.
--
-- Guarda: aplica somente sobre o corpo vigente em produção ou sobre o próprio destino (reexecução);
-- qualquer outro corpo aborta com FONTE_DIVERGENTE.
-- Reversão: recriar os corpos de 20261124200000 e 20261124160000 (os arquivos), na mesma transação.
begin;
create temporary table convergencia_antes on commit drop as
 select p.oid, p.proowner, p.proacl, p.proconfig, p.prosecdef, p.prorettype, p.proargtypes
 from pg_proc p where p.oid in ('operacao.conceder_acesso_paciente_privado(jsonb)'::regprocedure,
  'operacao.segredos_integracoes_operacao_privada(jsonb)'::regprocedure);
do $$ begin
 if md5((select prosrc from pg_proc where oid='operacao.conceder_acesso_paciente_privado(jsonb)'::regprocedure))
   not in ('34e955842072e19ad68f52c54f9d41db','83e3e5cbe3a16c645d5935af17087ea3') then
  raise exception 'FONTE_DIVERGENTE: operacao.conceder_acesso_paciente_privado';
 end if;
 if md5((select prosrc from pg_proc where oid='operacao.segredos_integracoes_operacao_privada(jsonb)'::regprocedure))
   not in ('8684da5c2d6cfa09614aae1127669122','2afd7dcbac1e89eecd00264f2376e7fe') then
  raise exception 'FONTE_DIVERGENTE: operacao.segredos_integracoes_operacao_privada';
 end if;
 -- Os wrappers chamam as operações como seus owners; a DF-023 já lhes deu os dois helpers.
 if not has_function_privilege('ffcmapp_conceder_acesso_owner','identidade.contexto_acesso_vigente(boolean)','execute')
  or not has_function_privilege('ffcmapp_conceder_acesso_owner','identidade.cadastro_gerenciado_proprio(boolean)','execute')
  or not has_function_privilege('ffcmapp_segredos_integracoes_owner','identidade.contexto_acesso_vigente(boolean)','execute')
  or not has_function_privilege('ffcmapp_segredos_integracoes_owner','identidade.cadastro_gerenciado_proprio(boolean)','execute') then
  raise exception 'HELPER_DF023_SEM_EXECUTE';
 end if;
end $$;

create or replace function operacao.conceder_acesso_paciente_privado(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $fn$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado';
 ator uuid; sessao uuid; req uuid; paciente uuid; acesso uuid; destinatario uuid; auditoria_id uuid; reserva uuid; geracao bigint;
 b operacao.barreira_concessao_acesso_profissional; reserva_atual operacao.reserva_concessao_acesso_profissional;
 inicio timestamptz; fim timestamptz; concessao uuid; dominio text; sujeito text;
 google record; autorizado boolean:=false; repeticao boolean:=false; anterior operacao.requisicao; resultado jsonb;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','acesso_id','usuario_id','reserva_id','geracao_reserva','auditoria_id','chave_idempotencia','digest_idempotencia','motivo','atestado'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  acesso:=(e->>'acesso_id')::uuid; reserva:=(e->>'reserva_id')::uuid; geracao:=(e->>'geracao_reserva')::bigint; destinatario:=(e->>'usuario_id')::uuid; auditoria_id:=(e->>'auditoria_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or acesso is null or destinatario is null or auditoria_id is null
  or reserva is null or geracao is null or geracao<1 or inicio is null or fim is null or a->>'usuario_id' is distinct from ator::text
  or a->>'session_id' is distinct from sessao::text or a->>'request_id' is distinct from req::text
  or a->>'operacao' is distinct from 'api.conceder_acesso_paciente'
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
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
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,'api.conceder_acesso_paciente','acesso_paciente',acesso,'negado',req);
  else
   insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,'api.conceder_acesso_paciente','acesso_paciente',acesso,'negado',req);
  end if;
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if jsonb_typeof(e->'geracao_reserva') is distinct from 'number' or coalesce(e->>'geracao_reserva','') !~ '^[1-9][0-9]*$'
  or jsonb_typeof(e->'motivo') is distinct from 'object' or (e->'motivo')-array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
  or e->'motivo'->'formato' is distinct from '1'::jsonb
  or jsonb_typeof(e->'motivo'->'key_id') is distinct from 'string' or coalesce(length(e->'motivo'->>'key_id') between 1 and 128,false) is not true
  or jsonb_typeof(e->'motivo'->'nonce') is distinct from 'string' or coalesce(e->'motivo'->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
  or jsonb_typeof(e->'motivo'->'tag') is distinct from 'string' or coalesce(e->'motivo'->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
  or jsonb_typeof(e->'motivo'->'ciphertext') is distinct from 'string' or coalesce(length(e->'motivo'->>'ciphertext') between 1 and 32768 and e->'motivo'->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true
  or jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or coalesce(length(btrim(e->>'chave_idempotencia')) between 1 and 256,false) is not true
  or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string' or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$' then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 -- Mesma ordem do vínculo familiar: destinatário antes do paciente.
 perform 1 from public.usuario u where u.id=destinatario and u.ativo
   and u.perfil in ('profissional','administrador') for update;
 if found then
  perform 1 from cadastro.paciente p where p.id=paciente for update;
 end if;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.conceder_acesso_paciente','acesso_paciente',acesso,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','nao_encontrado'),'request_id',req);
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 select * into b from operacao.barreira_concessao_acesso_profissional where ator_usuario_id=ator for update;
 select * into reserva_atual from operacao.reserva_concessao_acesso_profissional re where re.id=reserva and re.ator_usuario_id=ator and re.epoca=geracao and re.paciente_reservado_id=paciente for update;
 if not found or b.epoca is distinct from geracao or b.reserva_atual is distinct from reserva
  or b.resultado_pendente is not null or reserva_atual.acao<>'conceder' or reserva_atual.estado not in ('aberta','confirmada') then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.conceder_acesso_paciente','acesso_paciente',acesso,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
 end if;
 select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao='api.conceder_acesso_paciente' and r.chave_idempotencia=e->>'chave_idempotencia';
 repeticao:=found;
 if (reserva_atual.estado='aberta' and repeticao) or (reserva_atual.estado='confirmada' and
  (not repeticao or reserva_atual.chave_idempotencia is distinct from e->>'chave_idempotencia' or reserva_atual.digest_idempotencia is distinct from e->>'digest_idempotencia' or reserva_atual.acesso_resultado_id is distinct from anterior.resultado_id)) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.conceder_acesso_paciente','acesso_paciente',acesso,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
 end if;
 insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
  values(gen_random_uuid(),ator,'api.conceder_acesso_paciente',e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',acesso,1)
  on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
 if not found then
  select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao='api.conceder_acesso_paciente' and r.chave_idempotencia=e->>'chave_idempotencia';
  if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado is distinct from 'concluida'
   or anterior.resultado_id is distinct from acesso or anterior.resultado_versao is distinct from 1
   or not exists(select 1 from cadastro.acesso_paciente x where x.id=acesso and x.paciente_id=paciente and x.usuario_id=destinatario and x.concedido_por_usuario_id=ator and x.revogada_em is null) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,'api.conceder_acesso_paciente','acesso_paciente',acesso,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
  repeticao:=true;
 else
  if exists(select 1 from cadastro.acesso_paciente x where x.id=acesso or (x.paciente_id=paciente and x.usuario_id=destinatario and x.revogada_em is null)) then
   delete from operacao.requisicao where id=anterior.id;
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,'api.conceder_acesso_paciente','acesso_paciente',acesso,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
  end if;
  insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado)
   values(acesso,paciente,destinatario,ator,e->'motivo');
 end if;
 if reserva_atual.estado='aberta' then
  update operacao.reserva_concessao_acesso_profissional set estado='confirmada',chave_idempotencia=e->>'chave_idempotencia',digest_idempotencia=e->>'digest_idempotencia',paciente_id=paciente,acesso_resultado_id=acesso where id=reserva;
  if not found then raise exception using errcode='P0002',message='RESERVA_NAO_CONFIRMADA'; end if;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(case when repeticao then gen_random_uuid() else auditoria_id end,ator,'api.conceder_acesso_paciente','acesso_paciente',acesso,'permitido',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',jsonb_build_object('id',acesso,'versao',1),'request_id',req);
end $fn$;

create or replace function operacao.segredos_integracoes_operacao_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $fn$
#variable_conflict use_variable
declare
  e jsonb := p_transporte->'entrada'; a jsonb := e->'atestado';
  ator uuid; sessao uuid; req uuid; auditoria_id uuid;
  inicio timestamptz; fim timestamptz; concessao uuid; dominio text; sujeito text;
  google record; autorizado boolean := false; repeticao boolean := false;
  anterior operacao.requisicao; resultado jsonb; acao text;
  alvo uuid; versao_atual integer; esperada integer; cofre_anterior uuid; cofre_novo uuid;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada', 'entrada_canonica', 'dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or e - array['request_id', 'segredo_chave', 'valor', 'versao_esperada',
      'chave_idempotencia', 'digest_idempotencia', 'auditoria_id', 'atestado'] <> '{}'::jsonb
    or jsonb_typeof(a) is distinct from 'object' then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  begin
    ator := auth_privado.uid(); sessao := (auth_privado.jwt()->>'session_id')::uuid;
    req := (e->>'request_id')::uuid; auditoria_id := (e->>'auditoria_id')::uuid;
    inicio := (a->>'emitido_em')::timestamptz; fim := (a->>'expira_em')::timestamptz;
    acao := a->>'operacao';
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end;
  if ator is null or sessao is null or req is null or inicio is null or fim is null
    or acao not in ('api.listar_segredos_integracoes', 'api.gravar_segredos_integracoes')
    or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
    or a->>'request_id' is distinct from req::text
    or inicio > clock_timestamp() or fim <= clock_timestamp() or fim <= inicio or fim - inicio > interval '30 seconds'
    or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica', p_transporte->>'dados_canonicos', e - 'atestado', a - 'mac', a->>'mac') is distinct from true then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  -- Bloco de autorização idêntico ao de operacao.criar_concessao_equipe_privado (admin-only):
  -- Google Workspace vinculado como administrador, ou exceção técnica individual vinculada
  -- como administrador. Nenhuma alteração de lógica em relação ao original.
  -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
      select i.provider_id, i.identity_data into google from auth_privado.identidades() i where i.user_id = ator and i.provider = 'google'
        and bloqueios_auth.travar(ator, sessao)
        and exists(select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp()))
        and (select count(*) from auth_privado.identidades() j where j.user_id = ator and j.provider = 'google') = 1;
      if google.identity_data->>'sub' = google.provider_id and google.identity_data->>'email_verified' = 'true' and google.identity_data#>>'{custom_claims,hd}' = dominio then
        select c.id, c.subject_google into concessao, sujeito from identidade.concessao_equipe c
          where c.usuario_id = ator and c.estado = 'vinculada' and c.metodo = 'google_workspace' and c.perfil = 'administrador' for share;
        if found and sujeito = google.provider_id then
          perform 1 from public.usuario u where u.id = ator and u.ativo and u.perfil = 'administrador' for share;
          if found then
            perform 1 from identidade.sessao s where s.session_id = sessao and s.usuario_id = ator and s.concessao_id = concessao
              and s.metodo = 'google_workspace' and s.revogada_em is null and s.encerrada_em is null for share;
            if found then
              perform 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp());
              autorizado := found;
            end if;
          end if;
        end if;
      end if;
    end if;
    if not autorizado and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'password') then
      select c.id into concessao from identidade.concessao_equipe c
        where c.usuario_id = ator and c.estado = 'vinculada' and c.metodo = 'tecnica' and c.perfil = 'administrador' for share;
      if found then
        perform 1 from public.usuario u where u.id = ator and u.ativo and u.perfil = 'administrador' for share;
        if found then
          perform 1 from identidade.excecao_tecnica x where x.usuario_id = ator and x.concessao_id = concessao for share;
          if found then
            perform 1 from identidade.sessao s where s.session_id = sessao and s.usuario_id = ator and s.concessao_id = concessao
              and s.metodo = 'tecnica' and s.revogada_em is null and s.encerrada_em is null for share;
            if found then
              perform 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp());
              autorizado := found;
            end if;
          end if;
        end if;
      end if;
    end if;
  end if;
 end if; -- autenticador legado só quando contexto não admitiu

  if not autorizado or fim <= clock_timestamp() then
    if exists(select 1 from public.usuario where id = ator) then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'segredos_integracoes', null, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
    end if;
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end if;
  if acao = 'api.listar_segredos_integracoes' then
    if e - array['request_id', 'atestado'] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('chave', c.chave, 'cadastrado', exists(select 1 from vault.secrets v where v.name = c.chave), 'versao', c.versao, 'atualizado_por_usuario_id', c.atualizado_por_usuario_id, 'atualizado_em', c.atualizado_em) order by c.chave), '[]'::jsonb) into resultado from identidade.segredos_integracoes c;
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, acao, 'segredos_integracoes', null, 'permitido', req);
    return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
  end if;
  -- acao = 'api.gravar_segredos_integracoes'
  if jsonb_typeof(e->'versao_esperada') is distinct from 'number'
    or coalesce(e->>'versao_esperada', '') !~ '^[0-9]+$'
    or coalesce(e->>'segredo_chave', '') !~ '^[a-z0-9][a-z0-9._-]{0,99}$'
    or jsonb_typeof(e->'valor') is distinct from 'string'
    or coalesce(length(btrim(e->>'valor')) between 1 and 48000, false) is not true
    or length(e->>'valor') > 48000
    or coalesce(length(btrim(e->>'chave_idempotencia')) between 1 and 256, false) is not true
    or coalesce(e->>'digest_idempotencia', '') !~ '^[A-Za-z0-9_-]{43}$'
    or auditoria_id is null then
    raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
  end if;
  esperada := (e->>'versao_esperada')::integer;
  -- Trava a linha antes do recibo: serializa duas administrações na mesma chave e dá o uuid que
  -- o recibo de idempotência e a auditoria precisam referenciar.
  select c.id, c.versao into alvo, versao_atual
    from identidade.segredos_integracoes c where c.chave = e->>'segredo_chave' for update;
  if not found then
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, acao, 'segredos_integracoes', null, 'negado', req);
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
  end if;
  insert into operacao.requisicao(id, ator_usuario_id, operacao, chave_idempotencia, digest_entrada, estado, resultado_id, resultado_versao)
    values(gen_random_uuid(), ator, 'api.gravar_segredos_integracoes', e->>'chave_idempotencia', e->>'digest_idempotencia', 'concluida', alvo, esperada + 1)
    on conflict (ator_usuario_id, operacao, chave_idempotencia) do nothing returning * into anterior;
  if not found then
    select * into anterior from operacao.requisicao r where r.ator_usuario_id = ator and r.operacao = 'api.gravar_segredos_integracoes' and r.chave_idempotencia = e->>'chave_idempotencia';
    if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado is distinct from 'concluida'
      or anterior.resultado_id is distinct from alvo or anterior.resultado_versao is distinct from esperada + 1
      or versao_atual is distinct from esperada + 1 then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'segredos_integracoes', alvo, 'negado', req);
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito_idempotencia'), 'request_id', req);
    end if;
    repeticao := true;
  else
    if versao_atual is distinct from esperada then
      delete from operacao.requisicao where id = anterior.id;
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'segredos_integracoes', alvo, 'negado', req);
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
    end if;
    -- Sem `for update` e sem `update`: nenhum dos dois é possível aqui. Ver cabeçalho.
    -- A serialização de duas administrações na mesma chave já acontece no `for update` da
    -- linha de `identidade.segredos_integracoes`, logo acima, que é o ponto de corte real.
    select v.id into cofre_anterior from vault.secrets v where v.name = e->>'segredo_chave';
    if cofre_anterior is not null then
      -- Substitui o valor no mesmo registro, pela função do próprio Vault. O nome não muda.
      perform vault.update_secret(cofre_anterior, e->>'valor', e->>'segredo_chave', 'Integração gerenciada pelo FFCMApp');
      cofre_novo := cofre_anterior;
    else
      select vault.create_secret(e->>'valor', e->>'segredo_chave', 'Integração gerenciada pelo FFCMApp') into cofre_novo;
    end if;
    insert into identidade.segredo_integracao_versao(id, segredo_id, versao, vault_id, cadastrado_por_usuario_id)
      values(gen_random_uuid(), alvo, versao_atual + 1, cofre_novo, ator);
    update identidade.segredos_integracoes set versao = versao_atual + 1,
      atualizado_por_usuario_id = ator, atualizado_em = clock_timestamp() where id = alvo;
  end if;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values(case when repeticao then gen_random_uuid() else auditoria_id end, ator, acao, 'segredos_integracoes', alvo, 'permitido', req);
  if fim <= clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp())) then
    raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA';
  end if;
  select jsonb_build_object('chave', c.chave, 'cadastrado', exists(select 1 from vault.secrets v where v.name = c.chave), 'versao', c.versao, 'atualizado_por_usuario_id', c.atualizado_por_usuario_id, 'atualizado_em', c.atualizado_em) into resultado from identidade.segredos_integracoes c where c.id = alvo;
  return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
end $fn$;

do $$ begin
 if md5((select prosrc from pg_proc where oid='operacao.conceder_acesso_paciente_privado(jsonb)'::regprocedure)) <> '83e3e5cbe3a16c645d5935af17087ea3'
  or md5((select prosrc from pg_proc where oid='operacao.segredos_integracoes_operacao_privada(jsonb)'::regprocedure)) <> '2afd7dcbac1e89eecd00264f2376e7fe' then
  raise exception 'HASH_FINAL_DIVERGENTE';
 end if;
 if exists(select 1 from convergencia_antes a join pg_proc p on p.oid=a.oid
   where row(a.proowner,a.proacl,a.proconfig,a.prosecdef,a.prorettype,a.proargtypes)
     is distinct from row(p.proowner,p.proacl,p.proconfig,p.prosecdef,p.prorettype,p.proargtypes)) then
  raise exception 'FUNCAO_NAO_PRESERVADA';
 end if;
end $$;
commit;
