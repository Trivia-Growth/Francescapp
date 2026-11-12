-- Owner dedicado da sessão familiar (FR-052/FR-054).
-- `identidade.sessao_familiar_privada` é SECURITY INVOKER e, até aqui, só podia ser
-- chamada pelo migrador: liberar EXECUTE para `authenticated` exigiria conceder as
-- tabelas de identidade diretamente ao papel da aplicação. Este migration cria o papel
-- dono sem login e sem bypass de RLS, com privilégios mínimos e políticas próprias, e
-- expõe dois wrappers SECURITY DEFINER. O grant para a aplicação fica em migration
-- separada; este arquivo sozinho não publica rota nem concede acesso.
-- Rollback: drop function api.admitir_sessao_familiar_nativa(uuid),
--   api.consultar_sessao_familiar_nativa(uuid); drop owned by ffcmapp_sessao_familiar_owner;
--   drop role ffcmapp_sessao_familiar_owner;
create role ffcmapp_sessao_familiar_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_sessao_familiar_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_sessao_familiar_owner;
grant usage on schema public, identidade, cadastro, auditoria, auth_privado, bloqueios_auth to ffcmapp_sessao_familiar_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.sessoes(), bloqueios_auth.travar(uuid, uuid) to ffcmapp_sessao_familiar_owner;
grant execute on function identidade.sessao_familiar_privada(uuid, boolean) to ffcmapp_sessao_familiar_owner;

-- `for share` exige UPDATE além de SELECT; o privilégio de escrita é neutralizado por
-- política `_lock` com `check (false)`, que permite travar a linha sem alterá-la.
grant select (id, perfil, ativo, versao), update (versao) on public.usuario to ffcmapp_sessao_familiar_owner;
grant select (id, usuario_id, revogada_em), update (versao) on cadastro.acesso_paciente to ffcmapp_sessao_familiar_owner;
grant select (session_id, usuario_id, concessao_id, concessao_versao_admissao, metodo, revogada_em, encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_sessao_familiar_owner;
grant insert (session_id, usuario_id, concessao_id, concessao_versao_admissao, metodo) on identidade.sessao to ffcmapp_sessao_familiar_owner;
grant select (operador_auditoria) on identidade.configuracao_auth_nativo to ffcmapp_sessao_familiar_owner;
grant insert (id, ator_usuario_id, operador_restrito, acao, tipo_objeto, objeto_id, resultado, request_id) on auditoria.evento to ffcmapp_sessao_familiar_owner;

create policy sessao_familiar_usuario on public.usuario for select to ffcmapp_sessao_familiar_owner using (id = (select auth_privado.uid()));
create policy sessao_familiar_usuario_lock on public.usuario for update to ffcmapp_sessao_familiar_owner using (id = (select auth_privado.uid())) with check (false);
create policy sessao_familiar_acesso on cadastro.acesso_paciente for select to ffcmapp_sessao_familiar_owner using (usuario_id = (select auth_privado.uid()) and revogada_em is null);
create policy sessao_familiar_acesso_lock on cadastro.acesso_paciente for update to ffcmapp_sessao_familiar_owner using (usuario_id = (select auth_privado.uid()) and revogada_em is null) with check (false);
create policy sessao_familiar_sessao on identidade.sessao for select to ffcmapp_sessao_familiar_owner using (usuario_id = (select auth_privado.uid()));
create policy sessao_familiar_sessao_lock on identidade.sessao for update to ffcmapp_sessao_familiar_owner using (usuario_id = (select auth_privado.uid())) with check (false);
-- Admissão só cria sessão familiar do próprio titular, nunca com concessão de equipe.
create policy sessao_familiar_sessao_admissao on identidade.sessao for insert to ffcmapp_sessao_familiar_owner
  with check (usuario_id = (select auth_privado.uid()) and metodo = 'familia' and concessao_id is null and concessao_versao_admissao is null);
create policy sessao_familiar_config on identidade.configuracao_auth_nativo for select to ffcmapp_sessao_familiar_owner using (true);
-- Auditoria sem ator identificado preserva o operador restrito; o contrário é recusado.
create policy sessao_familiar_auditoria on auditoria.evento for insert to ffcmapp_sessao_familiar_owner
  with check (tipo_objeto = 'sessao' and acao in ('admitir_sessao_nativa', 'consultar_sessao_nativa')
    and ((ator_usuario_id = (select auth_privado.uid()) and operador_restrito is null)
      or (ator_usuario_id is null and operador_restrito is not null)));

select set_config('ffcmapp.sessao_familiar_migrador', current_user, false);
set role ffcmapp_sessao_familiar_owner;
create function api.admitir_sessao_familiar_nativa(p_request_id uuid)
returns jsonb language sql security definer set search_path = '' set row_security = on as $$
  select identidade.sessao_familiar_privada(p_request_id, true);
$$;
create function api.consultar_sessao_familiar_nativa(p_request_id uuid)
returns jsonb language sql security definer set search_path = '' set row_security = on as $$
  select identidade.sessao_familiar_privada(p_request_id, false);
$$;
revoke all on function api.admitir_sessao_familiar_nativa(uuid) from public, anon, authenticated, service_role;
revoke all on function api.consultar_sessao_familiar_nativa(uuid) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.sessao_familiar_migrador'), false);
revoke create on schema api from ffcmapp_sessao_familiar_owner;
revoke ffcmapp_sessao_familiar_owner from current_user;
