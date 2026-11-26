-- FR-002: operação privada de leitura/gravação do mapa de pessoas da rede de cuidado.
-- Vínculo é descritivo e nunca soma permissão: esta operação lê e grava o mapa cifrado,
-- e a autorização permanece a do caso, idêntica à da anamnese.
-- Consolida numa migration o que a anamnese alcançou em quatro (owner isolado, grants
-- mínimos, policies, idempotência por chave e auditoria obrigatória em todo caminho).
-- Autorização: mesmo recorte provisório da anamnese — colaborador ativo (administrador ou
-- profissional) com concessão de equipe vigente por Google Workspace; família não recebe
-- acesso por inferência. Sem grant de aplicação: exposição exige migration de grant própria.
select set_config('ffcmapp.migrador_rede_cuidado', current_user, false);
create role ffcmapp_rede_cuidado_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_rede_cuidado_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_rede_cuidado_owner;
grant usage on schema public, identidade, cadastro, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_rede_cuidado_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid, uuid) to ffcmapp_rede_cuidado_owner;

-- Concede execução do verificador de atestado preservando membership preexistente.
select set_config('ffcmapp.rede_tinha_verificador', pg_has_role(current_user, 'ffcmapp_atestado_verificador_owner', 'SET')::text, false);
do $$ begin
  if current_setting('ffcmapp.rede_tinha_verificador') = 'false' then
    if exists(select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid
      join pg_roles u on u.oid = m.member join pg_roles g on g.oid = m.grantor
      where r.rolname = 'ffcmapp_atestado_verificador_owner' and u.rolname = current_user and g.rolname = current_user) then
      raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text, text, jsonb, jsonb, text) to ffcmapp_rede_cuidado_owner;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_rede_cuidado'), false);
do $$ begin
  if current_setting('ffcmapp.rede_tinha_verificador') = 'false' then
    execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;

