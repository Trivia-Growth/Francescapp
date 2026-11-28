-- FR-010, cenário "Autorização antes do envio ao provedor": quem não pode gravar o áudio no
-- caso também não pode fazer o áudio chegar ao provedor externo.
--
-- Até aqui a autorização real (perfil, concessão vinculada, sessão Google Workspace e o
-- paciente visível pela policy `audio_transcricao_paciente`) só rodava dentro de
-- `api.transcricao_operacao_privada`, que é chamada DEPOIS da transcrição. A borda HTTP
-- conferia apenas a sessão Auth, então família, sessão interna ou concessão revogada
-- mandavam a gravação ao OpenRouter antes de o banco negar.
--
-- Esta função toma a mesma decisão de autorização sem gravar nada além da auditoria do
-- negado. Não recebe atestado: decide só pelo JWT da própria requisição e não muda estado.
-- Não substitui a checagem da operação privada, que continua sendo a autoridade final.
-- Rollback: drop function api.autorizar_transcricao_audio(uuid, uuid);
begin;
-- Privilégios temporários só quando ausentes, e devolvidos ao estado anterior no fim.
create temporary table audio_pre_privilegios on commit drop as
 select current_user::text migrador,
  pg_has_role(current_user,'ffcmapp_audio_transcricao_owner','SET') tinha_set,
  has_schema_privilege('ffcmapp_audio_transcricao_owner','api','CREATE') tinha_create;
do $$ declare p record; begin
 select * into p from audio_pre_privilegios;
 if not p.tinha_set then
  if exists(select 1 from pg_auth_members where roleid='ffcmapp_audio_transcricao_owner'::regrole
    and member=current_user::regrole and grantor=current_user::regrole) then
   raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';
  end if;
  execute format('grant ffcmapp_audio_transcricao_owner to %I with inherit false, set true granted by %I', p.migrador, p.migrador);
 end if;
 if not p.tinha_create then grant create on schema api to ffcmapp_audio_transcricao_owner; end if;
end $$;

set role ffcmapp_audio_transcricao_owner;
create function api.autorizar_transcricao_audio(p_request_id uuid, p_paciente_id uuid) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
#variable_conflict use_variable
declare
 ator uuid; sessao uuid; contexto jsonb; autorizado boolean:=false;
 acao constant text:='api.registrar_audio_transcricao';
begin
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
 exception when invalid_text_representation then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or p_request_id is null or p_paciente_id is null then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- Mesma fonte da operação privada desde a DF-023 (20261125170000): contexto de acesso
 -- vigente (Google ou interno gerenciado) e a policy `audio_transcricao_paciente`, que exige
 -- perfil, concessão vinculada e sessão aberta. Copiar a prova Google antiga divergiria dela.
 contexto:=identidade.contexto_acesso_vigente(false);
 if contexto->>'perfil' in ('administrador','profissional') then
  perform 1 from cadastro.paciente p where p.id=p_paciente_id;
  autorizado:=found;
 end if;
 if not autorizado then
  if exists(select 1 from public.usuario where id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',p_paciente_id,'negado',p_request_id);
  else
   insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',p_paciente_id,'negado',p_request_id);
  end if;
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',p_request_id);
 end if;
 return jsonb_build_object('ok',true,'request_id',p_request_id);
end $$;
revoke all on function api.autorizar_transcricao_audio(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function api.autorizar_transcricao_audio(uuid, uuid) to authenticated;
reset role;
do $$ declare p record; begin
 select * into p from audio_pre_privilegios;
 if not p.tinha_create then revoke create on schema api from ffcmapp_audio_transcricao_owner; end if;
 if not p.tinha_set then
  execute format('revoke ffcmapp_audio_transcricao_owner from %I granted by %I', p.migrador, p.migrador);
 end if;
end $$;
commit;
