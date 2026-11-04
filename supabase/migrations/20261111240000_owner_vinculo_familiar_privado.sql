-- Preparação privada: sem concessão à aplicação e sem ativar rota.
-- A sessão nativa valida e bloqueia sessão e concessão antes da operação.
create role ffcmapp_familiar_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_familiar_owner to current_user with inherit false, set true;
grant usage, create on schema api, cadastro to ffcmapp_familiar_owner;
grant usage on schema public, auditoria, auth_privado to ffcmapp_familiar_owner;
grant execute on function auth_privado.uid(), api.consultar_sessao_nativa(uuid) to ffcmapp_familiar_owner;

grant select (id, perfil, ativo), update (versao) on public.usuario to ffcmapp_familiar_owner;
grant select (id), update (versao) on cadastro.paciente to ffcmapp_familiar_owner;
-- SELECT da linha inteira é necessário ao replay da operação existente.
grant select on cadastro.acesso_paciente to ffcmapp_familiar_owner;
grant update (versao) on cadastro.acesso_paciente to ffcmapp_familiar_owner;
grant insert (id, paciente_id, usuario_id, concedido_por_usuario_id, motivo_concessao_cifrado)
  on cadastro.acesso_paciente to ffcmapp_familiar_owner;
grant insert (id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
  on auditoria.evento to ffcmapp_familiar_owner;

-- UPDATE permite apenas bloqueios de linha; nenhuma alteração satisfaz WITH CHECK.
create policy familiar_owner_usuario on public.usuario for select to ffcmapp_familiar_owner
  using (id = (select auth_privado.uid()) or (perfil = 'familia' and ativo));
create policy familiar_owner_usuario_lock on public.usuario for update to ffcmapp_familiar_owner
  using (perfil = 'familia' and ativo) with check (false);
create policy familiar_owner_paciente on cadastro.paciente for select to ffcmapp_familiar_owner
  using (exists (select 1 from public.usuario u where u.id = (select auth_privado.uid()) and u.ativo and u.perfil = 'administrador'));
create policy familiar_owner_paciente_lock on cadastro.paciente for update to ffcmapp_familiar_owner
  using (true) with check (false);
create policy familiar_owner_acesso on cadastro.acesso_paciente for select to ffcmapp_familiar_owner
  using (exists (select 1 from public.usuario u where u.id = (select auth_privado.uid()) and u.ativo and u.perfil = 'administrador'));
create policy familiar_owner_acesso_lock on cadastro.acesso_paciente for update to ffcmapp_familiar_owner
  using (true) with check (false);
create policy familiar_owner_acesso_inserir on cadastro.acesso_paciente for insert to ffcmapp_familiar_owner
  with check (concedido_por_usuario_id = (select auth_privado.uid())
    and exists (select 1 from public.usuario u where u.id = (select auth_privado.uid()) and u.ativo and u.perfil = 'administrador')
    and exists (select 1 from public.usuario f where f.id = usuario_id and f.perfil = 'familia' and f.ativo));
create policy familiar_owner_auditoria on auditoria.evento for insert to ffcmapp_familiar_owner
  with check (ator_usuario_id = (select auth_privado.uid()) and acao = 'conceder_acesso_familiar');

alter function cadastro.conceder_acesso_familiar_privado(uuid, uuid, uuid, uuid, jsonb) owner to ffcmapp_familiar_owner;
alter function api.conceder_acesso_familiar_privado(uuid, uuid, uuid, uuid, jsonb) owner to ffcmapp_familiar_owner;
select set_config('ffcmapp.familiar_migrador', current_user, false);
set role ffcmapp_familiar_owner;
alter function api.conceder_acesso_familiar_privado(uuid, uuid, uuid, uuid, jsonb) security definer;
alter function api.conceder_acesso_familiar_privado(uuid, uuid, uuid, uuid, jsonb) set row_security = on;
revoke all on function cadastro.conceder_acesso_familiar_privado(uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function api.conceder_acesso_familiar_privado(uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.familiar_migrador'), false);
revoke create on schema api, cadastro from ffcmapp_familiar_owner;
revoke ffcmapp_familiar_owner from current_user;