grant select (dominio_workspace, google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_rede_cuidado_owner;
grant select (id, perfil, ativo), update (versao) on public.usuario to ffcmapp_rede_cuidado_owner;
grant select (id, usuario_id, perfil, estado, subject_google, metodo), update (versao) on identidade.concessao_equipe to ffcmapp_rede_cuidado_owner;
grant select (session_id, usuario_id, concessao_id, metodo, revogada_em, encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_rede_cuidado_owner;
grant select (id), update (versao) on cadastro.paciente to ffcmapp_rede_cuidado_owner;
grant select, insert on cadastro.rede_cuidado_versao, operacao.requisicao to ffcmapp_rede_cuidado_owner;
grant insert (id, ator_usuario_id, ator_auth_id, acao, tipo_objeto, objeto_id, resultado, request_id) on auditoria.evento to ffcmapp_rede_cuidado_owner;

create policy rede_owner_config on identidade.configuracao_auth_nativo for select to ffcmapp_rede_cuidado_owner using (true);
create policy rede_owner_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_rede_cuidado_owner using (true) with check (false);
create policy rede_owner_usuario on public.usuario for select to ffcmapp_rede_cuidado_owner using (id = (select auth_privado.uid()));
create policy rede_owner_usuario_lock on public.usuario for update to ffcmapp_rede_cuidado_owner using (id = (select auth_privado.uid())) with check (false);
create policy rede_owner_concessao on identidade.concessao_equipe for select to ffcmapp_rede_cuidado_owner using (usuario_id = (select auth_privado.uid()));
create policy rede_owner_concessao_lock on identidade.concessao_equipe for update to ffcmapp_rede_cuidado_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy rede_owner_sessao on identidade.sessao for select to ffcmapp_rede_cuidado_owner using (usuario_id = (select auth_privado.uid()));
create policy rede_owner_sessao_lock on identidade.sessao for update to ffcmapp_rede_cuidado_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy rede_owner_paciente on cadastro.paciente for select to ffcmapp_rede_cuidado_owner using (
  exists (
    select 1 from public.usuario u
    join identidade.concessao_equipe c on c.usuario_id = u.id and c.perfil = u.perfil
    join identidade.sessao s on s.usuario_id = u.id and s.concessao_id = c.id
    join identidade.configuracao_auth_nativo cfg on cfg.google_unico_oauth_confirmado
    join auth_privado.identidades() i on i.user_id = u.id and i.provider = 'google'
    where u.id = (select auth_privado.uid()) and u.ativo and u.perfil in ('administrador', 'profissional')
      and c.estado = 'vinculada' and c.metodo = 'google_workspace' and c.subject_google = i.provider_id
      and s.session_id::text = (select auth_privado.jwt()->>'session_id') and s.metodo = 'google_workspace'
      and s.revogada_em is null and s.encerrada_em is null
      and exists(select 1 from auth_privado.sessoes() a where a.id = s.session_id and a.user_id = u.id and (a.not_after is null or a.not_after > clock_timestamp()))
      and (select count(*) from auth_privado.identidades() j where j.user_id = u.id and j.provider = 'google') = 1
      and i.identity_data->>'sub' = i.provider_id and i.identity_data->>'email_verified' = 'true'
      and i.identity_data#>>'{custom_claims,hd}' = cfg.dominio_workspace
      and exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr') = 'array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth')
  )
);
create policy rede_owner_paciente_lock on cadastro.paciente for update to ffcmapp_rede_cuidado_owner using (true) with check (false);
create policy rede_owner_versao on cadastro.rede_cuidado_versao for select to ffcmapp_rede_cuidado_owner using (exists(select 1 from cadastro.paciente p where p.id = paciente_id));
create policy rede_owner_versao_inserir on cadastro.rede_cuidado_versao for insert to ffcmapp_rede_cuidado_owner with check (criado_por_usuario_id = (select auth_privado.uid()) and exists(select 1 from cadastro.paciente p where p.id = paciente_id));
create policy rede_owner_requisicao on operacao.requisicao for select to ffcmapp_rede_cuidado_owner using (ator_usuario_id = (select auth_privado.uid()) and operacao = 'api.gravar_rede_cuidado');
create policy rede_owner_requisicao_inserir on operacao.requisicao for insert to ffcmapp_rede_cuidado_owner with check (ator_usuario_id = (select auth_privado.uid()) and operacao = 'api.gravar_rede_cuidado');
create policy rede_owner_auditoria on auditoria.evento for insert to ffcmapp_rede_cuidado_owner with check (ator_usuario_id = (select auth_privado.uid()));
-- Negativa de Auth sem perfil preserva identidade sem criar usuário.
create policy rede_ator_exclusivo on auditoria.evento as restrictive for insert to ffcmapp_rede_cuidado_owner
  with check (ator_usuario_id is null or ator_auth_id is null);
create policy rede_auth_nao_admitido on auditoria.evento for insert to ffcmapp_rede_cuidado_owner
  with check (ator_usuario_id is null and operador_restrito is null and ator_auth_id = (select auth_privado.uid())
    and resultado = 'negado' and acao in ('api.ler_rede_cuidado', 'api.gravar_rede_cuidado') and tipo_objeto = 'paciente'
    and not exists(select 1 from public.usuario u where u.id = (select auth_privado.uid())));

set role ffcmapp_rede_cuidado_owner;
create function api.rede_cuidado_operacao_privada(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
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
  or e - array['request_id','paciente_id','registro_id','versao_esperada','conteudo','aad','atestado','chave_idempotencia','digest_idempotencia'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
  acao:=a->>'operacao';
  if acao='api.gravar_rede_cuidado' then
   registro:=(e->>'registro_id')::uuid; esperada:=(e->>'versao_esperada')::integer;
  end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or inicio is null or fim is null
  or acao not in ('api.ler_rede_cuidado','api.gravar_rede_cuidado') or acao is null
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
 if acao='api.ler_rede_cuidado' then
  if e - array['request_id','paciente_id','atestado'] <> '{}'::jsonb then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente;
 else
  if jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or length(btrim(e->>'chave_idempotencia')) not between 1 and 256
   or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string' or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$'
   or registro is null or esperada is null or esperada<0 or esperada=2147483647
   or jsonb_typeof(e->'versao_esperada') is distinct from 'number'
   or coalesce(e->>'versao_esperada','') !~ '^(0|[1-9][0-9]*)$'
   or e->'aad' is distinct from jsonb_build_object('tabela','cadastro.rede_cuidado_versao','paciente_id',paciente::text,'registro_id',registro::text,'versao',esperada+1,'campo','conteudo','formato',1) then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  envelope:=e->'conteudo';
  if jsonb_typeof(envelope) is distinct from 'object' or envelope - array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
   or envelope->'formato' is distinct from '1'::jsonb or jsonb_typeof(envelope->'key_id') is distinct from 'string'
   or coalesce(length(envelope->>'key_id') between 1 and 128,false) is not true
   or jsonb_typeof(envelope->'nonce') is distinct from 'string' or coalesce(envelope->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
   or jsonb_typeof(envelope->'tag') is distinct from 'string' or coalesce(envelope->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
   or jsonb_typeof(envelope->'ciphertext') is distinct from 'string'
   or coalesce(length(envelope->>'ciphertext') between 1 and 32768 and envelope->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente for update;
 end if;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 if acao='api.gravar_rede_cuidado' then
  select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
  repeticao:=found;
  if not found then
   select v.versao into atual from cadastro.rede_cuidado_versao v where v.paciente_id=paciente order by v.versao desc limit 1;
   if coalesce(atual,0)<>esperada then
    insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
     values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
    if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
   end if;
   insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
    values(gen_random_uuid(),ator,acao,e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',registro,esperada+1)
    on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
   if found then
    insert into cadastro.rede_cuidado_versao(id,paciente_id,versao,versao_esperada,conteudo_cifrado,criado_por_usuario_id)
     values(registro,paciente,esperada+1,nullif(esperada,0),envelope,ator);
   else
    repeticao:=true;
    select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
   end if;
  end if;
  if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado <> 'concluida'
   or not exists(select 1 from cadastro.rede_cuidado_versao v where v.id=anterior.resultado_id and v.paciente_id=paciente and v.versao=anterior.resultado_versao) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
  select jsonb_build_object('registro_id',v.id,'paciente_id',v.paciente_id,'versao',v.versao,'conteudo',v.conteudo_cifrado)
   into resultado from cadastro.rede_cuidado_versao v where v.id=anterior.resultado_id;
 else
  select jsonb_build_object('registro_id',v.id,'paciente_id',v.paciente_id,'versao',v.versao,'conteudo',v.conteudo_cifrado)
   into resultado from cadastro.rede_cuidado_versao v where v.paciente_id=paciente order by v.versao desc limit 1;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req,'repeticao',repeticao);
end $$;
revoke all on function api.rede_cuidado_operacao_privada(jsonb) from public,anon,authenticated,service_role;

create function api.rede_cuidado_privado(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
declare req uuid; paciente uuid; acao text;
begin
 begin
  return api.rede_cuidado_operacao_privada(p_transporte);
 exception when sqlstate 'PZ001' then
  req:=(p_transporte#>>'{entrada,request_id}')::uuid;
  paciente:=(p_transporte#>>'{entrada,paciente_id}')::uuid;
  acao:=p_transporte#>>'{entrada,atestado,operacao}';
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),auth_privado.uid(),acao,'paciente',paciente,'negado',req);
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end;
end $$;
revoke all on function api.rede_cuidado_privado(jsonb) from public,anon,authenticated,service_role;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_rede_cuidado'), false);
revoke create on schema api from ffcmapp_rede_cuidado_owner;
revoke ffcmapp_rede_cuidado_owner from current_user;
