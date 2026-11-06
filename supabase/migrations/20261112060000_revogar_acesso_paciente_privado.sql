-- Preparação privada; sem rota pública ou grants de aplicação.
create function operacao.revogar_acesso_paciente_privado(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado';
 ator uuid; sessao uuid; req uuid; paciente uuid; acesso uuid; auditoria_id uuid;
 inicio timestamptz; fim timestamptz; concessao uuid; dominio text; sujeito text;
 google record; autorizado boolean:=false; repeticao boolean:=false;
 anterior operacao.requisicao; atual cadastro.acesso_paciente; versao integer;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','acesso_id','auditoria_id','chave_idempotencia','digest_idempotencia','versao_esperada','motivo','atestado'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  acesso:=(e->>'acesso_id')::uuid; auditoria_id:=(e->>'auditoria_id')::uuid;
  versao:=(e->>'versao_esperada')::integer;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or acesso is null or auditoria_id is null
  or inicio is null or fim is null or a->>'usuario_id' is distinct from ator::text
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
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if jsonb_typeof(e->'versao_esperada') is distinct from 'number' or coalesce(e->>'versao_esperada','') !~ '^[1-9][0-9]*$' or versao is null or versao<1 or versao>=2147483647
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
 perform 1 from cadastro.paciente where id=paciente for update;
 select * into atual from cadastro.acesso_paciente where id=acesso and paciente_id=paciente for update;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.revogar_acesso_paciente','acesso_paciente',acesso,'negado',req);
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','nao_encontrado'),'request_id',req);
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
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
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id,motivo_cifrado)
  values(case when repeticao then gen_random_uuid() else auditoria_id end,ator,'api.revogar_acesso_paciente','acesso_paciente',acesso,'permitido',req,case when repeticao then null else e->'motivo' end);
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',jsonb_build_object('id',acesso,'versao',versao+1),'request_id',req);
end $$;
revoke all on function operacao.revogar_acesso_paciente_privado(jsonb) from public,anon,authenticated,service_role;
