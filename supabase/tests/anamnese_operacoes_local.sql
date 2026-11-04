\set ON_ERROR_STOP on
\ir cadeia_migrations_local.sql
\ir ../migrations/20261106220000_anamnese_versoes_privadas.sql
\ir ../migrations/20261106230000_anamnese_operacoes_privadas.sql

do $$
declare papel text;
begin
 foreach papel in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(papel,'api.anamnese_privada(jsonb)','execute')
   or has_table_privilege(papel,'cadastro.anamnese_versao','select')
   or has_table_privilege(papel,'cadastro.anamnese_versao','insert') then
   raise exception 'ACESSO_INDEVIDO: %', papel;
  end if;
 end loop;
 begin
  perform api.anamnese_privada('{}'::jsonb);
  raise exception 'ENTRADA_INVALIDA_ACEITA';
 exception when insufficient_privilege then null;
 end;
end $$;

insert into vault.segredos_fixture values ('ffcmapp.atestado.teste',encode(decode(repeat('42',32),'hex'),'base64'));
insert into identidade.referencias_atestado_vault(referencia) values ('ffcmapp.atestado.teste');
insert into identidade.configuracao_auth_nativo(dominio_workspace,google_unico_oauth_confirmado) values ('example.test',true);
insert into auth.users values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into public.usuario(id,perfil) values ('10000000-0000-4000-8000-000000000001','administrador'),('10000000-0000-4000-8000-000000000002','profissional');
insert into auth.identities select id,id,'google','google-'||id,jsonb_build_object('sub','google-'||id,'email_verified',true,'custom_claims',jsonb_build_object('hd','example.test')) from auth.users;
insert into auth.sessions select replace(id::text,'10000000-','20000000-')::uuid,id,null from auth.users;
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,criada_em,vinculada_em)
select replace(id::text,'10000000-','30000000-')::uuid,'{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}', 'fixture-'||id,perfil,'google_workspace','vinculada',id,'google-'||id,'{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}',now()-interval '1 day',now() from public.usuario;
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
select replace(id::text,'10000000-','20000000-')::uuid,id,replace(id::text,'10000000-','30000000-')::uuid,1,'google_workspace' from public.usuario;
create role ffcm_operacoes_fixture nologin;
grant usage on schema api to ffcm_operacoes_fixture;
grant execute on function api.cadastro_composicao(jsonb),api.criar_paciente(jsonb),api.listar_pacientes(jsonb) to ffcm_operacoes_fixture;
create function pg_temp.assinar(e jsonb, acao text, ator uuid, sessao uuid) returns jsonb language plpgsql as $$
declare entrada text:=e::text; d jsonb; texto text; mac text;
begin
 d:=jsonb_build_object('key_id','teste','usuario_id',ator,'session_id',sessao,'request_id',e->>'request_id','operacao',acao,'emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '20 seconds','digest_entrada',translate(rtrim(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'));
 texto:=d::text; mac:=translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||texto,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 return jsonb_build_object('entrada',e||jsonb_build_object('atestado',d||jsonb_build_object('mac',mac)),'entrada_canonica',entrada,'dados_canonicos',texto);
end $$;

insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values
 ('40000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000001');
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; paciente uuid:='40000000-0000-4000-8000-000000000001'; registro uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); e jsonb; t jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'registro_id',registro,'versao_esperada',0,
  'conteudo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
  'aad',jsonb_build_object('tabela','cadastro.anamnese_versao','paciente_id',paciente::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1));
 t:=pg_temp.assinar(e,'api.gravar_anamnese',ator,sessao);
 r:=api.anamnese_privada(t);
 if r->>'ok' is distinct from 'true' or r#>>'{dados,versao}' is distinct from '1' then raise exception 'ESCRITA: %',r; end if;
 if not exists(select 1 from auditoria.evento where request_id=req and resultado='permitido') then raise exception 'AUDITORIA_AUSENTE'; end if;
 r:=api.anamnese_privada(t);
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'CONFLITO: %',r; end if;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente);
 t:=pg_temp.assinar(e,'api.ler_anamnese',ator,sessao);
 r:=api.anamnese_privada(t);
 if r->>'ok' is distinct from 'true' or r#>>'{dados,registro_id}' is distinct from registro::text then raise exception 'LEITURA: %',r; end if;
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 r:=api.anamnese_privada(t);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SESSAO_REVOGADA: %',r; end if;
 update identidade.sessao set encerrada_em=null where session_id=sessao;
 update public.usuario set perfil='familia' where id=ator;
 r:=api.anamnese_privada(t);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FAMILIA: %',r; end if;
 update public.usuario set perfil='profissional' where id=ator;
 update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),revogada_por_usuario_id=ator,motivo_revogacao_cifrado=motivo_cifrado where usuario_id=ator;
 r:=api.anamnese_privada(t);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'CONCESSAO_REVOGADA: %',r; end if;
end $$;
