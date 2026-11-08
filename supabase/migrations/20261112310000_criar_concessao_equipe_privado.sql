-- Preparação privada fechada. Nenhum grant de execução para aplicação.
-- Preparação privada. Sem grants de aplicação; exige revisão S-02 e provas reais antes de exposição.
create function operacao.criar_concessao_equipe_privado(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado';
 ator uuid; sessao uuid; req uuid; paciente uuid; acesso uuid; destinatario uuid; auditoria_id uuid;
 inicio timestamptz; fim timestamptz; concessao uuid; dominio text; sujeito text;
 google record; autorizado boolean:=false; repeticao boolean:=false; anterior operacao.requisicao; resultado jsonb;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','concessao_id','email','email_hmac','perfil','metodo','auditoria_id','chave_idempotencia','digest_idempotencia','motivo','atestado'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; acesso:=(e->>'concessao_id')::uuid; auditoria_id:=(e->>'auditoria_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or acesso is null or auditoria_id is null
  or inicio is null or fim is null or a->>'usuario_id' is distinct from ator::text
  or a->>'session_id' is distinct from sessao::text or a->>'request_id' is distinct from req::text
  or a->>'operacao' is distinct from 'api.criar_concessao_equipe'
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
    values(gen_random_uuid(),ator,'api.criar_concessao_equipe','concessao_equipe',acesso,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if coalesce(e->>'perfil','') not in ('administrador','profissional') or e->>'metodo' is distinct from 'google_workspace'
  or coalesce(e->>'email_hmac','') !~ '^[A-Za-z0-9_-]{43}$'
  or coalesce(length(btrim(e->>'chave_idempotencia')) between 1 and 256,false) is not true
  or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$' then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 -- Validação estrita dos envelopes antes da persistência.
 for resultado in select value from jsonb_array_elements(jsonb_build_array(e->'email',e->'motivo')) loop
  if jsonb_typeof(resultado) is distinct from 'object' or resultado - array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
   or resultado->'formato' is distinct from '1'::jsonb
   or jsonb_typeof(resultado->'key_id') is distinct from 'string' or coalesce(length(resultado->>'key_id') between 1 and 128,false) is not true
   or jsonb_typeof(resultado->'nonce') is distinct from 'string' or coalesce(resultado->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
   or jsonb_typeof(resultado->'tag') is distinct from 'string' or coalesce(resultado->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
   or jsonb_typeof(resultado->'ciphertext') is distinct from 'string' or coalesce(length(resultado->>'ciphertext') between 1 and 32768 and resultado->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
 end loop;
 insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
  values(gen_random_uuid(),ator,'api.criar_concessao_equipe',e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',acesso,1)
  on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
 if not found then
  select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao='api.criar_concessao_equipe' and r.chave_idempotencia=e->>'chave_idempotencia';
  if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado is distinct from 'concluida'
   or anterior.resultado_id is distinct from acesso or anterior.resultado_versao is distinct from 1
   or not exists(select 1 from identidade.concessao_equipe c where c.id=acesso and c.criado_por_usuario_id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,'api.criar_concessao_equipe','concessao_equipe',acesso,'negado',req);
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
  -- Serializa a projeção vigente com alteração ou revogação da concessão.
  perform 1 from identidade.concessao_equipe c where c.id=acesso and c.criado_por_usuario_id=ator for share;
  if not found then raise exception using errcode='PZ001',message='RESULTADO_INDISPONIVEL'; end if;
  repeticao:=true;
 else
  begin
   insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,criado_por_usuario_id,motivo_cifrado)
    values(acesso,e->'email',e->>'email_hmac',e->>'perfil',e->>'metodo','pendente',ator,e->'motivo');
  exception when unique_violation then
   delete from operacao.requisicao where id=anterior.id;
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,'api.criar_concessao_equipe','concessao_equipe',acesso,'negado',req);
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
  end;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(case when repeticao then gen_random_uuid() else auditoria_id end,ator,'api.criar_concessao_equipe','concessao_equipe',acesso,'permitido',req);
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 select jsonb_build_object('concessao_id',c.id,'email',c.email_cifrado,'perfil',c.perfil,'estado',c.estado,'usuario_id',c.usuario_id,'versao',c.versao) into resultado from identidade.concessao_equipe c where c.id=acesso;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req);
end $$;
revoke all on function operacao.criar_concessao_equipe_privado(jsonb) from public,anon,authenticated,service_role;
-- Wrapper fechado e owner dedicado seguem abaixo; S-02 e provas reais pendentes.

-- Wrapper fechado, sem grant para aplicações. Revisão S-02 pendente.
create role ffcmapp_criar_equipe_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_criar_equipe_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_criar_equipe_owner;
grant usage on schema public, identidade, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_criar_equipe_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid,uuid), operacao.criar_concessao_equipe_privado(jsonb) to ffcmapp_criar_equipe_owner;
grant select (dominio_workspace,google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_criar_equipe_owner;
grant select (id,perfil,ativo), update (versao) on public.usuario to ffcmapp_criar_equipe_owner;
grant select (id,usuario_id,perfil,estado,subject_google,metodo,criado_por_usuario_id,email_cifrado,versao), insert (id,email_cifrado,email_hmac,perfil,metodo,estado,criado_por_usuario_id,motivo_cifrado), update (versao) on identidade.concessao_equipe to ffcmapp_criar_equipe_owner;
grant select (session_id,usuario_id,concessao_id,metodo,revogada_em,encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_criar_equipe_owner;
grant select (usuario_id,concessao_id), update (concessao_id) on identidade.excecao_tecnica to ffcmapp_criar_equipe_owner;
grant select, insert, delete on operacao.requisicao to ffcmapp_criar_equipe_owner;
grant insert (id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) on auditoria.evento to ffcmapp_criar_equipe_owner;
create policy criar_equipe_config_select on identidade.configuracao_auth_nativo for select to ffcmapp_criar_equipe_owner using (true);
create policy criar_equipe_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_criar_equipe_owner using (true) with check (false);
create policy criar_equipe_usuario_select on public.usuario for select to ffcmapp_criar_equipe_owner using (id=(select auth_privado.uid()));
create policy criar_equipe_usuario_lock on public.usuario for update to ffcmapp_criar_equipe_owner using (id=(select auth_privado.uid())) with check (false);
create policy criar_equipe_concessao_select on identidade.concessao_equipe for select to ffcmapp_criar_equipe_owner using (usuario_id=(select auth_privado.uid()) or criado_por_usuario_id=(select auth_privado.uid()));
create policy criar_equipe_concessao_insert on identidade.concessao_equipe for insert to ffcmapp_criar_equipe_owner with check (criado_por_usuario_id=(select auth_privado.uid()) and estado='pendente' and usuario_id is null);
create policy criar_equipe_concessao_lock on identidade.concessao_equipe for update to ffcmapp_criar_equipe_owner using (usuario_id=(select auth_privado.uid()) or criado_por_usuario_id=(select auth_privado.uid())) with check (false);
create policy criar_equipe_sessao_select on identidade.sessao for select to ffcmapp_criar_equipe_owner using (usuario_id=(select auth_privado.uid()));
create policy criar_equipe_sessao_lock on identidade.sessao for update to ffcmapp_criar_equipe_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy criar_equipe_excecao_select on identidade.excecao_tecnica for select to ffcmapp_criar_equipe_owner using (usuario_id=(select auth_privado.uid()));
create policy criar_equipe_excecao_lock on identidade.excecao_tecnica for update to ffcmapp_criar_equipe_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy criar_equipe_requisicao on operacao.requisicao to ffcmapp_criar_equipe_owner using (ator_usuario_id=(select auth_privado.uid()) and operacao='api.criar_concessao_equipe') with check (ator_usuario_id=(select auth_privado.uid()) and operacao='api.criar_concessao_equipe');
create policy criar_equipe_auditoria on auditoria.evento for insert to ffcmapp_criar_equipe_owner with check (ator_usuario_id=(select auth_privado.uid()) and acao='api.criar_concessao_equipe' and tipo_objeto='concessao_equipe');
create function api.criar_concessao_equipe_privado(p_transporte jsonb) returns jsonb language sql security definer set search_path='' set row_security=on as $$
 select operacao.criar_concessao_equipe_privado(p_transporte)
$$;
alter function api.criar_concessao_equipe_privado(jsonb) owner to ffcmapp_criar_equipe_owner;
select set_config('ffcmapp.criar_equipe_migrador',current_user,false);
set role ffcmapp_criar_equipe_owner;
revoke all on function api.criar_concessao_equipe_privado(jsonb) from public,anon,authenticated,service_role;
reset role;
select set_config('role',current_setting('ffcmapp.criar_equipe_migrador'),false);
revoke create on schema api from ffcmapp_criar_equipe_owner;
revoke ffcmapp_criar_equipe_owner from current_user;
select set_config('ffcmapp.criar_equipe_tinha_verificador',pg_has_role(current_user,'ffcmapp_atestado_verificador_owner','SET')::text,false);
do $$ begin
 if current_setting('ffcmapp.criar_equipe_tinha_verificador')='false' then
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor
   where r.rolname='ffcmapp_atestado_verificador_owner' and u.rolname=current_user and g.rolname=current_user) then
   raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
  end if;
  execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text) to ffcmapp_criar_equipe_owner;
reset role;
select set_config('role',current_setting('ffcmapp.criar_equipe_migrador'),false);
do $$ begin
 if current_setting('ffcmapp.criar_equipe_tinha_verificador')='false' then
  execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I',current_user,current_user);
 end if;
end $$;

