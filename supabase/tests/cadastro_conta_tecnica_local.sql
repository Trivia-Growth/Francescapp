\set ON_ERROR_STOP on
\ir cadeia_migrations_local.sql
\ir ../migrations/20261107100000_restringir_rls_carteira.sql
\ir ../migrations/20261109120000_preparar_proveniencia_teste.sql
-- Os grants e dados abaixo existem somente no cluster descartável.
insert into vault.segredos_fixture values ('ffcmapp.atestado.teste',encode(decode(repeat('42',32),'hex'),'base64'));
insert into identidade.referencias_atestado_vault(referencia) values ('ffcmapp.atestado.teste');
insert into identidade.configuracao_auth_nativo(dominio_workspace,google_unico_oauth_confirmado) values ('example.test',true);
insert into auth.users values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into public.usuario(id,perfil) values ('10000000-0000-4000-8000-000000000001','administrador'),('10000000-0000-4000-8000-000000000002','profissional');
insert into operacao.lote_teste(id,identificacao,responsavel_usuario_id) values ('ae000000-0000-4000-8000-000000000002','lote-operacoes-fixture','10000000-0000-4000-8000-000000000001');
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
\ir ../migrations/20261110120000_admissao_tecnica_nativa.sql
\ir ../migrations/20261110140000_cadastro_conta_tecnica.sql
update identidade.concessao_equipe set metodo='tecnica',subject_google=null where usuario_id='10000000-0000-4000-8000-000000000001';
update identidade.sessao set metodo='tecnica' where usuario_id='10000000-0000-4000-8000-000000000001';
insert into identidade.excecao_tecnica(usuario_id,concessao_id,motivo_cifrado) select usuario_id,id,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'::jsonb from identidade.concessao_equipe where usuario_id='10000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","amr":[{"method":"password"}]}',false);
insert into operacao.configuracao_lote_teste(lote_teste_id) values ('ae000000-0000-4000-8000-000000000002');
create function auditoria.falhar_fixture() returns trigger language plpgsql as $$ begin raise exception 'AUDITORIA_FIXTURE'; end $$;
do $$
#variable_conflict use_variable
declare t jsonb; e jsonb; x jsonb; reserva uuid:=gen_random_uuid(); paciente uuid:=gen_random_uuid(); recibo uuid:=gen_random_uuid();
begin
 t:=pg_temp.assinar(jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reservar_cadastro','epoca',1,'reserva_id',reserva),'api.reservar_cadastro',auth.uid(),(auth.jwt()->>'session_id')::uuid);
 delete from identidade.excecao_tecnica;
 if api.cadastro_composicao(t)#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'EXCECAO_AUSENTE'; end if;
 insert into identidade.excecao_tecnica(usuario_id,concessao_id,motivo_cifrado) select usuario_id,id,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'::jsonb from identidade.concessao_equipe where usuario_id=auth.uid();
 if api.cadastro_composicao(t)#>>'{dados,estado}' is distinct from 'aberta' then raise exception 'RESERVA_TECNICA'; end if;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'reserva_id',reserva,'geracao_reserva',1,'auditoria_id',gen_random_uuid(),'chave_idempotencia','tecnica','digest_idempotencia',repeat('a',43),
 'nome',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
 'aad',jsonb_build_object('nome',jsonb_build_object('tabela','cadastro.paciente','registro_id',paciente::text,'campo','nome','formato',1)));
 t:=pg_temp.assinar(e,'api.criar_paciente',auth.uid(),(auth.jwt()->>'session_id')::uuid);
 create trigger falha before insert on auditoria.evento for each row execute function auditoria.falhar_fixture();
 begin perform api.criar_paciente(t); raise exception 'AUDITORIA_IGNORADA'; exception when raise_exception then if sqlerrm <> 'AUDITORIA_FIXTURE' then raise; end if; end;
 drop trigger falha on auditoria.evento;
 if exists(select 1 from cadastro.paciente where id=paciente) then raise exception 'ROLLBACK_INCOMPLETO'; end if;
 if api.criar_paciente(t)->>'ok' is distinct from 'true' or api.criar_paciente(t)->>'ok' is distinct from 'true' then raise exception 'CRIACAO_REPLAY'; end if;
 if (select count(*) from cadastro.paciente where id=paciente)<>1 then raise exception 'CRIACAO_DUPLICADA'; end if;
 update identidade.sessao set encerrada_em=clock_timestamp() where usuario_id=auth.uid();
 if api.criar_paciente(t)#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'REVOGACAO'; end if;
 if not exists(select 1 from auditoria.evento where acao='api.criar_paciente' and objeto_id=paciente and resultado='negado') then raise exception 'NEGACAO_SEM_AUDITORIA'; end if;
end $$;
