\set ON_ERROR_STOP on
\ir cadeia_migrations_local.sql
\ir ../migrations/20261106220000_anamnese_versoes_privadas.sql
\ir ../migrations/20261106230000_anamnese_operacoes_privadas.sql
\ir ../migrations/20261107000000_anamnese_idempotencia_privada.sql
\ir ../migrations/20261107100000_restringir_rls_carteira.sql
\ir ../migrations/20261107110000_isolar_owner_anamnese.sql

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
 if pg_has_role('ffcmapp_carteira_owner','ffcmapp_anamnese_owner','MEMBER')
  or has_column_privilege('ffcmapp_anamnese_owner','cadastro.paciente','nome_cifrado','SELECT')
  or has_table_privilege('ffcmapp_carteira_owner','cadastro.anamnese_versao','SELECT') then
  raise exception 'OWNER_NAO_ISOLADO';
 end if;
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
create function public.assinar_anamnese_fixture(e jsonb, acao text, ator uuid, sessao uuid) returns jsonb language plpgsql as $$
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
 e:=jsonb_build_object('request_id',gen_random_uuid(),'limite',10);
 r:=api.listar_pacientes(public.assinar_anamnese_fixture(e,'api.listar_pacientes',ator,sessao));
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,itens}')<>0 then raise exception 'CARTEIRA_SEM_VINCULO: %',r; end if;
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'registro_id',registro,'versao_esperada',0,
  'chave_idempotencia','chave-fixture','digest_idempotencia',repeat('a',43),
  'conteudo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
  'aad',jsonb_build_object('tabela','cadastro.anamnese_versao','paciente_id',paciente::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1));
 t:=public.assinar_anamnese_fixture(e,'api.gravar_anamnese',ator,sessao);
 r:=api.anamnese_privada(t);
 if r->>'ok' is distinct from 'true' or r#>>'{dados,versao}' is distinct from '1' then raise exception 'ESCRITA: %',r; end if;
 if not exists(select 1 from auditoria.evento where request_id=req and resultado='permitido') then raise exception 'AUDITORIA_AUSENTE'; end if;
 r:=api.anamnese_privada(t);
 if r->>'ok' is distinct from 'true' or r->>'repeticao' is distinct from 'true' or r#>>'{dados,registro_id}' is distinct from registro::text then raise exception 'REPLAY: %',r; end if;
 e:=jsonb_set(e,'{digest_idempotencia}',to_jsonb(repeat('b',43)));
 r:=api.anamnese_privada(public.assinar_anamnese_fixture(e,'api.gravar_anamnese',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'conflito_idempotencia' then raise exception 'CONFLITO_IDEMPOTENCIA: %',r; end if;
 e:=jsonb_set(e,'{digest_idempotencia}',to_jsonb(repeat('a',43)));
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 r:=api.anamnese_privada(public.assinar_anamnese_fixture(e,'api.gravar_anamnese',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'REPLAY_REVOGADO: %',r; end if;
 update identidade.sessao set encerrada_em=null where session_id=sessao;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente);
 t:=public.assinar_anamnese_fixture(e,'api.ler_anamnese',ator,sessao);
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

-- Exercita rollback completo quando a evidência obrigatória não pode ser gravada.
create function public.falhar_auditoria_anamnese_fixture() returns trigger language plpgsql as $$
begin
 if current_setting('fixture.falhar_auditoria',true)='sim' then raise exception 'FALHA_AUDITORIA_FIXTURE'; end if;
 if current_setting('fixture.pausar_auditoria',true)='sim' then perform pg_sleep(1); end if;
 return new;
end $$;
create trigger anamnese_auditoria_fixture before insert on auditoria.evento for each row execute function public.falhar_auditoria_anamnese_fixture();
update identidade.concessao_equipe set estado='vinculada',revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id='10000000-0000-4000-8000-000000000002';
insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values
 ('40000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000001');
create function public.gravar_anamnese_fixture(chave text, registro uuid) returns jsonb language plpgsql as $$
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; paciente uuid:='40000000-0000-4000-8000-000000000002'; e jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro,'versao_esperada',0,
  'chave_idempotencia',chave,'digest_idempotencia',repeat('c',43),
  'conteudo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
  'aad',jsonb_build_object('tabela','cadastro.anamnese_versao','paciente_id',paciente::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1));
 return api.anamnese_privada(public.assinar_anamnese_fixture(e,'api.gravar_anamnese',ator,sessao));
end $$;
do $$
begin
 perform set_config('fixture.falhar_auditoria','sim',true);
 begin
  perform public.gravar_anamnese_fixture('falha-auditoria',gen_random_uuid());
  raise exception 'FALHA_AUDITORIA_NAO_PROPAGADA';
 exception when raise_exception then
  if sqlerrm <> 'FALHA_AUDITORIA_FIXTURE' then raise; end if;
 end;
 if exists(select 1 from operacao.requisicao where chave_idempotencia='falha-auditoria')
  or exists(select 1 from cadastro.anamnese_versao where paciente_id='40000000-0000-4000-8000-000000000002') then
  raise exception 'GRAVACAO_PARCIAL_APOS_FALHA_AUDITORIA';
 end if;
end $$;
