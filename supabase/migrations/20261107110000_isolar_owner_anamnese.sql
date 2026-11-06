-- Isola o owner da anamnese: colaboradores ativos não exigem vínculo individual.
select set_config('ffcmapp.migrador_anamnese_owner',current_user,false);
create role ffcmapp_anamnese_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_anamnese_owner, ffcmapp_carteira_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_anamnese_owner;
grant usage on schema public, identidade, cadastro, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_anamnese_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid,uuid) to ffcmapp_anamnese_owner;
grant ffcmapp_atestado_verificador_owner to current_user with inherit false, set true;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text) to ffcmapp_anamnese_owner;
reset role;
select set_config('role',current_setting('ffcmapp.migrador_anamnese_owner'),false);
revoke ffcmapp_atestado_verificador_owner from current_user;
grant select (dominio_workspace,google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_anamnese_owner;
grant select (id,perfil,ativo), update (versao) on public.usuario to ffcmapp_anamnese_owner;
grant select (id,usuario_id,perfil,estado,subject_google,metodo), update (versao) on identidade.concessao_equipe to ffcmapp_anamnese_owner;
grant select (session_id,usuario_id,concessao_id,metodo,revogada_em,encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_anamnese_owner;
grant select (id), update (versao) on cadastro.paciente to ffcmapp_anamnese_owner;
grant select,insert on cadastro.anamnese_versao,operacao.requisicao to ffcmapp_anamnese_owner;
grant insert (id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) on auditoria.evento to ffcmapp_anamnese_owner;
create policy anamnese_owner_config on identidade.configuracao_auth_nativo for select to ffcmapp_anamnese_owner using (true);
create policy anamnese_owner_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_anamnese_owner using (true) with check (false);
create policy anamnese_owner_usuario on public.usuario for select to ffcmapp_anamnese_owner using (id=(select auth_privado.uid()));
create policy anamnese_owner_usuario_lock on public.usuario for update to ffcmapp_anamnese_owner using (id=(select auth_privado.uid())) with check (false);
create policy anamnese_owner_concessao on identidade.concessao_equipe for select to ffcmapp_anamnese_owner using (usuario_id=(select auth_privado.uid()));
create policy anamnese_owner_concessao_lock on identidade.concessao_equipe for update to ffcmapp_anamnese_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy anamnese_owner_sessao on identidade.sessao for select to ffcmapp_anamnese_owner using (usuario_id=(select auth_privado.uid()));
create policy anamnese_owner_sessao_lock on identidade.sessao for update to ffcmapp_anamnese_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy anamnese_owner_paciente on cadastro.paciente for select to ffcmapp_anamnese_owner using (
 exists (
  select 1 from public.usuario u
  join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil
  join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id
  join identidade.configuracao_auth_nativo cfg on cfg.google_unico_oauth_confirmado
  join auth_privado.identidades() i on i.user_id=u.id and i.provider='google'
  where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador','profissional')
   and c.estado='vinculada' and c.metodo='google_workspace' and c.subject_google=i.provider_id
   and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo='google_workspace'
   and s.revogada_em is null and s.encerrada_em is null
   and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=u.id and j.provider='google')=1
   and i.identity_data->>'sub'=i.provider_id and i.identity_data->>'email_verified'='true'
   and i.identity_data#>>'{custom_claims,hd}'=cfg.dominio_workspace
   and exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr')='array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method'='oauth')
 )
)
;
create policy anamnese_owner_paciente_lock on cadastro.paciente for update to ffcmapp_anamnese_owner using (true) with check (false);
create policy anamnese_owner_versao on cadastro.anamnese_versao for select to ffcmapp_anamnese_owner using (exists(select 1 from cadastro.paciente p where p.id=paciente_id));
create policy anamnese_owner_versao_inserir on cadastro.anamnese_versao for insert to ffcmapp_anamnese_owner with check (criado_por_usuario_id=(select auth_privado.uid()) and exists(select 1 from cadastro.paciente p where p.id=paciente_id));
create policy anamnese_owner_requisicao on operacao.requisicao for select to ffcmapp_anamnese_owner using (ator_usuario_id=(select auth_privado.uid()) and operacao='api.gravar_anamnese');
create policy anamnese_owner_requisicao_inserir on operacao.requisicao for insert to ffcmapp_anamnese_owner with check (ator_usuario_id=(select auth_privado.uid()) and operacao='api.gravar_anamnese');
create policy anamnese_owner_auditoria on auditoria.evento for insert to ffcmapp_anamnese_owner with check (ator_usuario_id=(select auth_privado.uid()));
grant ffcmapp_anamnese_owner to ffcmapp_carteira_owner with inherit false, set true;
set role ffcmapp_carteira_owner;
alter function api.anamnese_operacao_privada(jsonb) owner to ffcmapp_anamnese_owner;
alter function api.anamnese_privada(jsonb) owner to ffcmapp_anamnese_owner;
reset role;
select set_config('role',current_setting('ffcmapp.migrador_anamnese_owner'),false);
revoke ffcmapp_anamnese_owner from ffcmapp_carteira_owner;
drop policy anamnese_selecao on cadastro.anamnese_versao;
drop policy anamnese_insercao on cadastro.anamnese_versao;
drop policy anamnese_paciente_lock on cadastro.paciente;
drop policy anamnese_requisicao_selecao on operacao.requisicao;
drop policy anamnese_requisicao_insercao on operacao.requisicao;
revoke select,insert on cadastro.anamnese_versao,operacao.requisicao from ffcmapp_carteira_owner;
revoke update (versao) on cadastro.paciente from ffcmapp_carteira_owner;
revoke create on schema api from ffcmapp_anamnese_owner;
revoke ffcmapp_anamnese_owner, ffcmapp_carteira_owner from current_user;
