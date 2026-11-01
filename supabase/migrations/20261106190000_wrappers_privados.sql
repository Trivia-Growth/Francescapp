-- Preparação local: nenhum papel da aplicação recebe acesso. S-02 e prova
-- da concorrência Auth continuam pré-requisitos para qualquer ativação.
create role ffcmapp_api_cadastro_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role ffcmapp_api_carteira_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_api_cadastro_owner, ffcmapp_api_carteira_owner to postgres;
grant usage, create on schema api to ffcmapp_api_cadastro_owner, ffcmapp_api_carteira_owner;
grant usage on schema auth, public, identidade, cadastro, operacao, auditoria to ffcmapp_api_cadastro_owner;
grant usage on schema identidade, auditoria, auth to ffcmapp_api_carteira_owner;
grant insert (id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) on auditoria.evento to ffcmapp_api_carteira_owner;
grant execute on function identidade.listar_carteira_privada(jsonb) to ffcmapp_api_carteira_owner;
grant execute on function identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text) to ffcmapp_api_cadastro_owner;
grant execute on function operacao.criar_paciente_privado(jsonb), operacao.cadastro_composicao_privada(jsonb),
 operacao.reservar_cadastro_privado(uuid,bigint,uuid), operacao.encerrar_cadastro_privado(uuid,bigint,uuid,uuid),
 operacao.consultar_barreira_cadastro_privado(uuid), operacao.reconhecer_barreira_cadastro_privado(uuid,uuid) to ffcmapp_api_cadastro_owner;

