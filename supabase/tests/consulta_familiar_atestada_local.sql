\set ON_ERROR_STOP on
\ir consulta_paciente_familiar_auditoria_local.sql
\ir ../preparacao/consulta_familiar_atestada_privada.sql
do $$ begin
 if has_function_privilege('authenticated','api.consultar_paciente_familiar_atestado_privado(jsonb)','EXECUTE')
  or has_function_privilege('anon','api.consultar_paciente_familiar_atestado_privado(jsonb)','EXECUTE')
  or has_function_privilege('service_role','api.consultar_paciente_familiar_atestado_privado(jsonb)','EXECUTE') then
  raise exception 'GRANT_EXTERNO';
 end if;
end $$;
-- O grant abaixo existe somente nesta fixture descartável.
grant execute on function api.consultar_paciente_familiar_atestado_privado(jsonb) to authenticated;
insert into identidade.geracao_sessao_familiar(session_id,usuario_id,geracao) values ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',1);
create function public.assinar_familiar_fixture(e jsonb) returns jsonb language plpgsql as $$
declare entrada text:=e::text; d jsonb; texto text; mac text;
begin
 d:=jsonb_build_object('key_id','teste','usuario_id','10000000-0000-4000-8000-000000000002','session_id','20000000-0000-4000-8000-000000000002','request_id',e->>'request_id','operacao','api.consultar_paciente_familiar','emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '20 seconds','digest_entrada',translate(rtrim(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'));
 texto:=d::text; mac:=translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||texto,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 return jsonb_build_object('entrada',e||jsonb_build_object('atestado',d||jsonb_build_object('mac',mac)),'entrada_canonica',entrada,'dados_canonicos',texto);
end $$;
do $$
declare t jsonb; r jsonb; req uuid:=gen_random_uuid();
begin
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","amr":[{"method":"password"}]}',true);
 t:=public.assinar_familiar_fixture(jsonb_build_object('request_id',req,'paciente_id','40000000-0000-4000-8000-000000000001','audiencia','familiar','geracao',1));
 execute 'set local role authenticated';
 r:=api.consultar_paciente_familiar_atestado_privado(t);
 if r->>'ok' is distinct from 'true' then raise exception 'CONSULTA_NEGADA'; end if;
 begin
  perform api.consultar_paciente_familiar_atestado_privado(t);
  raise exception 'REPLAY_ACEITO';
 exception when insufficient_privilege then null; end;
 t:=jsonb_set(t,'{entrada,paciente_id}','"40000000-0000-4000-8000-000000000002"');
 begin
  perform api.consultar_paciente_familiar_atestado_privado(t);
  raise exception 'ADULTERACAO_ACEITA';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
 update identidade.geracao_sessao_familiar set geracao=2 where session_id='20000000-0000-4000-8000-000000000002';
 t:=public.assinar_familiar_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000001','audiencia','familiar','geracao',1));
 execute 'set local role authenticated';
 begin
  perform api.consultar_paciente_familiar_atestado_privado(t);
  raise exception 'GERACAO_ANTIGA_ACEITA';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
 update identidade.geracao_sessao_familiar set geracao=1 where session_id='20000000-0000-4000-8000-000000000002';
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id='10000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado='{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}' where id='50000000-0000-4000-8000-000000000001';
 t:=public.assinar_familiar_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000001','audiencia','familiar','geracao',1));
 execute 'set local role authenticated';
 r:=api.consultar_paciente_familiar_atestado_privado(t);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'REVOGACAO_IGNORADA'; end if;
 execute 'reset role';
end $$;
