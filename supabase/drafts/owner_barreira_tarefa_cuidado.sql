-- Preparação local: wrapper permanece inacessível à aplicação até S-02 e provas reais.
create role ffcmapp_tarefa_barreira_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_tarefa_barreira_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_tarefa_barreira_owner;
grant usage on schema public, identidade, cadastro, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_tarefa_barreira_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid,uuid) to ffcmapp_tarefa_barreira_owner;
select set_config('ffcmapp.tarefa_barreira_migrador',current_user,false);
select set_config('ffcmapp.tarefa_barreira_tinha_verificador',pg_has_role(current_user,'ffcmapp_atestado_verificador_owner','SET')::text,false);
do $$ begin
 if current_setting('ffcmapp.tarefa_barreira_tinha_verificador')='false' then
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor
   where r.rolname='ffcmapp_atestado_verificador_owner' and u.rolname=current_user and g.rolname=current_user) then
   raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
  end if;
  execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text) to ffcmapp_tarefa_barreira_owner;
reset role;
select set_config('role',current_setting('ffcmapp.tarefa_barreira_migrador'),false);
do $$ begin
 if current_setting('ffcmapp.tarefa_barreira_tinha_verificador')='false' then
  execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I',current_user,current_user);
 end if;
end $$;
grant select (dominio_workspace,google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_tarefa_barreira_owner;
grant select (id,perfil,ativo), update (versao) on public.usuario to ffcmapp_tarefa_barreira_owner;
grant select (id,usuario_id,perfil,estado,subject_google,metodo), update (versao) on identidade.concessao_equipe to ffcmapp_tarefa_barreira_owner;
grant select (session_id,usuario_id,concessao_id,metodo,revogada_em,encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_tarefa_barreira_owner;
grant select (usuario_id,concessao_id), update (concessao_id) on identidade.excecao_tecnica to ffcmapp_tarefa_barreira_owner;
grant insert (id,ator_usuario_id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) on auditoria.evento to ffcmapp_tarefa_barreira_owner;

create policy tarefa_barreira_config on identidade.configuracao_auth_nativo for select to ffcmapp_tarefa_barreira_owner using (true);
create policy tarefa_barreira_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_tarefa_barreira_owner using (true) with check (false);
create policy tarefa_barreira_usuario on public.usuario for select to ffcmapp_tarefa_barreira_owner using (id=(select auth_privado.uid()));
create policy tarefa_barreira_usuario_lock on public.usuario for update to ffcmapp_tarefa_barreira_owner using (id=(select auth_privado.uid())) with check (false);
create policy tarefa_barreira_concessao on identidade.concessao_equipe for select to ffcmapp_tarefa_barreira_owner using (usuario_id=(select auth_privado.uid()));
create policy tarefa_barreira_concessao_lock on identidade.concessao_equipe for update to ffcmapp_tarefa_barreira_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy tarefa_barreira_sessao on identidade.sessao for select to ffcmapp_tarefa_barreira_owner using (usuario_id=(select auth_privado.uid()));
create policy tarefa_barreira_sessao_lock on identidade.sessao for update to ffcmapp_tarefa_barreira_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy tarefa_barreira_excecao on identidade.excecao_tecnica for select to ffcmapp_tarefa_barreira_owner using (usuario_id=(select auth_privado.uid()));
create policy tarefa_barreira_excecao_lock on identidade.excecao_tecnica for update to ffcmapp_tarefa_barreira_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy tarefa_barreira_auditoria on auditoria.evento for insert to ffcmapp_tarefa_barreira_owner with check ((ator_usuario_id=(select auth_privado.uid()) and ator_auth_id is null) or (ator_usuario_id is null and ator_auth_id=(select auth_privado.uid())));

grant select (paciente_id,usuario_id,revogada_em), update (versao) on cadastro.acesso_paciente to ffcmapp_tarefa_barreira_owner;
create policy tarefa_barreira_acesso on cadastro.acesso_paciente for select to ffcmapp_tarefa_barreira_owner using (usuario_id=(select auth_privado.uid()));
create policy tarefa_barreira_acesso_lock on cadastro.acesso_paciente for update to ffcmapp_tarefa_barreira_owner using (usuario_id=(select auth_privado.uid())) with check (false);

-- SELECT FOR KEY SHARE exige UPDATE; WITH CHECK impede alteração do paciente.
grant select (id), update (id) on cadastro.paciente to ffcmapp_tarefa_barreira_owner;
create policy tarefa_barreira_paciente_select on cadastro.paciente for select to ffcmapp_tarefa_barreira_owner using (true);
create policy tarefa_barreira_paciente_lock on cadastro.paciente for update to ffcmapp_tarefa_barreira_owner using (true) with check (false);

grant select, insert (ator_usuario_id), update (epoca,reserva_atual,resultado_pendente)
 on operacao.barreira_tarefa_cuidado to ffcmapp_tarefa_barreira_owner;
grant select, insert (id,ator_usuario_id,epoca,estado,paciente_reservado_id,tarefa_reservada_id,versao_esperada), update (estado)
 on operacao.reserva_tarefa_cuidado to ffcmapp_tarefa_barreira_owner;
grant select, insert (id,ator_usuario_id,epoca,reserva_id,resultado)
 on operacao.recibo_barreira_tarefa_cuidado to ffcmapp_tarefa_barreira_owner;
create policy composicao_barreira_select on operacao.barreira_tarefa_cuidado for select to ffcmapp_tarefa_barreira_owner using (ator_usuario_id=(select auth_privado.uid()));
create policy composicao_barreira_insert on operacao.barreira_tarefa_cuidado for insert to ffcmapp_tarefa_barreira_owner with check (ator_usuario_id=(select auth_privado.uid()));
create policy composicao_barreira_update on operacao.barreira_tarefa_cuidado for update to ffcmapp_tarefa_barreira_owner using (ator_usuario_id=(select auth_privado.uid())) with check (ator_usuario_id=(select auth_privado.uid()));
create policy composicao_reserva_select on operacao.reserva_tarefa_cuidado for select to ffcmapp_tarefa_barreira_owner using (ator_usuario_id=(select auth_privado.uid()));
create policy composicao_reserva_insert on operacao.reserva_tarefa_cuidado for insert to ffcmapp_tarefa_barreira_owner with check (ator_usuario_id=(select auth_privado.uid()));
create policy composicao_reserva_update on operacao.reserva_tarefa_cuidado for update to ffcmapp_tarefa_barreira_owner using (ator_usuario_id=(select auth_privado.uid())) with check (ator_usuario_id=(select auth_privado.uid()));
create policy composicao_recibo_select on operacao.recibo_barreira_tarefa_cuidado for select to ffcmapp_tarefa_barreira_owner using (ator_usuario_id=(select auth_privado.uid()));
create policy composicao_recibo_insert on operacao.recibo_barreira_tarefa_cuidado for insert to ffcmapp_tarefa_barreira_owner with check (ator_usuario_id=(select auth_privado.uid()));

grant execute on function operacao.tarefa_barreira_composicao_privada(jsonb),
 operacao.reservar_tarefa_cuidado_privado(uuid,bigint,uuid,uuid,uuid,integer),
 operacao.encerrar_tarefa_cuidado_privado(uuid,bigint,uuid,uuid),
 operacao.consultar_barreira_tarefa_cuidado_privado(uuid),
 operacao.reconhecer_barreira_tarefa_cuidado_privado(uuid,uuid) to ffcmapp_tarefa_barreira_owner;

alter function api.tarefa_barreira_composicao(jsonb) owner to ffcmapp_tarefa_barreira_owner;
set role ffcmapp_tarefa_barreira_owner;
alter function api.tarefa_barreira_composicao(jsonb) security definer;
revoke all on function api.tarefa_barreira_composicao(jsonb) from public,anon,authenticated,service_role;
reset role;
select set_config('role',current_setting('ffcmapp.tarefa_barreira_migrador'),false);
revoke create on schema api from ffcmapp_tarefa_barreira_owner;
revoke ffcmapp_tarefa_barreira_owner from current_user;
