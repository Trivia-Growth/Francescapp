-- Alteração aditiva; exposição e provas de autorização permanecem pendentes.
-- Preparação privada, sem wrapper, owner ou grants de aplicação. Revisão e provas pendentes.
create or replace function operacao.listar_concessoes_equipe_privado(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid; sessao uuid; req uuid;
 inicio timestamptz; fim timestamptz; concessao uuid; dominio text; sujeito text; google record;
 autorizado boolean:=false; limite integer; cursor_id uuid; cursor_criado timestamptz; estado text; pagina jsonb;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object' or e - array['request_id','limite','cursor','estado','atestado'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' or jsonb_typeof(e->'limite') is distinct from 'number'
  or coalesce(e->>'limite','') !~ '^(100|[1-9][0-9]?)$'
  or (e ? 'cursor' and jsonb_typeof(e->'cursor') is distinct from 'string')
  or (e ? 'estado' and (jsonb_typeof(e->'estado') is distinct from 'string' or e->>'estado' not in ('pendente','vinculada','revogada'))) then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid; req:=(e->>'request_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
  limite:=(e->>'limite')::integer; estado:=e->>'estado';
  if e ? 'cursor' then cursor_id:=(e->>'cursor')::uuid; end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or inicio is null or fim is null
  or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
  or a->>'request_id' is distinct from req::text or a->>'operacao' is distinct from 'api.listar_concessoes_equipe'
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
 if autorizado and cursor_id is not null then
  select c.criada_em into cursor_criado from identidade.concessao_equipe c
   where c.id=cursor_id and (estado is null or c.estado=estado);
  autorizado:=found;
 end if;
 if autorizado then
  with s as (select c.id,c.criada_em,c.email_cifrado,c.perfil,c.estado,c.usuario_id,c.versao,u.ativo
   from identidade.concessao_equipe c left join public.usuario u on u.id=c.usuario_id
   where (estado is null or c.estado=estado)
    and (cursor_id is null or (c.criada_em,c.id)>(cursor_criado,cursor_id))
   order by c.criada_em,c.id limit limite+1),
  n as (select *,row_number() over(order by criada_em,id) ordem from s)
  select jsonb_build_object('itens',coalesce(jsonb_agg(jsonb_build_object(
   'concessao_id',n.id,'email',n.email_cifrado,'perfil',n.perfil,'estado',n.estado,'usuario_id',n.usuario_id,'versao',n.versao,'ativo',n.ativo)
   order by criada_em,id) filter(where ordem<=limite),'[]'::jsonb),
   'proximo_cursor',case when count(*)>limite then max(id::text) filter(where ordem=limite) end) into pagina from n;
 end if;
 autorizado:=autorizado and fim>clock_timestamp() and exists(select 1 from auth_privado.sessoes() s
  where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp()));
 if exists(select 1 from public.usuario where id=ator) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.listar_concessoes_equipe','concessao_equipe',null,case when autorizado then 'permitido' else 'negado' end,req);
 end if;
 if not autorizado then return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req); end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',pagina,'request_id',req);
end $$;
revoke all on function operacao.listar_concessoes_equipe_privado(jsonb) from public,anon,authenticated,service_role;

create role ffcmapp_listar_equipe_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_listar_equipe_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_listar_equipe_owner;
grant usage on schema public, identidade, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_listar_equipe_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid,uuid), operacao.listar_concessoes_equipe_privado(jsonb) to ffcmapp_listar_equipe_owner;
grant select (dominio_workspace,google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_listar_equipe_owner;
grant select (id,perfil,ativo), update (versao) on public.usuario to ffcmapp_listar_equipe_owner;
grant select (id,usuario_id,perfil,estado,subject_google,metodo,criada_em,email_cifrado,versao), update (versao) on identidade.concessao_equipe to ffcmapp_listar_equipe_owner;
grant select (session_id,usuario_id,concessao_id,metodo,revogada_em,encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_listar_equipe_owner;
grant select (usuario_id,concessao_id), update (concessao_id) on identidade.excecao_tecnica to ffcmapp_listar_equipe_owner;
grant insert (id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) on auditoria.evento to ffcmapp_listar_equipe_owner;
create policy listar_equipe_config_select on identidade.configuracao_auth_nativo for select to ffcmapp_listar_equipe_owner using (true);
create policy listar_equipe_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_listar_equipe_owner using (true) with check (false);
create policy listar_equipe_usuario_select on public.usuario for select to ffcmapp_listar_equipe_owner using (true);
create policy listar_equipe_usuario_lock on public.usuario for update to ffcmapp_listar_equipe_owner using (id=(select auth_privado.uid())) with check (false);
create policy listar_equipe_concessao_select on identidade.concessao_equipe for select to ffcmapp_listar_equipe_owner using (usuario_id=(select auth_privado.uid()) or exists (select 1 from public.usuario u where u.id=(select auth_privado.uid()) and u.ativo and u.perfil='administrador'));
create policy listar_equipe_concessao_lock on identidade.concessao_equipe for update to ffcmapp_listar_equipe_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy listar_equipe_sessao_select on identidade.sessao for select to ffcmapp_listar_equipe_owner using (usuario_id=(select auth_privado.uid()));
create policy listar_equipe_sessao_lock on identidade.sessao for update to ffcmapp_listar_equipe_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy listar_equipe_excecao_select on identidade.excecao_tecnica for select to ffcmapp_listar_equipe_owner using (usuario_id=(select auth_privado.uid()));
create policy listar_equipe_excecao_lock on identidade.excecao_tecnica for update to ffcmapp_listar_equipe_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy listar_equipe_auditoria_insert on auditoria.evento for insert to ffcmapp_listar_equipe_owner with check (ator_usuario_id=(select auth_privado.uid()) and acao='api.listar_concessoes_equipe' and tipo_objeto='concessao_equipe');
create function api.listar_concessoes_equipe_privado(p_transporte jsonb) returns jsonb
language sql security definer set search_path='' set row_security=on as $$
 select operacao.listar_concessoes_equipe_privado(p_transporte);
$$;
alter function api.listar_concessoes_equipe_privado(jsonb) owner to ffcmapp_listar_equipe_owner;
select set_config('ffcmapp.listar_equipe_migrador',current_user,false);
set role ffcmapp_listar_equipe_owner;
revoke all on function api.listar_concessoes_equipe_privado(jsonb) from public,anon,authenticated,service_role;
reset role;
select set_config('role',current_setting('ffcmapp.listar_equipe_migrador'),false);
revoke create on schema api from ffcmapp_listar_equipe_owner;
revoke ffcmapp_listar_equipe_owner from current_user;
select set_config('ffcmapp.listar_equipe_tinha_verificador',pg_has_role(current_user,'ffcmapp_atestado_verificador_owner','SET')::text,false);
do $$ begin
 if current_setting('ffcmapp.listar_equipe_tinha_verificador')='false' then
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor
   where r.rolname='ffcmapp_atestado_verificador_owner' and u.rolname=current_user and g.rolname=current_user) then
   raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
  end if;
  execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text) to ffcmapp_listar_equipe_owner;
reset role;
select set_config('role',current_setting('ffcmapp.listar_equipe_migrador'),false);
do $$ begin
 if current_setting('ffcmapp.listar_equipe_tinha_verificador')='false' then
  execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I',current_user,current_user);
 end if;
end $$;
