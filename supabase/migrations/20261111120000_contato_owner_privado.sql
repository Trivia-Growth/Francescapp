-- Preparação local: wrappers sem EXECUTE para aplicação; S-02 e provas reais precedem ativação.
create role ffcmapp_contato_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_contato_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_contato_owner;
grant usage on schema public, identidade, cadastro, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_contato_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid,uuid) to ffcmapp_contato_owner;
select set_config('ffcmapp.contato_migrador',current_user,false);
select set_config('ffcmapp.contato_tinha_verificador',pg_has_role(current_user,'ffcmapp_atestado_verificador_owner','SET')::text,false);
do $$ begin
 if current_setting('ffcmapp.contato_tinha_verificador')='false' then
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor
   where r.rolname='ffcmapp_atestado_verificador_owner' and u.rolname=current_user and g.rolname=current_user) then
   raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
  end if;
  execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text) to ffcmapp_contato_owner;
reset role;
select set_config('role',current_setting('ffcmapp.contato_migrador'),false);
do $$ begin
 if current_setting('ffcmapp.contato_tinha_verificador')='false' then
  execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I',current_user,current_user);
 end if;
end $$;
grant select (dominio_workspace,google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_contato_owner;
grant select (id,perfil,ativo), update (versao) on public.usuario to ffcmapp_contato_owner;
grant select (id,usuario_id,perfil,estado,subject_google,metodo), update (versao) on identidade.concessao_equipe to ffcmapp_contato_owner;
grant select (session_id,usuario_id,concessao_id,metodo,revogada_em,encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_contato_owner;
grant select (usuario_id,concessao_id), update (concessao_id) on identidade.excecao_tecnica to ffcmapp_contato_owner;
grant insert (id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id,motivo_cifrado) on auditoria.evento to ffcmapp_contato_owner;

create policy contato_config on identidade.configuracao_auth_nativo for select to ffcmapp_contato_owner using (true);
create policy contato_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_contato_owner using (true) with check (false);
create policy contato_usuario on public.usuario for select to ffcmapp_contato_owner using (id=(select auth_privado.uid()));
create policy contato_usuario_lock on public.usuario for update to ffcmapp_contato_owner using (id=(select auth_privado.uid())) with check (false);
create policy contato_concessao on identidade.concessao_equipe for select to ffcmapp_contato_owner using (usuario_id=(select auth_privado.uid()));
create policy contato_concessao_lock on identidade.concessao_equipe for update to ffcmapp_contato_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy contato_sessao on identidade.sessao for select to ffcmapp_contato_owner using (usuario_id=(select auth_privado.uid()));
create policy contato_sessao_lock on identidade.sessao for update to ffcmapp_contato_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy contato_excecao on identidade.excecao_tecnica for select to ffcmapp_contato_owner using (usuario_id=(select auth_privado.uid()));
create policy contato_excecao_lock on identidade.excecao_tecnica for update to ffcmapp_contato_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy contato_requisicao on operacao.requisicao to ffcmapp_contato_owner using (ator_usuario_id=(select auth_privado.uid()) and operacao='api.criar_contato_paciente') with check (ator_usuario_id=(select auth_privado.uid()) and operacao='api.criar_contato_paciente');
create policy contato_auditoria on auditoria.evento for insert to ffcmapp_contato_owner with check (ator_usuario_id=(select auth_privado.uid()));

grant execute on function operacao.criar_contato_paciente_privado(jsonb) to ffcmapp_contato_owner;
grant select (id,versao,nome_cifrado,nome_preferencia_cifrado,data_nascimento_cifrada), update (versao) on cadastro.paciente to ffcmapp_contato_owner;
grant select,insert on cadastro.contato_paciente to ffcmapp_contato_owner;
grant select,insert,update on operacao.requisicao to ffcmapp_contato_owner;
create policy contato_paciente_select on cadastro.paciente for select to ffcmapp_contato_owner using (true);
create policy contato_paciente_lock on cadastro.paciente for update to ffcmapp_contato_owner using (true) with check (false);
create policy contato_contato_select on cadastro.contato_paciente for select to ffcmapp_contato_owner using (true);
create policy contato_contato_insert on cadastro.contato_paciente for insert to ffcmapp_contato_owner with check (true);

-- Wrapper permanece sem EXECUTE para aplicação até revisão e provas de autorização.
alter function api.criar_contato_paciente(jsonb) owner to ffcmapp_contato_owner;
-- Após transferência, somente o novo owner pode alterar o wrapper.
set role ffcmapp_contato_owner;
alter function api.criar_contato_paciente(jsonb) security definer;
revoke all on function api.criar_contato_paciente(jsonb) from public,anon,authenticated,service_role;
reset role;
select set_config('role',current_setting('ffcmapp.contato_migrador'),false);
revoke create on schema api from ffcmapp_contato_owner;
revoke ffcmapp_contato_owner from current_user;
