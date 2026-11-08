\set ON_ERROR_STOP on
\ir fundacao_carteira_nativa_autorizacao_fixture.sql
alter table identidade.configuracao_auth_nativo enable row level security;
\ir ../migrations/20261105120000_auth_privado.sql
\ir ../migrations/20261106180000_bloqueios_auth.sql
\ir ../migrations/20261106130000_carteira_nativa.sql
grant usage on schema bloqueios_auth to ffcmapp_carteira_owner;
grant execute on function bloqueios_auth.travar(uuid,uuid) to ffcmapp_carteira_owner;
begin;
do $$ begin
 execute 'set local role ffcmapp_carteira_owner';
 begin
  update identidade.configuracao_auth_nativo set dominio_workspace='alterado.example';
  raise exception 'owner alterou configuração';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
end $$;
insert into auth.users(id) values ('bb000000-0000-4000-8000-000000000001');
insert into public.usuario(id,perfil) values ('bb000000-0000-4000-8000-000000000001','administrador');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,vinculada_em)
values ('bb000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','carteira-privada','administrador','google_workspace','vinculada','bb000000-0000-4000-8000-000000000001','carteira-privada','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',clock_timestamp());
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
values ('bb000000-0000-4000-8000-000000000003','bb000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000002',1,'google_workspace');
insert into auth.sessions(id,user_id) values ('bb000000-0000-4000-8000-000000000003','bb000000-0000-4000-8000-000000000001');
insert into auth.identities values ('bb000000-0000-4000-8000-000000000001','google','carteira-privada','{"sub":"carteira-privada","email_verified":true,"custom_claims":{"hd":"fixture.example"}}');
insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values
 ('bb000000-0000-4000-8000-000000000004','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','bb000000-0000-4000-8000-000000000001');
select set_config('ffcm_fixture.usuario','bb000000-0000-4000-8000-000000000001',true);
select set_config('ffcm_fixture.sessao','bb000000-0000-4000-8000-000000000003',true);
select set_config('ffcm_fixture.oauth','sim',true);
create function pg_temp.assinar(e jsonb) returns jsonb language plpgsql as $$
declare entrada text:=e::text; d jsonb; texto text; mac text;
begin
 d:=jsonb_build_object('key_id','teste','usuario_id',auth.uid(),'session_id',auth.jwt()->>'session_id',
 'request_id',e->>'request_id','operacao','api.listar_pacientes','emitido_em',clock_timestamp()-interval '1 second',
 'expira_em',clock_timestamp()+interval '20 seconds','digest_entrada',translate(rtrim(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'));
 texto:=d::text; mac:=translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||texto,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 return jsonb_build_object('entrada',e||jsonb_build_object('atestado',d||jsonb_build_object('mac',mac)),'entrada_canonica',entrada,'dados_canonicos',texto);
end $$;
do $$
declare t jsonb:=pg_temp.assinar('{"request_id":"bb000000-0000-4000-8000-000000000005","limite":10}'); r jsonb;
begin
 if has_function_privilege('authenticated','identidade.listar_carteira_privada(jsonb)','execute') or has_function_privilege('service_role','identidade.listar_carteira_privada(jsonb)','execute') then raise exception 'função exposta'; end if;
 r:=identidade.listar_carteira_privada(t);
 if r->>'ok'<>'true' or not (r#>'{dados,itens}' @> '[{"paciente_id":"bb000000-0000-4000-8000-000000000004"}]'::jsonb) then raise exception 'admin negado: %',r; end if;
 if not exists(select 1 from auditoria.evento where request_id='bb000000-0000-4000-8000-000000000005' and resultado='permitido') then raise exception 'auditoria ausente'; end if;
 update public.usuario set perfil='profissional' where id=auth.uid();
 update identidade.concessao_equipe set perfil='profissional' where usuario_id=auth.uid();
 r:=identidade.listar_carteira_privada(t);
 if r->>'ok'<>'true' or jsonb_array_length(r#>'{dados,itens}')<>0 then raise exception 'profissional sem vínculo obteve paciente'; end if;
 insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado)
 values ('bb000000-0000-4000-8000-000000000006','bb000000-0000-4000-8000-000000000004',auth.uid(),auth.uid(),'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
 r:=identidade.listar_carteira_privada(t);
 if r->>'ok'<>'true' or jsonb_array_length(r#>'{dados,itens}')<>1 then raise exception 'vínculo recusado'; end if;
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id=auth.uid(),motivo_revogacao_cifrado=motivo_concessao_cifrado where usuario_id=auth.uid();
 r:=identidade.listar_carteira_privada(t);
 if jsonb_array_length(r#>'{dados,itens}')<>0 then raise exception 'vínculo revogado aceito'; end if;
 update identidade.sessao set encerrada_em=clock_timestamp() where usuario_id=auth.uid();
 r:=identidade.listar_carteira_privada(t);
 if r->>'ok'<>'false' or not exists(select 1 from auditoria.evento where request_id='bb000000-0000-4000-8000-000000000005' and resultado='negado') then raise exception 'revogação não auditada'; end if;
 begin perform identidade.listar_carteira_privada(jsonb_set(t,'{entrada,limite}','11')); raise exception 'adulteração aceita'; exception when insufficient_privilege then null; end;
end $$;
-- A chamada acima mantém o FOR SHARE até o fim da transação: outra conexão
-- deve esperar ao tentar alterar a configuração institucional.
do $$
declare backend_pid integer; prazo timestamptz:=clock_timestamp()+interval '3 seconds';
begin
 perform dblink_connect('config_concorrente',format('dbname=%L host=%L port=%s',current_database(),current_setting('unix_socket_directories'),current_setting('port')));
 select x.pid into backend_pid from dblink('config_concorrente','select pg_backend_pid()') as x(pid integer);
 perform dblink_send_query('config_concorrente', $query$update identidade.configuracao_auth_nativo set dominio_workspace='outro.example' returning dominio_workspace$query$);
 loop
  perform pg_stat_clear_snapshot();
  exit when exists(select 1 from pg_stat_activity a where a.pid=backend_pid and a.wait_event_type='Lock' and pg_backend_pid()=any(pg_blocking_pids(a.pid)));
  if clock_timestamp()>=prazo then raise exception 'alteração da configuração não aguardou o lock'; end if;
  perform pg_sleep(0.02);
 end loop;
 perform dblink_cancel_query('config_concorrente');
 perform * from dblink_get_result('config_concorrente',false) as x(dominio text);
 perform dblink_disconnect('config_concorrente');
end $$;
update identidade.sessao set encerrada_em=null where usuario_id=auth.uid();
update public.usuario set perfil='familia' where id=auth.uid();
do $$ declare r jsonb; begin
 r:=identidade.listar_carteira_privada(pg_temp.assinar('{"request_id":"bb000000-0000-4000-8000-000000000007","limite":10}'));
 if r->>'ok'<>'false' then raise exception 'família autorizada indevidamente'; end if;
end $$;
update public.usuario set perfil='profissional' where id=auth.uid();
revoke insert (id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) on auditoria.evento from ffcmapp_carteira_owner;
do $$ begin
 begin
  perform identidade.listar_carteira_privada(pg_temp.assinar('{"request_id":"bb000000-0000-4000-8000-000000000008","limite":10}'));
  raise exception 'resultado entregue sem auditoria';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
