-- Preparação local: wrappers sem EXECUTE para aplicação; S-02 e provas reais precedem ativação.
create role ffcmapp_edicao_paciente_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_edicao_paciente_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_edicao_paciente_owner;
grant usage on schema public, identidade, cadastro, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_edicao_paciente_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid,uuid) to ffcmapp_edicao_paciente_owner;
select set_config('ffcmapp.edicao_migrador',current_user,false);
select set_config('ffcmapp.edicao_tinha_verificador',pg_has_role(current_user,'ffcmapp_atestado_verificador_owner','SET')::text,false);
do $$ begin
 if current_setting('ffcmapp.edicao_tinha_verificador')='false' then
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor
   where r.rolname='ffcmapp_atestado_verificador_owner' and u.rolname=current_user and g.rolname=current_user) then
   raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
  end if;
  execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text) to ffcmapp_edicao_paciente_owner;
reset role;
select set_config('role',current_setting('ffcmapp.edicao_migrador'),false);
do $$ begin
 if current_setting('ffcmapp.edicao_tinha_verificador')='false' then
  execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I',current_user,current_user);
 end if;
end $$;
grant execute on function operacao.editar_paciente_privado(jsonb), operacao.edicao_paciente_composicao_privada(jsonb),
 operacao.reservar_edicao_paciente_privado(uuid,bigint,uuid,uuid), operacao.encerrar_edicao_paciente_privado(uuid,bigint,uuid,uuid),
 operacao.consultar_barreira_edicao_paciente_privado(uuid), operacao.reconhecer_barreira_edicao_paciente_privado(uuid,uuid) to ffcmapp_edicao_paciente_owner;

grant select (dominio_workspace,google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_edicao_paciente_owner;
grant select (id,perfil,ativo), update (versao) on public.usuario to ffcmapp_edicao_paciente_owner;
grant select (id,usuario_id,perfil,estado,subject_google,metodo), update (versao) on identidade.concessao_equipe to ffcmapp_edicao_paciente_owner;
grant select (session_id,usuario_id,concessao_id,metodo,revogada_em,encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_edicao_paciente_owner;
grant select (usuario_id,concessao_id), update (concessao_id) on identidade.excecao_tecnica to ffcmapp_edicao_paciente_owner;
grant select (id,versao,nome_cifrado,nome_preferencia_cifrado,data_nascimento_cifrada), update (nome_cifrado,nome_preferencia_cifrado,data_nascimento_cifrada,versao,atualizado_em) on cadastro.paciente to ffcmapp_edicao_paciente_owner;
grant select,insert,update on operacao.barreira_edicao_paciente,operacao.reserva_edicao_paciente to ffcmapp_edicao_paciente_owner;
grant select,insert on operacao.recibo_barreira_edicao_paciente,operacao.requisicao to ffcmapp_edicao_paciente_owner;
grant insert (id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id,motivo_cifrado) on auditoria.evento to ffcmapp_edicao_paciente_owner;

create policy edicao_config on identidade.configuracao_auth_nativo for select to ffcmapp_edicao_paciente_owner using (true);
create policy edicao_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_edicao_paciente_owner using (true) with check (false);
create policy edicao_usuario on public.usuario for select to ffcmapp_edicao_paciente_owner using (id=(select auth_privado.uid()));
create policy edicao_usuario_lock on public.usuario for update to ffcmapp_edicao_paciente_owner using (id=(select auth_privado.uid())) with check (false);
create policy edicao_concessao on identidade.concessao_equipe for select to ffcmapp_edicao_paciente_owner using (usuario_id=(select auth_privado.uid()));
create policy edicao_concessao_lock on identidade.concessao_equipe for update to ffcmapp_edicao_paciente_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy edicao_sessao on identidade.sessao for select to ffcmapp_edicao_paciente_owner using (usuario_id=(select auth_privado.uid()));
create policy edicao_sessao_lock on identidade.sessao for update to ffcmapp_edicao_paciente_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy edicao_excecao on identidade.excecao_tecnica for select to ffcmapp_edicao_paciente_owner using (usuario_id=(select auth_privado.uid()));
create policy edicao_excecao_lock on identidade.excecao_tecnica for update to ffcmapp_edicao_paciente_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy edicao_paciente_select on cadastro.paciente for select to ffcmapp_edicao_paciente_owner using (true);
create policy edicao_paciente_update on cadastro.paciente for update to ffcmapp_edicao_paciente_owner using (true) with check (true);
create policy edicao_barreira on operacao.barreira_edicao_paciente to ffcmapp_edicao_paciente_owner using (ator_usuario_id=(select auth_privado.uid())) with check (ator_usuario_id=(select auth_privado.uid()));
create policy edicao_reserva on operacao.reserva_edicao_paciente to ffcmapp_edicao_paciente_owner using (ator_usuario_id=(select auth_privado.uid())) with check (ator_usuario_id=(select auth_privado.uid()));
create policy edicao_recibo on operacao.recibo_barreira_edicao_paciente to ffcmapp_edicao_paciente_owner using (ator_usuario_id=(select auth_privado.uid())) with check (ator_usuario_id=(select auth_privado.uid()));
create policy edicao_requisicao on operacao.requisicao to ffcmapp_edicao_paciente_owner using (ator_usuario_id=(select auth_privado.uid()) and operacao='api.editar_paciente') with check (ator_usuario_id=(select auth_privado.uid()) and operacao='api.editar_paciente');
create policy edicao_auditoria on auditoria.evento for insert to ffcmapp_edicao_paciente_owner with check (ator_usuario_id=(select auth_privado.uid()));

set role ffcmapp_edicao_paciente_owner;
create function api.edicao_paciente_composicao_privada(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
declare req uuid; acao text;
begin
 begin
  return operacao.edicao_paciente_composicao_privada(p_transporte);
 exception when sqlstate 'PZ001' then
  req:=(p_transporte#>>'{entrada,request_id}')::uuid;
  acao:=p_transporte#>>'{entrada,operacao}';
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),auth_privado.uid(),acao,'requisicao',null,'negado',req);
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end;
end $$;
create function api.editar_paciente_privado(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
declare req uuid; paciente uuid;
begin
 begin
  return operacao.editar_paciente_privado(p_transporte);
 exception when sqlstate 'PZ001' then
  req:=(p_transporte#>>'{entrada,request_id}')::uuid;
  paciente:=(p_transporte#>>'{entrada,paciente_id}')::uuid;
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),auth_privado.uid(),'api.editar_paciente','paciente',paciente,'negado',req);
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end;
end $$;
revoke all on function api.edicao_paciente_composicao_privada(jsonb),api.editar_paciente_privado(jsonb) from public,anon,authenticated,service_role;
reset role;
select set_config('role',current_setting('ffcmapp.edicao_migrador'),false);
revoke create on schema api from ffcmapp_edicao_paciente_owner;
revoke ffcmapp_edicao_paciente_owner from current_user;
