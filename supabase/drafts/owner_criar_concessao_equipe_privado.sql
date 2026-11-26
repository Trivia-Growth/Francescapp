-- Draft local: wrapper fechado, sem grant para aplicações. Revisão S-02 pendente.
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
