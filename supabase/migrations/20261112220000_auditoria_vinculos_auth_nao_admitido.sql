-- Negativas de Auth sem perfil; não altera exposição das RPCs.
grant insert (ator_auth_id) on auditoria.evento to ffcmapp_conceder_acesso_owner,ffcmapp_revogar_acesso_owner,ffcmapp_acesso_barreira_owner,ffcmapp_listar_vinculos_owner;
create policy vinculos_ator_exclusivo on auditoria.evento as restrictive for insert to ffcmapp_conceder_acesso_owner,ffcmapp_revogar_acesso_owner,ffcmapp_acesso_barreira_owner,ffcmapp_listar_vinculos_owner with check (ator_usuario_id is null or ator_auth_id is null);
create policy vinculos_auth_nao_admitido_0 on auditoria.evento for insert to ffcmapp_conceder_acesso_owner with check (ator_usuario_id is null and operador_restrito is null and ator_auth_id=(select auth_privado.uid()) and resultado='negado' and acao='api.conceder_acesso_paciente' and tipo_objeto='acesso_paciente' and not exists(select 1 from public.usuario u where u.id=(select auth_privado.uid())));
create policy vinculos_auth_nao_admitido_1 on auditoria.evento for insert to ffcmapp_revogar_acesso_owner with check (ator_usuario_id is null and operador_restrito is null and ator_auth_id=(select auth_privado.uid()) and resultado='negado' and acao='api.revogar_acesso_paciente' and tipo_objeto='acesso_paciente' and not exists(select 1 from public.usuario u where u.id=(select auth_privado.uid())));
create policy vinculos_auth_nao_admitido_2 on auditoria.evento for insert to ffcmapp_acesso_barreira_owner with check (ator_usuario_id is null and operador_restrito is null and ator_auth_id=(select auth_privado.uid()) and resultado='negado' and acao in ('api.reservar_concessao_acesso_profissional','api.encerrar_concessao_acesso_profissional','api.consultar_barreira_concessao_acesso_profissional','api.reconhecer_barreira_concessao_acesso_profissional') and tipo_objeto='requisicao' and not exists(select 1 from public.usuario u where u.id=(select auth_privado.uid())));
create policy vinculos_auth_nao_admitido_3 on auditoria.evento for insert to ffcmapp_listar_vinculos_owner with check (ator_usuario_id is null and operador_restrito is null and ator_auth_id=(select auth_privado.uid()) and resultado='negado' and acao='api.listar_vinculos_profissionais' and tipo_objeto='paciente' and not exists(select 1 from public.usuario u where u.id=(select auth_privado.uid())));
create or replace function operacao.conceder_acesso_paciente_privado(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
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
 perform 1 from public.usuario u where u.id=destinatario and u.ativo and u.perfil='profissional' for update;
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
end $$;
create or replace function operacao.revogar_acesso_paciente_privado(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado';
 ator uuid; sessao uuid; req uuid; paciente uuid; acesso uuid; auditoria_id uuid;
 inicio timestamptz; fim timestamptz; concessao uuid; dominio text; sujeito text;
 google record; autorizado boolean:=false; repeticao boolean:=false;
 anterior operacao.requisicao; atual cadastro.acesso_paciente; versao integer; reserva uuid; geracao bigint;
 b operacao.barreira_concessao_acesso_profissional; reserva_atual operacao.reserva_concessao_acesso_profissional;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','acesso_id','auditoria_id','chave_idempotencia','digest_idempotencia','versao_esperada','reserva_id','geracao_reserva','motivo','motivo_auditoria','atestado'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  acesso:=(e->>'acesso_id')::uuid; auditoria_id:=(e->>'auditoria_id')::uuid;
  versao:=(e->>'versao_esperada')::integer; reserva:=(e->>'reserva_id')::uuid; geracao:=(e->>'geracao_reserva')::bigint;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or acesso is null or auditoria_id is null
  or reserva is null or geracao is null or geracao<1 or inicio is null or fim is null or a->>'usuario_id' is distinct from ator::text
  or a->>'session_id' is distinct from sessao::text or a->>'request_id' is distinct from req::text
  or a->>'operacao' is distinct from 'api.revogar_acesso_paciente'
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
    values(gen_random_uuid(),ator,'api.revogar_acesso_paciente','acesso_paciente',acesso,'negado',req);
  else
   insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,'api.revogar_acesso_paciente','acesso_paciente',acesso,'negado',req);
  end if;
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if jsonb_typeof(e->'versao_esperada') is distinct from 'number' or coalesce(e->>'versao_esperada','') !~ '^[1-9][0-9]*$' or versao is null or versao<1 or versao>=2147483647
  or jsonb_typeof(e->'motivo') is distinct from 'object' or (e->'motivo')-array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
  or e->'motivo'->'formato' is distinct from '1'::jsonb
  or jsonb_typeof(e->'motivo'->'key_id') is distinct from 'string' or coalesce(length(e->'motivo'->>'key_id') between 1 and 128,false) is not true
  or jsonb_typeof(e->'motivo'->'nonce') is distinct from 'string' or coalesce(e->'motivo'->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
  or jsonb_typeof(e->'motivo'->'tag') is distinct from 'string' or coalesce(e->'motivo'->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
  or jsonb_typeof(e->'motivo'->'ciphertext') is distinct from 'string' or coalesce(length(e->'motivo'->>'ciphertext') between 1 and 32768 and e->'motivo'->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true
  or jsonb_typeof(e->'motivo_auditoria') is distinct from 'object' or (e->'motivo_auditoria')-array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
  or e->'motivo_auditoria'->'formato' is distinct from '1'::jsonb
  or jsonb_typeof(e->'motivo_auditoria'->'key_id') is distinct from 'string' or coalesce(length(e->'motivo_auditoria'->>'key_id') between 1 and 128,false) is not true
  or jsonb_typeof(e->'motivo_auditoria'->'nonce') is distinct from 'string' or coalesce(e->'motivo_auditoria'->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
  or jsonb_typeof(e->'motivo_auditoria'->'tag') is distinct from 'string' or coalesce(e->'motivo_auditoria'->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
  or jsonb_typeof(e->'motivo_auditoria'->'ciphertext') is distinct from 'string' or coalesce(length(e->'motivo_auditoria'->>'ciphertext') between 1 and 32768 and e->'motivo_auditoria'->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true
  or jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or coalesce(length(btrim(e->>'chave_idempotencia')) between 1 and 256,false) is not true
  or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string' or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$' then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 perform 1 from cadastro.paciente where id=paciente for update;
 select * into b from operacao.barreira_concessao_acesso_profissional where ator_usuario_id=ator for update;
 select * into reserva_atual from operacao.reserva_concessao_acesso_profissional where id=reserva and ator_usuario_id=ator and epoca=geracao and paciente_reservado_id=paciente for update;
 if not found or b.epoca is distinct from geracao or b.reserva_atual is distinct from reserva or b.resultado_pendente is not null
   or reserva_atual.acao<>'revogar' or reserva_atual.acesso_reservado_id is distinct from acesso or reserva_atual.versao_esperada is distinct from versao or reserva_atual.estado not in ('aberta','confirmada') then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.revogar_acesso_paciente','acesso_paciente',acesso,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
 end if;
 select * into atual from cadastro.acesso_paciente where id=acesso and paciente_id=paciente for update;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.revogar_acesso_paciente','acesso_paciente',acesso,'negado',req);
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','nao_encontrado'),'request_id',req);
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 if reserva_atual.estado='confirmada' and (reserva_atual.chave_idempotencia is distinct from e->>'chave_idempotencia' or reserva_atual.digest_idempotencia is distinct from e->>'digest_idempotencia' or reserva_atual.acesso_resultado_id is distinct from acesso) then
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
 end if;
 if (atual.revogada_em is not null or atual.versao<>versao) and not exists(
  select 1 from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao='api.revogar_acesso_paciente' and r.chave_idempotencia=e->>'chave_idempotencia'
 ) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.revogar_acesso_paciente','acesso_paciente',acesso,'negado',req);
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
 end if;
 insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
  values(gen_random_uuid(),ator,'api.revogar_acesso_paciente',e->>'chave_idempotencia',e->>'digest_idempotencia','registrada',acesso,versao+1)
  on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
 if not found then
  select * into anterior from operacao.requisicao where ator_usuario_id=ator and operacao='api.revogar_acesso_paciente' and chave_idempotencia=e->>'chave_idempotencia';
  if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado is distinct from 'concluida'
   or anterior.resultado_id is distinct from acesso or anterior.resultado_versao is distinct from versao+1 then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,'api.revogar_acesso_paciente','acesso_paciente',acesso,'negado',req);
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
  repeticao:=true;
 else
  if atual.revogada_em is not null or atual.versao<>versao then
   raise exception using errcode='P0002',message='ESTADO_INCONSISTENTE';
  end if;
  update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id=ator,
   motivo_revogacao_cifrado=e->'motivo',versao=versao+1 where id=acesso and paciente_id=paciente and revogada_em is null and cadastro.acesso_paciente.versao=versao;
  if not found then raise exception using errcode='P0002',message='ACESSO_NAO_ATUALIZADO'; end if;
  update operacao.requisicao set estado='concluida' where id=anterior.id and estado='registrada';
  if not found then raise exception using errcode='P0002',message='LEDGER_NAO_FINALIZADO'; end if;
 end if;
 if reserva_atual.estado='aberta' then
  if repeticao then raise exception using errcode='P0002',message='RESERVA_INCONSISTENTE'; end if;
  update operacao.reserva_concessao_acesso_profissional set estado='confirmada',chave_idempotencia=e->>'chave_idempotencia',digest_idempotencia=e->>'digest_idempotencia',paciente_id=paciente,acesso_resultado_id=acesso where id=reserva;
  if not found then raise exception using errcode='P0002',message='RESERVA_NAO_CONFIRMADA'; end if;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id,motivo_cifrado)
  values(case when repeticao then gen_random_uuid() else auditoria_id end,ator,'api.revogar_acesso_paciente','acesso_paciente',acesso,'permitido',req,case when repeticao then null else e->'motivo_auditoria' end);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',jsonb_build_object('id',acesso,'versao',versao+1),'request_id',req);
end $$;
create or replace function operacao.acesso_barreira_composicao_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid:=auth_privado.uid();
 sessao uuid; req uuid; reserva uuid; comando uuid; paciente uuid; epoca bigint; acao_alvo text; acesso_alvo uuid; versao_alvo integer;
 inicio timestamptz; fim timestamptz; dominio text; sujeito text; concessao uuid;
 google record; acao text; resposta text; dados jsonb; autorizado boolean:=false;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(a) is distinct from 'object'
  or e - array['request_id','operacao','epoca','reserva_id','comando_id','paciente_id','acao','acesso_id','versao_esperada','atestado'] <> '{}'::jsonb then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  sessao:=(auth_privado.jwt()->>'session_id')::uuid; req:=(e->>'request_id')::uuid;
  epoca:=(e->>'epoca')::bigint; reserva:=(e->>'reserva_id')::uuid; comando:=(e->>'comando_id')::uuid; paciente:=(e->>'paciente_id')::uuid; acao_alvo:=e->>'acao'; acesso_alvo:=(e->>'acesso_id')::uuid; versao_alvo:=(e->>'versao_esperada')::integer;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 acao:=e->>'operacao';
 if ator is null or sessao is null or req is null or inicio is null or fim is null
  or acao not in ('api.reservar_concessao_acesso_profissional','api.encerrar_concessao_acesso_profissional','api.consultar_barreira_concessao_acesso_profissional','api.reconhecer_barreira_concessao_acesso_profissional')
  or acao is null or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
  or a->>'request_id' is distinct from req::text or a->>'operacao' is distinct from acao
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if (acao<>'api.reservar_concessao_acesso_profissional' and (acao_alvo is not null or acesso_alvo is not null or versao_alvo is not null))
  or (acao='api.reservar_concessao_acesso_profissional' and (epoca is null or epoca<1 or reserva is null or comando is not null or paciente is null or acao_alvo not in ('conceder','revogar') or acao_alvo is null or (acao_alvo='conceder' and (acesso_alvo is not null or versao_alvo is not null)) or (acao_alvo='revogar' and (acesso_alvo is null or versao_alvo is null or versao_alvo<1))))
  or (acao='api.encerrar_concessao_acesso_profissional' and (epoca is null or epoca<1 or comando is null or paciente is not null))
  or (acao='api.consultar_barreira_concessao_acesso_profissional' and (epoca is not null or reserva is not null or comando is not null or paciente is not null))
  or (acao='api.reconhecer_barreira_concessao_acesso_profissional' and (epoca is not null or reserva is not null or comando is null or paciente is not null)) then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
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
    values(gen_random_uuid(),ator,acao,'requisicao',null,'negado',req);
  else
   insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'requisicao',null,'negado',req);
  end if;
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 -- Reserva bloqueia paciente antes da barreira, como a criação de contato.
 if acao='api.reservar_concessao_acesso_profissional' then
  perform 1 from cadastro.paciente where id=paciente for key share;
 end if;
 -- A espera pelo bloqueio não pode estender a validade do atestado.
 insert into operacao.barreira_concessao_acesso_profissional(ator_usuario_id) values(ator) on conflict do nothing;
 perform 1 from operacao.barreira_concessao_acesso_profissional where ator_usuario_id=ator for update;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 if acao='api.consultar_barreira_concessao_acesso_profissional' then
  dados:=operacao.consultar_barreira_concessao_acesso_profissional_privado(req);
 elsif acao='api.reconhecer_barreira_concessao_acesso_profissional' then
  resposta:=operacao.reconhecer_barreira_concessao_acesso_profissional_privado(comando,req);
 elsif acao='api.reservar_concessao_acesso_profissional' then
  resposta:=operacao.reservar_concessao_acesso_profissional_privado(ator,epoca,reserva,paciente,acao_alvo,acesso_alvo,versao_alvo);
 else
  resposta:=operacao.encerrar_concessao_acesso_profissional_privado(ator,epoca,reserva,comando);
 end if;
 if acao in ('api.reservar_concessao_acesso_profissional','api.encerrar_concessao_acesso_profissional') then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'requisicao',null,case when resposta in ('aberta','confirmada','cancelada','vazia') then 'permitido' else 'negado' end,req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',coalesce(dados,jsonb_build_object('estado',resposta)),'request_id',req);
end $$;
select set_config('ffcmapp.vinculos_audit_migrador',current_user,false);
select set_config('ffcmapp.vinculos_audit_tinha_set',pg_has_role(current_user,'ffcmapp_listar_vinculos_owner','SET')::text,false);
do $$ begin if current_setting('ffcmapp.vinculos_audit_tinha_set')='false' then
 if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor where r.rolname='ffcmapp_listar_vinculos_owner' and u.rolname=current_user and g.rolname=current_user) then raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET'; end if;
 execute format('grant ffcmapp_listar_vinculos_owner to %I with inherit false, set true granted by %I',current_user,current_user); end if; end $$;
select set_config('ffcmapp.vinculos_audit_tinha_create',has_schema_privilege('ffcmapp_listar_vinculos_owner','api','CREATE')::text,false);
do $$ begin if current_setting('ffcmapp.vinculos_audit_tinha_create')='false' then grant create on schema api to ffcmapp_listar_vinculos_owner; end if; end $$;
set role ffcmapp_listar_vinculos_owner;
create or replace function api.listar_vinculos_profissionais_privado(p_request_id uuid, p_paciente_id uuid, p_cursor uuid default null)
 returns jsonb language plpgsql security definer set search_path='' set row_security=on as $$
declare sessao jsonb; ator uuid:=auth_privado.uid(); pagina jsonb;
begin
 if p_request_id is null or p_paciente_id is null then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
 sessao:=api.consultar_sessao_nativa(p_request_id);
 if sessao is null or sessao#>>'{usuario,id}' is distinct from ator::text or sessao#>>'{usuario,perfil}' is distinct from 'administrador' then
  if exists(select 1 from public.usuario where id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.listar_vinculos_profissionais','paciente',null,'negado',p_request_id);
  elsif ator is not null then
   insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,'api.listar_vinculos_profissionais','paciente',null,'negado',p_request_id);
  else
   raise exception using errcode='42501',message='SEM_PERMISSAO';
  end if;
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',p_request_id);
 end if;
 with itens as (
  select a.id,a.usuario_id,a.revogada_em,a.versao from cadastro.acesso_paciente a
  where a.paciente_id=p_paciente_id and (p_cursor is null or a.id>p_cursor) order by a.id limit 51
 ), numerados as (select *, row_number() over(order by id) n from itens)
 select jsonb_build_object('itens',coalesce(jsonb_agg(jsonb_build_object('id',id,'usuario_id',usuario_id,'revogado',revogada_em is not null,'versao',versao) order by id) filter(where n<=50),'[]'::jsonb),
 'proximo_cursor',case when count(*)>50 then max(id::text) filter(where n=50) end) into pagina from numerados;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values(gen_random_uuid(),ator,'api.listar_vinculos_profissionais','paciente',p_paciente_id,'permitido',p_request_id);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 return jsonb_build_object('ok',true,'dados',pagina,'request_id',p_request_id);
end $$;
select set_config('role',current_setting('ffcmapp.vinculos_audit_migrador'),false);
do $$ begin if current_setting('ffcmapp.vinculos_audit_tinha_create')='false' then revoke create on schema api from ffcmapp_listar_vinculos_owner; end if; if current_setting('ffcmapp.vinculos_audit_tinha_set')='false' then execute format('revoke ffcmapp_listar_vinculos_owner from %I granted by %I',current_user,current_user); end if; end $$;
