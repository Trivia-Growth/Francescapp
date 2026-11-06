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
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000001'; sessao uuid:='20000000-0000-4000-8000-000000000001'; reserva uuid:=gen_random_uuid(); paciente uuid:=gen_random_uuid(); e jsonb; t jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reservar_cadastro','epoca',1,'reserva_id',reserva);
 t:=pg_temp.assinar(e,'api.reservar_cadastro',ator,sessao);
 execute 'set local role ffcm_operacoes_fixture';
 r:=api.cadastro_composicao(t);
 if r#>>'{dados,estado}' is distinct from 'aberta' then raise exception 'RESERVA: %',r; end if;
 execute 'reset role';
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'reserva_id',reserva,'geracao_reserva',1,'auditoria_id',gen_random_uuid(),'chave_idempotencia','fixture','digest_idempotencia',repeat('a',43),'nome',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),'aad',jsonb_build_object('nome',jsonb_build_object('tabela','cadastro.paciente','registro_id',paciente::text,'campo','nome','formato',1)));
 t:=pg_temp.assinar(e,'api.criar_paciente',ator,sessao);
 execute 'set local role ffcm_operacoes_fixture';
 begin
  perform api.criar_paciente(t);
  raise exception 'CRIACAO_SEM_LOTE_ACEITA';
 exception when sqlstate '55000' then null; end;
 execute 'reset role';
 insert into operacao.configuracao_lote_teste(lote_teste_id) values ('ae000000-0000-4000-8000-000000000002');
 execute 'set local role ffcm_operacoes_fixture';
 r:=api.criar_paciente(t);
 if r->>'ok' is distinct from 'true' then raise exception 'CRIACAO: %',r; end if;
 execute 'reset role';
 if (select lote_teste_id from cadastro.paciente where id=paciente) is distinct from 'ae000000-0000-4000-8000-000000000002'::uuid then raise exception 'PACIENTE_SEM_LOTE'; end if;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'limite',10); t:=pg_temp.assinar(e,'api.listar_pacientes',ator,sessao);
 execute 'set local role ffcm_operacoes_fixture'; r:=api.listar_pacientes(t);
 if r->>'ok' is distinct from 'true' or jsonb_typeof(r#>'{dados,itens}') is distinct from 'array' or (r#>'{dados,itens}' @> jsonb_build_array(jsonb_build_object('paciente_id',paciente))) is distinct from true then raise exception 'LISTA: %',r; end if;
 execute 'reset role';
 execute 'set local role ffcmapp_carteira_owner';
 if not exists(select 1 from cadastro.paciente p where p.id=paciente) then raise exception 'RLS_ADMIN'; end if;
 execute 'reset role';
 ator:='10000000-0000-4000-8000-000000000002'; sessao:='20000000-0000-4000-8000-000000000002';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 t:=pg_temp.assinar(e,'api.listar_pacientes',ator,sessao);
 execute 'set local role ffcmapp_carteira_owner';
 if exists(select 1 from cadastro.paciente p where p.id=paciente) then raise exception 'RLS_SEM_VINCULO'; end if;
 execute 'reset role';
 execute 'set local role ffcm_operacoes_fixture'; r:=api.listar_pacientes(t);
 if r->>'ok' is distinct from 'true' or jsonb_typeof(r#>'{dados,itens}') is distinct from 'array' or jsonb_array_length(r#>'{dados,itens}') is distinct from 0 then raise exception 'OUTRO_PERFIL: %',r; end if;
 execute 'reset role';
 insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado) values (gen_random_uuid(),paciente,ator,'10000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}');
 execute 'set local role ffcmapp_carteira_owner';
 if not exists(select 1 from cadastro.paciente p where p.id=paciente) then raise exception 'RLS_VINCULO'; end if;
 execute 'reset role';
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id='10000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado=motivo_concessao_cifrado where paciente_id=paciente and usuario_id=ator;
 execute 'set local role ffcmapp_carteira_owner';
 if exists(select 1 from cadastro.paciente p where p.id=paciente) then raise exception 'RLS_VINCULO_REVOGADO'; end if;
 execute 'reset role';
 insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado) values (gen_random_uuid(),paciente,ator,'10000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}');
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 execute 'set local role ffcmapp_carteira_owner';
 if exists(select 1 from cadastro.paciente p where p.id=paciente) then raise exception 'RLS_SESSAO_ENCERRADA'; end if;
 execute 'reset role';
 execute 'set local role ffcm_operacoes_fixture'; r:=api.listar_pacientes(t);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'REVOGACAO: %',r; end if;
 execute 'reset role';
 update identidade.sessao set encerrada_em=null where session_id=sessao;
 revoke insert (id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) on auditoria.evento from ffcmapp_carteira_owner;
 execute 'set local role ffcm_operacoes_fixture';
 begin
  perform api.listar_pacientes(t);
  raise exception 'LISTA_SEM_AUDITORIA';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
end $$;
