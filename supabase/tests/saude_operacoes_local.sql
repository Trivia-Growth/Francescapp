\set ON_ERROR_STOP on
\ir cadeia_migrations_local.sql
-- A coluna `ator_auth_id` da auditoria vem desta migration; a fatia de saúde a exige.
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
\ir ../migrations/20261117200000_saude_versoes_privadas.sql
\ir ../migrations/20261117210000_saude_operacoes_privadas.sql

-- Antes do grant, nenhum papel do PostgREST alcança o wrapper nem a tabela.
do $$
declare papel text;
begin
 foreach papel in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(papel,'api.saude_operacao_privada(jsonb)','execute')
   or has_table_privilege(papel,'cadastro.saude_versao','select')
   or has_table_privilege(papel,'cadastro.saude_versao','insert') then
   raise exception 'ACESSO_INDEVIDO: %', papel;
  end if;
 end loop;
 -- O owner da saúde não enxerga o nome do paciente nem herda a carteira.
 if has_column_privilege('ffcmapp_saude_owner','cadastro.paciente','nome_cifrado','SELECT')
  or has_table_privilege('ffcmapp_carteira_owner','cadastro.saude_versao','SELECT')
  or pg_has_role('ffcmapp_carteira_owner','ffcmapp_saude_owner','MEMBER')
  or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid
    join pg_roles u on u.oid=m.member where r.rolname='ffcmapp_saude_owner') then
  raise exception 'OWNER_NAO_ISOLADO';
 end if;
end $$;

\ir ../migrations/20261117220000_grant_saude_teste.sql

do $$ begin
 if not has_function_privilege('authenticated','api.saude_operacao_privada(jsonb)','execute') then
  raise exception 'GRANT_NAO_APLICADO';
 end if;
 if has_function_privilege('anon','api.saude_operacao_privada(jsonb)','execute')
  or has_function_privilege('service_role','api.saude_operacao_privada(jsonb)','execute') then
  raise exception 'GRANT_AMPLO_DEMAIS';
 end if;
 begin
  perform api.saude_operacao_privada('{}'::jsonb);
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
select replace(id::text,'10000000-','30000000-')::uuid,'{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}','fixture-'||id,perfil,'google_workspace','vinculada',id,'google-'||id,'{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}',now()-interval '1 day',now() from public.usuario;
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
select replace(id::text,'10000000-','20000000-')::uuid,id,replace(id::text,'10000000-','30000000-')::uuid,1,'google_workspace' from public.usuario;