grant select (dominio_workspace,google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_api_cadastro_owner;
grant select (id,perfil,ativo), update (versao) on public.usuario to ffcmapp_api_cadastro_owner;
grant select (id,usuario_id,perfil,estado,subject_google,metodo), update (versao) on identidade.concessao_equipe to ffcmapp_api_cadastro_owner;
grant select (session_id,usuario_id,concessao_id,metodo,revogada_em,encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_api_cadastro_owner;
grant select (id,user_id,not_after) on auth.sessions to ffcmapp_api_cadastro_owner;
grant select (user_id,provider,provider_id,identity_data) on auth.identities to ffcmapp_api_cadastro_owner;
grant select, insert, update on operacao.barreira_cadastro, operacao.reserva_cadastro to ffcmapp_api_cadastro_owner;
grant select, insert on operacao.recibo_barreira_cadastro to ffcmapp_api_cadastro_owner;
grant select, insert, update on operacao.requisicao to ffcmapp_api_cadastro_owner;
grant select (id,nome_cifrado,nome_preferencia_cifrado,data_nascimento_cifrada,criado_por_usuario_id,versao),
 insert (id,nome_cifrado,nome_preferencia_cifrado,data_nascimento_cifrada,criado_por_usuario_id) on cadastro.paciente to ffcmapp_api_cadastro_owner;
grant select (id,paciente_id,tipo,valor_cifrado,versao,criado_em) on cadastro.contato_paciente to ffcmapp_api_cadastro_owner;
grant insert (id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) on auditoria.evento to ffcmapp_api_cadastro_owner;

create policy api_cadastro_config on identidade.configuracao_auth_nativo for select to ffcmapp_api_cadastro_owner using (true);
create policy api_cadastro_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_api_cadastro_owner using (true) with check (false);
create policy api_cadastro_usuario on public.usuario for select to ffcmapp_api_cadastro_owner using (id=(select auth.uid()));
create policy api_cadastro_usuario_lock on public.usuario for update to ffcmapp_api_cadastro_owner using (id=(select auth.uid())) with check (false);
create policy api_cadastro_concessao on identidade.concessao_equipe for select to ffcmapp_api_cadastro_owner using (usuario_id=(select auth.uid()));
create policy api_cadastro_concessao_lock on identidade.concessao_equipe for update to ffcmapp_api_cadastro_owner using (usuario_id=(select auth.uid())) with check (false);
create policy api_cadastro_sessao on identidade.sessao for select to ffcmapp_api_cadastro_owner using (usuario_id=(select auth.uid()));
create policy api_cadastro_sessao_lock on identidade.sessao for update to ffcmapp_api_cadastro_owner using (usuario_id=(select auth.uid())) with check (false);
create policy api_cadastro_barreira on operacao.barreira_cadastro to ffcmapp_api_cadastro_owner using (ator_usuario_id=(select auth.uid())) with check (ator_usuario_id=(select auth.uid()));
create policy api_cadastro_reserva on operacao.reserva_cadastro to ffcmapp_api_cadastro_owner using (ator_usuario_id=(select auth.uid())) with check (ator_usuario_id=(select auth.uid()));
create policy api_cadastro_recibo on operacao.recibo_barreira_cadastro to ffcmapp_api_cadastro_owner using (ator_usuario_id=(select auth.uid())) with check (ator_usuario_id=(select auth.uid()));
create policy api_cadastro_requisicao on operacao.requisicao to ffcmapp_api_cadastro_owner using (ator_usuario_id=(select auth.uid())) with check (ator_usuario_id=(select auth.uid()));
create policy api_cadastro_paciente on cadastro.paciente to ffcmapp_api_cadastro_owner using (criado_por_usuario_id=(select auth.uid())) with check (criado_por_usuario_id=(select auth.uid()));
create policy api_cadastro_contato on cadastro.contato_paciente for select to ffcmapp_api_cadastro_owner using (exists (select 1 from cadastro.paciente p where p.id=contato_paciente.paciente_id and p.criado_por_usuario_id=(select auth.uid())));
create policy api_cadastro_auditoria on auditoria.evento for insert to ffcmapp_api_cadastro_owner with check (ator_usuario_id=(select auth.uid()));
create policy api_carteira_auditoria on auditoria.evento for insert to ffcmapp_api_carteira_owner with check (ator_usuario_id=(select auth.uid()));

set role ffcmapp_api_carteira_owner;
create function api.listar_pacientes(p_entrada jsonb) returns jsonb language plpgsql security definer set search_path='' set row_security=on as $$
declare req uuid;
begin
 begin
  return identidade.listar_carteira_privada(p_entrada);
 exception when sqlstate 'PZ001' then
  req:=(p_entrada#>>'{entrada,request_id}')::uuid;
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),auth.uid(),'api.listar_pacientes','carteira',null,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end;
end
$$;
revoke all on function api.listar_pacientes(jsonb) from public, anon, authenticated, service_role;
reset role;
set role ffcmapp_api_cadastro_owner;
create function api.criar_paciente(p_transporte jsonb) returns jsonb language plpgsql security definer set search_path='' set row_security=on as $$
declare req uuid;
begin
 begin
  return operacao.criar_paciente_privado(p_transporte);
 exception when sqlstate 'PZ001' then
  req:=(p_transporte#>>'{entrada,request_id}')::uuid;
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),auth.uid(),'api.criar_paciente','requisicao',null,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end;
end
$$;
create function api.cadastro_composicao(p_transporte jsonb) returns jsonb language plpgsql security definer set search_path='' set row_security=on as $$
declare req uuid; acao text;
begin
 begin
  return operacao.cadastro_composicao_privada(p_transporte);
 exception when sqlstate 'PZ001' then
  req:=(p_transporte#>>'{entrada,request_id}')::uuid;
  acao:=p_transporte#>>'{entrada,operacao}';
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),auth.uid(),acao,'requisicao',null,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end;
end
$$;
revoke all on function api.criar_paciente(jsonb), api.cadastro_composicao(jsonb) from public, anon, authenticated, service_role;
reset role;
revoke create on schema api from ffcmapp_api_cadastro_owner, ffcmapp_api_carteira_owner;
revoke ffcmapp_api_cadastro_owner, ffcmapp_api_carteira_owner from postgres;
