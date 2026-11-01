\set ON_ERROR_STOP on
-- Auth e Vault são fixtures; migrations e bloqueios_auth.travar são reais.
\ir cadeia_migrations_local.sql
insert into vault.segredos_fixture values ('ffcmapp.atestado.teste',encode(decode(repeat('42',32),'hex'),'base64'));
insert into identidade.referencias_atestado_vault(referencia) values ('ffcmapp.atestado.teste');
insert into identidade.configuracao_auth_nativo(dominio_workspace,google_unico_oauth_confirmado) values ('example.test',true);
insert into auth.users values ('10000000-0000-4000-8000-000000000001');
insert into public.usuario(id,perfil) values ('10000000-0000-4000-8000-000000000001','administrador');
insert into auth.identities select id,id,'google','google-'||id,jsonb_build_object('sub','google-'||id,'email_verified',true,'custom_claims',jsonb_build_object('hd','example.test')) from auth.users;
insert into auth.sessions select '20000000-0000-4000-8000-000000000001',id,null from auth.users;
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,criada_em,vinculada_em)
select '30000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}', 'fixture-'||id,perfil,'google_workspace','vinculada',id,'google-'||id,'{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}',now()-interval '1 day',now() from public.usuario;
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',1,'google_workspace');
create function pg_temp.assinar(e jsonb, acao text, ator uuid, sessao uuid) returns jsonb language plpgsql as $$
declare entrada text:=e::text; d jsonb; texto text; mac text;
begin
 d:=jsonb_build_object('key_id','teste','usuario_id',ator,'session_id',sessao,'request_id',e->>'request_id','operacao',acao,'emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '20 seconds','digest_entrada',translate(rtrim(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'));
 texto:=d::text; mac:=translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||texto,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 return jsonb_build_object('entrada',e||jsonb_build_object('atestado',d||jsonb_build_object('mac',mac)),'entrada_canonica',entrada,'dados_canonicos',texto);
end $$;
create extension dblink;
select dblink_connect('expiracao_real',format('dbname=%L host=%L port=%s user=%L',current_database(),current_setting('unix_socket_directories'),current_setting('port'),session_user));
select dblink_exec('expiracao_real', $$set request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","amr":[{"method":"oauth"}]}'$$);
select pid as backend from dblink('expiracao_real','select pg_backend_pid()') as t(pid integer) \gset

-- A espera é observada em pg_stat_activity antes de aguardar a expiração.
create function pg_temp.testar_expiracao(p_backend integer, p_acao text, p_entrada jsonb, p_funcao text) returns void language plpgsql as $$
declare ator uuid:='10000000-0000-4000-8000-000000000001'; sessao uuid:='20000000-0000-4000-8000-000000000001'; transporte jsonb; resposta jsonb; limite timestamptz; req uuid:=(p_entrada->>'request_id')::uuid;
begin
 update auth.sessions set not_after=clock_timestamp()+interval '3 seconds' where id=sessao;
 transporte:=pg_temp.assinar(p_entrada,p_acao,ator,sessao);
 perform 1 from auth.users where id=ator for update;
 perform dblink_send_query('expiracao_real',format('select %s(%L::jsonb)',p_funcao,transporte::text));
 limite:=clock_timestamp()+interval '2 seconds';
 loop
  exit when exists(select 1 from pg_stat_activity where pid=p_backend and wait_event_type='Lock');
  if clock_timestamp()>limite then raise exception 'ESPERA_NAO_OBSERVADA: %',p_acao; end if;
  perform pg_sleep(0.01);
 end loop;
 perform pg_sleep(3.1);
 -- O chamador libera este bloqueio ao terminar a transação; coleta ocorre fora.
end $$;

-- Cada cenário executa em transação própria para liberar bloqueio antes da coleta.
begin;
select pg_temp.testar_expiracao(:backend,'api.listar_pacientes',jsonb_build_object('request_id','70000000-0000-4000-8000-000000000001','limite',10),'api.listar_pacientes');
commit;
do $$ declare r jsonb; begin select x into r from dblink_get_result('expiracao_real') as t(x jsonb); if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or not exists(select 1 from auditoria.evento where request_id='70000000-0000-4000-8000-000000000001' and resultado='negado') then raise exception 'CARTEIRA_EXPIRADA: %',r; end if; end $$;
select * from dblink_get_result('expiracao_real') as t(x jsonb);
begin;
select pg_temp.testar_expiracao(:backend,'api.reservar_cadastro',jsonb_build_object('request_id','70000000-0000-4000-8000-000000000002','operacao','api.reservar_cadastro','epoca',2,'reserva_id','70000000-0000-4000-8000-000000000003'),'api.cadastro_composicao');
commit;
do $$ declare r jsonb; begin select x into r from dblink_get_result('expiracao_real') as t(x jsonb); if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or not exists(select 1 from auditoria.evento where request_id='70000000-0000-4000-8000-000000000002' and resultado='negado') or exists(select 1 from operacao.reserva_cadastro where id='70000000-0000-4000-8000-000000000003') then raise exception 'BARREIRA_EXPIRADA: %',r; end if; end $$;
select * from dblink_get_result('expiracao_real') as t(x jsonb);
begin;
select pg_temp.testar_expiracao(:backend,'api.criar_paciente',jsonb_build_object('request_id','70000000-0000-4000-8000-000000000004','paciente_id','70000000-0000-4000-8000-000000000005','reserva_id','70000000-0000-4000-8000-000000000003','geracao_reserva',2,'auditoria_id','70000000-0000-4000-8000-000000000006','chave_idempotencia','expiracao','digest_idempotencia',repeat('a',43),'nome',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),'aad',jsonb_build_object('nome',jsonb_build_object('tabela','cadastro.paciente','registro_id','70000000-0000-4000-8000-000000000005','campo','nome','formato',1))),'api.criar_paciente');
commit;
do $$ declare r jsonb; begin select x into r from dblink_get_result('expiracao_real') as t(x jsonb); if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or not exists(select 1 from auditoria.evento where request_id='70000000-0000-4000-8000-000000000004' and resultado='negado') or exists(select 1 from cadastro.paciente where id='70000000-0000-4000-8000-000000000005') then raise exception 'CRIACAO_EXPIRADA: %',r; end if; end $$;
select dblink_disconnect('expiracao_real');
