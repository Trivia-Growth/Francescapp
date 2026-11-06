-- Preparação privada: revisão S-02 e provas reais de RLS e concorrência precedem qualquer exposição.
create role ffcmapp_conceder_acesso_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_conceder_acesso_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_conceder_acesso_owner;
grant usage on schema public, identidade, cadastro, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_conceder_acesso_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid,uuid), operacao.conceder_acesso_paciente_privado(jsonb) to ffcmapp_conceder_acesso_owner;
grant select (dominio_workspace,google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_conceder_acesso_owner;
grant select (id,perfil,ativo), update (versao) on public.usuario to ffcmapp_conceder_acesso_owner;
grant select (id,usuario_id,perfil,estado,subject_google,metodo), update (versao) on identidade.concessao_equipe to ffcmapp_conceder_acesso_owner;
grant select (session_id,usuario_id,concessao_id,metodo,revogada_em,encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_conceder_acesso_owner;
grant select (usuario_id,concessao_id), update (concessao_id) on identidade.excecao_tecnica to ffcmapp_conceder_acesso_owner;
grant select (id), update (versao) on cadastro.paciente to ffcmapp_conceder_acesso_owner;
grant select on cadastro.acesso_paciente to ffcmapp_conceder_acesso_owner;
grant select, insert on operacao.requisicao to ffcmapp_conceder_acesso_owner;
grant insert (id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id,motivo_cifrado) on auditoria.evento to ffcmapp_conceder_acesso_owner;
grant insert (id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado) on cadastro.acesso_paciente to ffcmapp_conceder_acesso_owner;
grant delete on operacao.requisicao to ffcmapp_conceder_acesso_owner;
create policy conceder_acesso_owner_configuracao_auth_nativo on identidade.configuracao_auth_nativo for select to ffcmapp_conceder_acesso_owner using (true);
create policy conceder_acesso_owner_configuracao_auth_nativo_lock on identidade.configuracao_auth_nativo for update to ffcmapp_conceder_acesso_owner using (true) with check (false);
create policy conceder_acesso_owner_usuario on public.usuario for select to ffcmapp_conceder_acesso_owner using (id=(select auth_privado.uid()) or (perfil='profissional' and ativo));
create policy conceder_acesso_owner_usuario_lock on public.usuario for update to ffcmapp_conceder_acesso_owner using (id=(select auth_privado.uid()) or (perfil='profissional' and ativo)) with check (false);
create policy conceder_acesso_owner_concessao_equipe on identidade.concessao_equipe for select to ffcmapp_conceder_acesso_owner using (usuario_id=(select auth_privado.uid()));
create policy conceder_acesso_owner_concessao_equipe_lock on identidade.concessao_equipe for update to ffcmapp_conceder_acesso_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy conceder_acesso_owner_sessao on identidade.sessao for select to ffcmapp_conceder_acesso_owner using (usuario_id=(select auth_privado.uid()));
create policy conceder_acesso_owner_sessao_lock on identidade.sessao for update to ffcmapp_conceder_acesso_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy conceder_acesso_owner_excecao_tecnica on identidade.excecao_tecnica for select to ffcmapp_conceder_acesso_owner using (usuario_id=(select auth_privado.uid()));
create policy conceder_acesso_owner_excecao_tecnica_lock on identidade.excecao_tecnica for update to ffcmapp_conceder_acesso_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy conceder_acesso_owner_paciente on cadastro.paciente for select to ffcmapp_conceder_acesso_owner using (exists (select 1 from public.usuario u where u.id=(select auth_privado.uid()) and u.ativo and u.perfil='administrador'));
create policy conceder_acesso_owner_paciente_lock on cadastro.paciente for update to ffcmapp_conceder_acesso_owner using (exists (select 1 from public.usuario u where u.id=(select auth_privado.uid()) and u.ativo and u.perfil='administrador')) with check (false);
create policy conceder_acesso_owner_acesso_select on cadastro.acesso_paciente for select to ffcmapp_conceder_acesso_owner using (exists (select 1 from public.usuario u where u.id=(select auth_privado.uid()) and u.ativo and u.perfil='administrador'));
create policy conceder_acesso_owner_requisicao on operacao.requisicao to ffcmapp_conceder_acesso_owner using (ator_usuario_id=(select auth_privado.uid()) and operacao='api.conceder_acesso_paciente') with check (ator_usuario_id=(select auth_privado.uid()) and operacao='api.conceder_acesso_paciente');
create policy conceder_acesso_owner_auditoria on auditoria.evento for insert to ffcmapp_conceder_acesso_owner with check (ator_usuario_id=(select auth_privado.uid()) and acao='api.conceder_acesso_paciente' and tipo_objeto='acesso_paciente');
create policy conceder_acesso_owner_acesso_insert on cadastro.acesso_paciente for insert to ffcmapp_conceder_acesso_owner with check (exists (select 1 from public.usuario u where u.id=(select auth_privado.uid()) and u.ativo and u.perfil='administrador') and concedido_por_usuario_id=(select auth_privado.uid()) and exists (select 1 from public.usuario u where u.id=usuario_id and u.perfil='profissional' and u.ativo));
create function api.conceder_acesso_paciente_privado(p_transporte jsonb) returns jsonb
language sql security definer set search_path='' set row_security=on as $$
 select operacao.conceder_acesso_paciente_privado(p_transporte);
$$;
alter function api.conceder_acesso_paciente_privado(jsonb) owner to ffcmapp_conceder_acesso_owner;
select set_config('ffcmapp.conceder_acesso_migrador',current_user,false);
set role ffcmapp_conceder_acesso_owner;
revoke all on function api.conceder_acesso_paciente_privado(jsonb) from public,anon,authenticated,service_role;
reset role;
select set_config('role',current_setting('ffcmapp.conceder_acesso_migrador'),false);
revoke create on schema api from ffcmapp_conceder_acesso_owner;
revoke ffcmapp_conceder_acesso_owner from current_user;
create role ffcmapp_revogar_acesso_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_revogar_acesso_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_revogar_acesso_owner;
grant usage on schema public, identidade, cadastro, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_revogar_acesso_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid,uuid), operacao.revogar_acesso_paciente_privado(jsonb) to ffcmapp_revogar_acesso_owner;
grant select (dominio_workspace,google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_revogar_acesso_owner;
grant select (id,perfil,ativo), update (versao) on public.usuario to ffcmapp_revogar_acesso_owner;
grant select (id,usuario_id,perfil,estado,subject_google,metodo), update (versao) on identidade.concessao_equipe to ffcmapp_revogar_acesso_owner;
grant select (session_id,usuario_id,concessao_id,metodo,revogada_em,encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_revogar_acesso_owner;
grant select (usuario_id,concessao_id), update (concessao_id) on identidade.excecao_tecnica to ffcmapp_revogar_acesso_owner;
grant select (id), update (versao) on cadastro.paciente to ffcmapp_revogar_acesso_owner;
grant select on cadastro.acesso_paciente to ffcmapp_revogar_acesso_owner;
grant select, insert on operacao.requisicao to ffcmapp_revogar_acesso_owner;
grant insert (id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id,motivo_cifrado) on auditoria.evento to ffcmapp_revogar_acesso_owner;
grant update (revogada_em,revogado_por_usuario_id,motivo_revogacao_cifrado,versao) on cadastro.acesso_paciente to ffcmapp_revogar_acesso_owner;
grant update (estado) on operacao.requisicao to ffcmapp_revogar_acesso_owner;
create policy revogar_acesso_owner_configuracao_auth_nativo on identidade.configuracao_auth_nativo for select to ffcmapp_revogar_acesso_owner using (true);
create policy revogar_acesso_owner_configuracao_auth_nativo_lock on identidade.configuracao_auth_nativo for update to ffcmapp_revogar_acesso_owner using (true) with check (false);
create policy revogar_acesso_owner_usuario on public.usuario for select to ffcmapp_revogar_acesso_owner using (id=(select auth_privado.uid()));
create policy revogar_acesso_owner_usuario_lock on public.usuario for update to ffcmapp_revogar_acesso_owner using (id=(select auth_privado.uid())) with check (false);
create policy revogar_acesso_owner_concessao_equipe on identidade.concessao_equipe for select to ffcmapp_revogar_acesso_owner using (usuario_id=(select auth_privado.uid()));
create policy revogar_acesso_owner_concessao_equipe_lock on identidade.concessao_equipe for update to ffcmapp_revogar_acesso_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy revogar_acesso_owner_sessao on identidade.sessao for select to ffcmapp_revogar_acesso_owner using (usuario_id=(select auth_privado.uid()));
create policy revogar_acesso_owner_sessao_lock on identidade.sessao for update to ffcmapp_revogar_acesso_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy revogar_acesso_owner_excecao_tecnica on identidade.excecao_tecnica for select to ffcmapp_revogar_acesso_owner using (usuario_id=(select auth_privado.uid()));
create policy revogar_acesso_owner_excecao_tecnica_lock on identidade.excecao_tecnica for update to ffcmapp_revogar_acesso_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy revogar_acesso_owner_paciente on cadastro.paciente for select to ffcmapp_revogar_acesso_owner using (exists (select 1 from public.usuario u where u.id=(select auth_privado.uid()) and u.ativo and u.perfil='administrador'));
create policy revogar_acesso_owner_paciente_lock on cadastro.paciente for update to ffcmapp_revogar_acesso_owner using (exists (select 1 from public.usuario u where u.id=(select auth_privado.uid()) and u.ativo and u.perfil='administrador')) with check (false);
create policy revogar_acesso_owner_acesso_select on cadastro.acesso_paciente for select to ffcmapp_revogar_acesso_owner using (exists (select 1 from public.usuario u where u.id=(select auth_privado.uid()) and u.ativo and u.perfil='administrador'));
create policy revogar_acesso_owner_requisicao on operacao.requisicao to ffcmapp_revogar_acesso_owner using (ator_usuario_id=(select auth_privado.uid()) and operacao='api.revogar_acesso_paciente') with check (ator_usuario_id=(select auth_privado.uid()) and operacao='api.revogar_acesso_paciente');
create policy revogar_acesso_owner_auditoria on auditoria.evento for insert to ffcmapp_revogar_acesso_owner with check (ator_usuario_id=(select auth_privado.uid()) and acao='api.revogar_acesso_paciente' and tipo_objeto='acesso_paciente');
create policy revogar_acesso_owner_acesso_update on cadastro.acesso_paciente for update to ffcmapp_revogar_acesso_owner using (exists (select 1 from public.usuario u where u.id=(select auth_privado.uid()) and u.ativo and u.perfil='administrador')) with check (exists (select 1 from public.usuario u where u.id=(select auth_privado.uid()) and u.ativo and u.perfil='administrador') and revogado_por_usuario_id=(select auth_privado.uid()) and revogada_em is not null);
create function api.revogar_acesso_paciente_privado(p_transporte jsonb) returns jsonb
language sql security definer set search_path='' set row_security=on as $$
 select operacao.revogar_acesso_paciente_privado(p_transporte);
$$;
alter function api.revogar_acesso_paciente_privado(jsonb) owner to ffcmapp_revogar_acesso_owner;
select set_config('ffcmapp.revogar_acesso_migrador',current_user,false);
set role ffcmapp_revogar_acesso_owner;
revoke all on function api.revogar_acesso_paciente_privado(jsonb) from public,anon,authenticated,service_role;
reset role;
select set_config('role',current_setting('ffcmapp.revogar_acesso_migrador'),false);
revoke create on schema api from ffcmapp_revogar_acesso_owner;
revoke ffcmapp_revogar_acesso_owner from current_user;
-- Preserva associações preexistentes do migrador ao owner do verificador.
select set_config('ffcmapp.acesso_migrador',current_user,false);
select set_config('ffcmapp.acesso_tinha_verificador',pg_has_role(current_user,'ffcmapp_atestado_verificador_owner','SET')::text,false);
do $$ begin
 if current_setting('ffcmapp.acesso_tinha_verificador')='false' then
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor
   where r.rolname='ffcmapp_atestado_verificador_owner' and u.rolname=current_user and g.rolname=current_user) then
   raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
  end if;
  execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text) to ffcmapp_conceder_acesso_owner,ffcmapp_revogar_acesso_owner;
reset role;
select set_config('role',current_setting('ffcmapp.acesso_migrador'),false);
do $$ begin
 if current_setting('ffcmapp.acesso_tinha_verificador')='false' then
  execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I',current_user,current_user);
 end if;
end $$;
