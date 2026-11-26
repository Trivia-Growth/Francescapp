-- Consulta histórica privada: cursor faz parte da entrada atestada. Sem grants de aplicação.
select set_config('ffcmapp.audit_anamnese_migrador',current_user,false);
select set_config('ffcmapp.audit_anamnese_tinha_set',pg_has_role(current_user,'ffcmapp_anamnese_owner','SET')::text,false);
select set_config('ffcmapp.audit_anamnese_tinha_create',exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a join pg_roles r on r.oid=a.grantee where n.nspname='api' and r.rolname='ffcmapp_anamnese_owner' and a.privilege_type='CREATE')::text,false);
do $$ begin
 if not exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid='api.anamnese_operacao_privada(jsonb)'::regprocedure and r.rolname='ffcmapp_anamnese_owner') then raise exception 'OWNER_INESPERADO'; end if;
 if current_setting('ffcmapp.audit_anamnese_tinha_set')='false' then
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor where r.rolname='ffcmapp_anamnese_owner' and u.rolname=current_user and g.rolname=current_user) then raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET'; end if;
  execute format('grant ffcmapp_anamnese_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
 if current_setting('ffcmapp.audit_anamnese_tinha_create')='false' then grant create on schema api to ffcmapp_anamnese_owner; end if;
end $$;
set role ffcmapp_anamnese_owner;
create function api.historico_anamnese_operacao_privada(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid; sessao uuid; req uuid;
 paciente uuid; registro uuid; esperada integer; atual integer; inicio timestamptz; fim timestamptz;
 concessao uuid; perfil text; sujeito text; google record; dominio text; autorizado boolean:=false;
 acao text; resultado jsonb; envelope jsonb; anterior operacao.requisicao; repeticao boolean:=false;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','registro_id','versao_esperada','conteudo','aad','atestado','chave_idempotencia','digest_idempotencia','antes_versao'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
  acao:=a->>'operacao';
  if e ? 'antes_versao' then esperada:=(e->>'antes_versao')::integer; end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or inicio is null or fim is null
  or acao <> 'api.ler_anamnese' or acao is null
  or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
  or a->>'request_id' is distinct from req::text
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
  if google.identity_data->>'sub'=google.provider_id and google.identity_data->>'email_verified'='true'
    and google.identity_data#>>'{custom_claims,hd}'=dominio then
   select c.id,c.perfil,c.subject_google into concessao,perfil,sujeito from identidade.concessao_equipe c
    where c.usuario_id=ator and c.estado='vinculada' and c.metodo='google_workspace' for share;
   if found and perfil in ('administrador','profissional') and sujeito=google.provider_id then
    perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil=perfil for share;
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
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  else
   insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  end if;
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if e - array['request_id','paciente_id','atestado','antes_versao'] <> '{}'::jsonb
  or (e ? 'antes_versao' and (jsonb_typeof(e->'antes_versao') is distinct from 'number'
   or coalesce(e->>'antes_versao','') !~ '^[1-9][0-9]*$' or esperada is null or esperada < 1)) then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 perform 1 from cadastro.paciente p where p.id=paciente;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 select jsonb_build_object('registro_id',v.id,'paciente_id',v.paciente_id,'versao',v.versao,'conteudo',v.conteudo_cifrado,'criado_por_usuario_id',v.criado_por_usuario_id,'criado_em',v.criado_em)
  into resultado from cadastro.anamnese_versao v where v.paciente_id=paciente
  and (esperada is null or v.versao<esperada) order by v.versao desc limit 1;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req,'repeticao',repeticao);
end $$;
revoke all on function api.historico_anamnese_operacao_privada(jsonb) from public,anon,authenticated,service_role;
create function api.historico_anamnese_privada(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
declare req uuid; paciente uuid;
begin
 begin
  return api.historico_anamnese_operacao_privada(p_transporte);
 exception when sqlstate 'PZ001' then
  req:=(p_transporte#>>'{entrada,request_id}')::uuid;
  paciente:=(p_transporte#>>'{entrada,paciente_id}')::uuid;
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),auth_privado.uid(),'api.ler_anamnese','paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end;
end $$;
revoke all on function api.historico_anamnese_privada(jsonb) from public,anon,authenticated,service_role;
reset role;
select set_config('role',current_setting('ffcmapp.audit_anamnese_migrador'),false);
do $$ begin
 if current_setting('ffcmapp.audit_anamnese_tinha_create')='false' then revoke create on schema api from ffcmapp_anamnese_owner; end if;
 if current_setting('ffcmapp.audit_anamnese_tinha_set')='false' then execute format('revoke ffcmapp_anamnese_owner from %I granted by %I',current_user,current_user); end if;
end $$;