create function public.assinar_saude_fixture(e jsonb, acao text, ator uuid, sessao uuid) returns jsonb language plpgsql as $$
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
  'chave_idempotencia','chave-saude','digest_idempotencia',repeat('a',43),
  'conteudo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
  'aad',jsonb_build_object('tabela','cadastro.saude_versao','paciente_id',paciente::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1));
 t:=public.assinar_saude_fixture(e,'api.gravar_saude',ator,sessao);
 r:=api.saude_operacao_privada(t);
 if r->>'ok' is distinct from 'true' or r#>>'{dados,versao}' is distinct from '1' then raise exception 'ESCRITA: %',r; end if;
 if not exists(select 1 from auditoria.evento where request_id=req and resultado='permitido' and acao='api.gravar_saude') then raise exception 'AUDITORIA_AUSENTE'; end if;
 -- Reenvio da mesma chave devolve o mesmo registro, sem criar segunda versão.
 r:=api.saude_operacao_privada(t);
 if r->>'ok' is distinct from 'true' or r->>'repeticao' is distinct from 'true' or r#>>'{dados,registro_id}' is distinct from registro::text then raise exception 'REPLAY: %',r; end if;
 -- Mesma chave com conteúdo diferente é conflito, nunca sobrescrita silenciosa.
 r:=api.saude_operacao_privada(public.assinar_saude_fixture(jsonb_set(e,'{digest_idempotencia}',to_jsonb(repeat('b',43))),'api.gravar_saude',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'conflito_idempotencia' then raise exception 'CONFLITO_IDEMPOTENCIA: %',r; end if;
 -- AAD de outra tabela não é aceito: a cifra fica presa ao registro de saúde.
 -- O bloco aninhado existe para que a recusa não desfaça a escrita já comprovada acima.
 begin
  r:=api.saude_operacao_privada(public.assinar_saude_fixture(
    jsonb_set(e,'{aad,tabela}',to_jsonb('cadastro.anamnese_versao'::text)),'api.gravar_saude',ator,sessao));
  raise exception 'AAD_TROCADO_ACEITO: %',r;
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;
end $$;

do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; paciente uuid:='40000000-0000-4000-8000-000000000001'; e jsonb; t jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente);
 t:=public.assinar_saude_fixture(e,'api.ler_saude',ator,sessao);
 r:=api.saude_operacao_privada(t);
 if r->>'ok' is distinct from 'true' or r#>>'{dados,versao}' is distinct from '1' then raise exception 'LEITURA: %',r; end if;
 -- Sessão encerrada perde o acesso mesmo com atestado válido e recém-emitido.
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 r:=api.saude_operacao_privada(public.assinar_saude_fixture(jsonb_set(e,'{request_id}',to_jsonb(gen_random_uuid())),'api.ler_saude',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SESSAO_REVOGADA: %',r; end if;
 update identidade.sessao set encerrada_em=null where session_id=sessao;
 -- Perfil familiar não lê histórico de saúde da coordenação.
 update public.usuario set perfil='familia' where id=ator;
 r:=api.saude_operacao_privada(public.assinar_saude_fixture(jsonb_set(e,'{request_id}',to_jsonb(gen_random_uuid())),'api.ler_saude',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FAMILIA: %',r; end if;
 update public.usuario set perfil='profissional' where id=ator;
 -- Concessão revogada perde o acesso.
 update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),revogada_por_usuario_id=ator,motivo_revogacao_cifrado=motivo_cifrado where usuario_id=ator;
 r:=api.saude_operacao_privada(public.assinar_saude_fixture(jsonb_set(e,'{request_id}',to_jsonb(gen_random_uuid())),'api.ler_saude',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'CONCESSAO_REVOGADA: %',r; end if;
 update identidade.concessao_equipe set estado='vinculada',revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=ator;
 -- Atestado assinado com outra chave é recusado antes de qualquer leitura.
 begin
  r:=api.saude_operacao_privada(jsonb_set(t,'{entrada,atestado,mac}',to_jsonb(repeat('A',43))));
  raise exception 'MAC_FALSO_ACEITO: %',r;
 exception when insufficient_privilege then null;
 end;
end $$;

-- Identidade Auth sem perfil fica auditada sem criar usuário no cadastro.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000003'; sessao uuid:='20000000-0000-4000-8000-000000000003'; req uuid:=gen_random_uuid(); r jsonb;
begin
 insert into auth.users values (ator);
 insert into auth.sessions values (sessao,ator,null);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.saude_operacao_privada(public.assinar_saude_fixture(
   jsonb_build_object('request_id',req,'paciente_id','40000000-0000-4000-8000-000000000001'),'api.ler_saude',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'AUTH_SEM_PERFIL: %',r; end if;
 if not exists(select 1 from auditoria.evento where request_id=req and ator_auth_id=ator and ator_usuario_id is null and resultado='negado') then
  raise exception 'AUDITORIA_AUTH_AUSENTE';
 end if;
 if exists(select 1 from public.usuario where id=ator) then raise exception 'USUARIO_CRIADO_INDEVIDAMENTE'; end if;
end $$;

-- Auditoria obrigatória: se a evidência não grava, nada é persistido.
create function public.falhar_auditoria_saude_fixture() returns trigger language plpgsql as $$
begin
 if current_setting('fixture.falhar_auditoria',true)='sim' then raise exception 'FALHA_AUDITORIA_FIXTURE'; end if;
 return new;
end $$;
create trigger saude_auditoria_fixture before insert on auditoria.evento for each row execute function public.falhar_auditoria_saude_fixture();
insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values
 ('40000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000001');
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; paciente uuid:='40000000-0000-4000-8000-000000000002'; registro uuid:=gen_random_uuid(); e jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 perform set_config('fixture.falhar_auditoria','sim',true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro,'versao_esperada',0,
  'chave_idempotencia','falha-auditoria','digest_idempotencia',repeat('c',43),
  'conteudo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
  'aad',jsonb_build_object('tabela','cadastro.saude_versao','paciente_id',paciente::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1));
 begin
  perform api.saude_operacao_privada(public.assinar_saude_fixture(e,'api.gravar_saude',ator,sessao));
  raise exception 'FALHA_AUDITORIA_NAO_PROPAGADA';
 exception when raise_exception then
  if sqlerrm <> 'FALHA_AUDITORIA_FIXTURE' then raise; end if;
 end;
 if exists(select 1 from operacao.requisicao where chave_idempotencia='falha-auditoria')
  or exists(select 1 from cadastro.saude_versao where paciente_id=paciente) then
  raise exception 'GRAVACAO_PARCIAL_APOS_FALHA_AUDITORIA';
 end if;
end $$;
