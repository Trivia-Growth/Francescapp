\set ON_ERROR_STOP on
\ir agenda_google_privilegios_local.sql
insert into vault.segredos_fixture values ('ffcmapp.atestado.teste',encode(decode(repeat('42',32),'hex'),'base64'));
insert into identidade.referencias_atestado_vault(referencia) values ('ffcmapp.atestado.teste');
insert into identidade.configuracao_auth_nativo(dominio_workspace,google_unico_oauth_confirmado) values ('example.test',true);
insert into auth.users values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002'),('10000000-0000-4000-8000-000000000004');
insert into public.usuario(id,perfil) values ('10000000-0000-4000-8000-000000000001','administrador'),('10000000-0000-4000-8000-000000000002','profissional'),('10000000-0000-4000-8000-000000000004','profissional');
insert into auth.identities select id,id,'google','google-'||id,jsonb_build_object('sub','google-'||id,'email_verified',true,'custom_claims',jsonb_build_object('hd','example.test')) from auth.users;
insert into auth.sessions select replace(id::text,'10000000-','20000000-')::uuid,id,null from auth.users;
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,criada_em,vinculada_em)
select replace(id::text,'10000000-','30000000-')::uuid,'{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}','fixture-'||id,perfil,'google_workspace','vinculada',id,'google-'||id,'{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}',now()-interval '1 day',now() from public.usuario;
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
select replace(id::text,'10000000-','20000000-')::uuid,id,replace(id::text,'10000000-','30000000-')::uuid,1,'google_workspace' from public.usuario;

create function public.assinar_agenda_fixture(e jsonb, acao text, ator uuid, sessao uuid) returns jsonb language plpgsql as $$
declare entrada text:=e::text; d jsonb; texto text; mac text;
begin
 d:=jsonb_build_object('key_id','teste','usuario_id',ator,'session_id',sessao,'request_id',e->>'request_id','operacao',acao,'emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '20 seconds','digest_entrada',translate(rtrim(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'));
 texto:=d::text; mac:=translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||texto,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 return jsonb_build_object('entrada',e||jsonb_build_object('atestado',d||jsonb_build_object('mac',mac)),'entrada_canonica',entrada,'dados_canonicos',texto);
end $$;


-- Wrapper real com atestado HMAC; Auth/Vault continuam interfaces fictícias.
do $$
#variable_conflict use_variable
declare ator uuid := '10000000-0000-4000-8000-000000000002';
 sessao uuid := '20000000-0000-4000-8000-000000000002';
 outro uuid := '10000000-0000-4000-8000-000000000004';
 outra_sessao uuid := '20000000-0000-4000-8000-000000000004';
 e jsonb; t jsonb; r jsonb; valor text := 'selado-ficticio';
begin
 e := jsonb_build_object('request_id', gen_random_uuid(), 'hash', repeat('d',64),
  'valor_hash', encode(extensions.digest(convert_to(valor,'UTF8'),'sha256'),'hex'));
 t := public.assinar_agenda_fixture(e,'agenda.registrar',ator,sessao);
 r := identidade.agenda_google_operacao_privada(t,valor);
 if r is distinct from 'true'::jsonb then raise exception 'REGISTRO_WRAPPER_FALHOU: %',r; end if;
 begin
  perform identidade.agenda_google_operacao_privada(t,valor);
  raise exception 'REPLAY_WRAPPER_ACEITO';
 exception when insufficient_privilege then null; end;
 e := jsonb_build_object('request_id', gen_random_uuid(), 'hash', repeat('d',64));
 r := identidade.agenda_google_operacao_privada(public.assinar_agenda_fixture(e,'agenda.consumir',outro,outra_sessao),null);
 if r is distinct from 'null'::jsonb and r is not null then raise exception 'OUTRO_USUARIO_CONSUMIU'; end if;
 e := jsonb_set(e,'{request_id}',to_jsonb(gen_random_uuid()));
 r := identidade.agenda_google_operacao_privada(public.assinar_agenda_fixture(e,'agenda.consumir',ator,sessao),null);
 if r->>'selado' is distinct from valor then raise exception 'CONSUMO_WRAPPER_FALHOU: %',r; end if;
 -- Sessão encerrada: atestado continua válido, autorização deve mudar imediatamente.
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 begin
  perform identidade.agenda_google_operacao_privada(public.assinar_agenda_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'hash',repeat('e',64)),'agenda.consumir',ator,sessao),null);
  raise exception 'SESSAO_ENCERRADA_ACEITA';
 exception when insufficient_privilege then null; end;
 -- Perfil familiar nunca ganha acesso Calendar por possuir subject Google.
 update public.usuario set perfil='familia' where id=outro;
 begin
  perform identidade.agenda_google_operacao_privada(public.assinar_agenda_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'hash',repeat('e',64)),'agenda.consumir',outro,outra_sessao),null);
  raise exception 'FAMILIA_ACEITA';
 exception when insufficient_privilege then null; end;
 update public.usuario set perfil='profissional' where id=outro;
 update identidade.concessao_equipe set estado='revogada', revogada_em=clock_timestamp(), revogada_por_usuario_id=ator, motivo_revogacao_cifrado=motivo_cifrado where usuario_id=outro;
 begin
  perform identidade.agenda_google_operacao_privada(public.assinar_agenda_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'hash',repeat('e',64)),'agenda.consumir',outro,outra_sessao),null);
  raise exception 'CONCESSAO_REVOGADA_ACEITA';
 exception when insufficient_privilege then null; end;
 raise notice 'AGENDA_AUTORIZACAO_OK';
end $$;
