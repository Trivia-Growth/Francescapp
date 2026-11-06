-- Cadeia de migrations local; Auth e Vault são fixtures, sem serviço remoto.
\set ON_ERROR_STOP on
\ir cadeia_migrations_local.sql
\ir ../drafts/20261106210000_auditoria_atestado_carteira_experimento.sql
insert into vault.segredos_fixture values ('ffcmapp.atestado.teste',encode(decode(repeat('42',32),'hex'),'base64'));
insert into identidade.referencias_atestado_vault(referencia) values ('ffcmapp.atestado.teste');
insert into identidade.configuracao_auth_nativo(dominio_workspace,google_unico_oauth_confirmado) values ('example.test',true);
insert into auth.users values ('10000000-0000-4000-8000-000000000001');
insert into public.usuario(id,perfil) values ('10000000-0000-4000-8000-000000000001','administrador');
insert into auth.identities select id,id,'google','google-'||id,jsonb_build_object('sub','google-'||id,'email_verified',true,'custom_claims',jsonb_build_object('hd','example.test')) from auth.users;
insert into auth.sessions select replace(id::text,'10000000-','20000000-')::uuid,id,null from auth.users;
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,criada_em,vinculada_em)
select replace(id::text,'10000000-','30000000-')::uuid,'{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}', 'fixture-'||id,perfil,'google_workspace','vinculada',id,'google-'||id,'{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}',now()-interval '1 day',now() from public.usuario;
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
select replace(id::text,'10000000-','20000000-')::uuid,id,replace(id::text,'10000000-','30000000-')::uuid,1,'google_workspace' from public.usuario;
create role ffcm_operacoes_fixture nologin;
grant usage on schema api to ffcm_operacoes_fixture;
grant execute on function api.listar_pacientes(jsonb) to ffcm_operacoes_fixture;

do $$
declare
 ator uuid:='10000000-0000-4000-8000-000000000001'; sessao uuid:='20000000-0000-4000-8000-000000000001';
 req uuid:=gen_random_uuid(); e jsonb; dados jsonb; entrada text; texto text; mac text; t jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',req,'limite',10); entrada:=e::text;
 dados:=jsonb_build_object('key_id','teste','usuario_id',ator,'session_id',sessao,'request_id',req,'operacao','api.listar_pacientes',
  'emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '20 seconds',
  'digest_entrada',translate(rtrim(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'));
 texto:=dados::text;
 mac:=translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||texto,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 t:=jsonb_build_object('entrada',e||jsonb_build_object('atestado',dados||jsonb_build_object('mac',mac)),'entrada_canonica',entrada,'dados_canonicos',texto);
 execute 'set local role ffcm_operacoes_fixture'; r:=api.listar_pacientes(t); execute 'reset role';
 if r->>'ok' is distinct from 'true' or not exists(select 1 from auditoria.evento a where a.request_id=req and a.resultado='permitido') then
  raise exception 'controle válido sem autorização ou auditoria: %',r;
 end if;
 -- Mesmo transporte válido: somente a assinatura é adulterada.
 t:=jsonb_set(t,'{entrada,atestado,mac}',to_jsonb(repeat('A',43)));
 execute 'set local role ffcm_operacoes_fixture';
 r:=api.listar_pacientes(t);
 execute 'reset role';
 -- O request devolvido só correlaciona a resposta; não é evidência autenticada.
 if r->>'ok' is distinct from 'false' or r#>>'{erro,codigo}' is distinct from 'sem_permissao'
  or r->>'request_id' is distinct from req::text or r ? 'dados' then
  raise exception 'negativa inválida: %',r;
 end if;
 if (select count(*) from auditoria.evento a where a.request_id=req) <> 1
  or (select count(*) from auditoria.evento a where a.ator_usuario_id=ator and a.acao='api.listar_pacientes'
   and a.resultado='negado' and a.request_id<>req) <> 1 then
  raise exception 'negativa sem auditoria independente';
 end if;
 begin
  execute 'set local role ffcm_operacoes_fixture';
  perform api.listar_pacientes(jsonb_set(t,'{entrada,request_id}','"inválido"'));
  raise exception 'request inválido aceito';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
 revoke insert (id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) on auditoria.evento from ffcmapp_api_carteira_owner;
 begin
  execute 'set local role ffcm_operacoes_fixture';
  perform api.listar_pacientes(t);
  raise exception 'negativa retornada sem auditoria';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
end $$;
