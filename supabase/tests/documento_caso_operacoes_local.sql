\set ON_ERROR_STOP on
\ir cadeia_migrations_local.sql
-- A coluna `ator_auth_id` da auditoria vem desta migration; a fatia de documentos a exige.
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
-- A tabela de configuração e a exposição 'publica' são pré-requisito das chaves semeadas:
-- `ffcm.documentos.categorias` precisa ser legível por qualquer profissional autenticado, não
-- só pela administração, porque é a tela de envio que oferece as opções.
\ir ../migrations/20261117400000_configuracao_sistema.sql
\ir ../migrations/20261117410000_configuracao_sistema_operacoes_privadas.sql
\ir ../migrations/20261119110000_configuracao_sistema_opcoes.sql
\ir ../migrations/20261119320000_regras_atendimento_publicas.sql
\ir ../migrations/20261120110000_documento_caso_privado.sql
\ir ../migrations/20261120120000_documento_caso_operacoes_privadas.sql

-- Antes do grant, nenhum papel do PostgREST alcança o wrapper nem as tabelas.
do $$
declare papel text;
begin
 foreach papel in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(papel,'api.documento_operacao_privada(jsonb)','execute')
   or has_table_privilege(papel,'cadastro.documento_caso','select')
   or has_table_privilege(papel,'cadastro.documento_caso_versao','select')
   or has_table_privilege(papel,'cadastro.documento_caso_versao','insert') then
   raise exception 'ACESSO_INDEVIDO: %', papel;
  end if;
 end loop;
 -- O owner de documentos não enxerga o nome do paciente nem herda outra fatia.
 if has_column_privilege('ffcmapp_documento_owner','cadastro.paciente','nome_cifrado','SELECT')
  or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid
    where r.rolname='ffcmapp_documento_owner') then
  raise exception 'OWNER_NAO_ISOLADO';
 end if;
 -- Papel dono sem login, sem superusuário e sem bypass de RLS.
 if exists(select 1 from pg_roles r where r.rolname='ffcmapp_documento_owner'
   and (r.rolcanlogin or r.rolsuper or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb)) then
  raise exception 'OWNER_PRIVILEGIADO_DEMAIS';
 end if;
end $$;

\ir ../migrations/20261120130000_grant_documento_caso_teste.sql

do $$ begin
 if not has_function_privilege('authenticated','api.documento_operacao_privada(jsonb)','execute') then
  raise exception 'GRANT_NAO_APLICADO';
 end if;
 if has_function_privilege('anon','api.documento_operacao_privada(jsonb)','execute')
  or has_function_privilege('service_role','api.documento_operacao_privada(jsonb)','execute') then
  raise exception 'GRANT_AMPLO_DEMAIS';
 end if;
 begin
  perform api.documento_operacao_privada('{}'::jsonb);
  raise exception 'ENTRADA_INVALIDA_ACEITA';
 exception when insufficient_privilege then null;
 end;
end $$;

-- As três chaves de configuração nasceram, e o serviço nasceu DESLIGADO.
do $$
declare ativo jsonb; raiz jsonb; categorias jsonb;
begin
 select valor into ativo from identidade.configuracao_sistema where chave='ffcm.documentos.ativo';
 select valor into raiz from identidade.configuracao_sistema where chave='ffcm.documentos.drive_pasta_raiz';
 select valor into categorias from identidade.configuracao_sistema where chave='ffcm.documentos.categorias';
 if ativo is distinct from 'false'::jsonb then raise exception 'SERVICO_NASCEU_LIGADO: %', ativo; end if;
 if raiz is distinct from '""'::jsonb then raise exception 'PASTA_RAIZ_SEMEADA: %', raiz; end if;
 if jsonb_array_length(categorias) < 1 then raise exception 'CATEGORIAS_VAZIAS'; end if;
end $$;

insert into vault.segredos_fixture values ('ffcmapp.atestado.teste',encode(decode(repeat('42',32),'hex'),'base64'));
insert into identidade.referencias_atestado_vault(referencia) values ('ffcmapp.atestado.teste');
insert into identidade.configuracao_auth_nativo(dominio_workspace,google_unico_oauth_confirmado) values ('example.test',true);
insert into auth.users values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002'),('10000000-0000-4000-8000-000000000003');
-- O terceiro é identidade Auth SEM perfil: existe no Auth e não existe como usuário.
insert into public.usuario(id,perfil) values ('10000000-0000-4000-8000-000000000001','administrador'),('10000000-0000-4000-8000-000000000002','profissional');
insert into auth.identities select id,id,'google','google-'||id,jsonb_build_object('sub','google-'||id,'email_verified',true,'custom_claims',jsonb_build_object('hd','example.test')) from auth.users;
insert into auth.sessions select replace(id::text,'10000000-','20000000-')::uuid,id,null from auth.users;
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,criada_em,vinculada_em)
select replace(id::text,'10000000-','30000000-')::uuid,'{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}','fixture-'||id,perfil,'google_workspace','vinculada',id,'google-'||id,'{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}',now()-interval '1 day',now() from public.usuario;
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
select replace(id::text,'10000000-','20000000-')::uuid,id,replace(id::text,'10000000-','30000000-')::uuid,1,'google_workspace' from public.usuario;

create function public.assinar_documento_fixture(e jsonb, acao text, ator uuid, sessao uuid) returns jsonb language plpgsql as $$
declare entrada text:=e::text; d jsonb; texto text; mac text;
begin
 d:=jsonb_build_object('key_id','teste','usuario_id',ator,'session_id',sessao,'request_id',e->>'request_id','operacao',acao,'emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '20 seconds','digest_entrada',translate(rtrim(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'));
 texto:=d::text; mac:=translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||texto,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 return jsonb_build_object('entrada',e||jsonb_build_object('atestado',d||jsonb_build_object('mac',mac)),'entrada_canonica',entrada,'dados_canonicos',texto);
end $$;

create function public.envelope_fixture() returns jsonb language sql immutable as $$
 select jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22));
$$;

create function public.entrada_documento_fixture(
  paciente uuid, documento uuid, registro uuid, req uuid, esperada integer,
  categoria text default 'Laudo', audiencia text default 'equipe', estado text default 'disponivel',
  chave text default 'chave-documento', digest text default repeat('a',43)
) returns jsonb language sql immutable as $$
 select jsonb_build_object(
  'request_id',req,'paciente_id',paciente,'documento_id',documento,'registro_id',registro,
  'versao_esperada',esperada,'chave_idempotencia',chave,'digest_idempotencia',digest,
  'categoria',categoria,'origem','Clínica fictícia','data_documento','2026-03-04',
  'audiencia',audiencia,'estado',estado,'conteudo',public.envelope_fixture(),
  'aad',jsonb_build_object('tabela','cadastro.documento_caso_versao','paciente_id',paciente::text,
    'registro_id',registro::text,'versao',esperada+1,'campo','conteudo','formato',1));
$$;

insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values
 ('40000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000001');

-- POSITIVO: anexo novo, versão 1, e a relação já volta com ele.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; documento uuid:='50000000-0000-4000-8000-000000000001';
 registro uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(
   public.entrada_documento_fixture(paciente,documento,registro,req,0),'api.gravar_documento',ator,sessao));
 if r->>'ok' is distinct from 'true' then raise exception 'ESCRITA: %',r; end if;
 if jsonb_array_length(r#>'{dados,documentos}') <> 1 then raise exception 'RELACAO_INESPERADA: %',r; end if;
 if r#>>'{dados,documentos,0,versao}' is distinct from '1'
  or r#>>'{dados,documentos,0,estado}' is distinct from 'disponivel'
  or r#>>'{dados,documentos,0,audiencia}' is distinct from 'equipe'
  or r#>>'{dados,documentos,0,categoria}' is distinct from 'Laudo' then
  raise exception 'CAMPOS_INESPERADOS: %',r;
 end if;
 -- A relação carrega o envelope cifrado, nunca o conteúdo em claro.
 if r#>>'{dados,documentos,0,conteudo,ciphertext}' is distinct from 'YQ' then
  raise exception 'ENVELOPE_AUSENTE: %',r;
 end if;
 if not exists(select 1 from auditoria.evento where request_id=req and resultado='permitido' and acao='api.gravar_documento') then
  raise exception 'AUDITORIA_PERMITIDO_AUSENTE';
 end if;
end $$;

-- POSITIVO: replay com a mesma chave e o mesmo digest não duplica e marca repetição.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; documento uuid:='50000000-0000-4000-8000-000000000001';
 req uuid:=gen_random_uuid(); r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(
   public.entrada_documento_fixture(paciente,documento,gen_random_uuid(),req,0),'api.gravar_documento',ator,sessao));
 if r->>'ok' is distinct from 'true' or r->>'repeticao' is distinct from 'true' then
  raise exception 'REPLAY_NAO_IDEMPOTENTE: %',r;
 end if;
 if (select count(*) from cadastro.documento_caso_versao where documento_id=documento) <> 1 then
  raise exception 'REPLAY_DUPLICOU';
 end if;
end $$;

-- NEGATIVO: mesma chave com digest diferente é conflito de idempotência.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; documento uuid:='50000000-0000-4000-8000-000000000001';
 req uuid:=gen_random_uuid(); r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(
   public.entrada_documento_fixture(paciente,documento,gen_random_uuid(),req,0,'Laudo','equipe','disponivel','chave-documento',repeat('b',43)),
   'api.gravar_documento',ator,sessao));
 if r->>'ok' is distinct from 'false' or r#>>'{erro,codigo}' is distinct from 'conflito_idempotencia' then
  raise exception 'DIGEST_DIVERGENTE_ACEITO: %',r;
 end if;
end $$;

-- POSITIVO: versão 2 marca o anexo como não encontrado, e a relação mostra a versão atual.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; documento uuid:='50000000-0000-4000-8000-000000000001';
 req uuid:=gen_random_uuid(); r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(
   public.entrada_documento_fixture(paciente,documento,gen_random_uuid(),req,1,'Laudo','equipe','indisponivel','chave-indisponivel'),
   'api.gravar_documento',ator,sessao));
 if r->>'ok' is distinct from 'true' then raise exception 'VERSAO2: %',r; end if;
 if jsonb_array_length(r#>'{dados,documentos}') <> 1
  or r#>>'{dados,documentos,0,versao}' is distinct from '2'
  or r#>>'{dados,documentos,0,estado}' is distinct from 'indisponivel' then
  raise exception 'VERSAO_ATUAL_INCORRETA: %',r;
 end if;
 -- O histórico permanece: a versão 1 não foi apagada nem alterada.
 if (select count(*) from cadastro.documento_caso_versao where documento_id=documento) <> 2 then
  raise exception 'HISTORICO_PERDIDO';
 end if;
end $$;

-- NEGATIVO: versão esperada defasada é conflito, não sobrescrita.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; documento uuid:='50000000-0000-4000-8000-000000000001';
 req uuid:=gen_random_uuid(); r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(
   public.entrada_documento_fixture(paciente,documento,gen_random_uuid(),req,1,'Laudo','equipe','disponivel','chave-defasada'),
   'api.gravar_documento',ator,sessao));
 if r->>'ok' is distinct from 'false' or r#>>'{erro,codigo}' is distinct from 'conflito' then
  raise exception 'VERSAO_DEFASADA_ACEITA: %',r;
 end if;
end $$;

-- NEGATIVO: documento de OUTRO paciente não recebe versão neste caso.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 outro uuid:='40000000-0000-4000-8000-000000000002'; documento uuid:='50000000-0000-4000-8000-000000000001';
 req uuid:=gen_random_uuid(); r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(
   public.entrada_documento_fixture(outro,documento,gen_random_uuid(),req,2,'Laudo','equipe','disponivel','chave-cruzada'),
   'api.gravar_documento',ator,sessao));
 if r->>'ok' is distinct from 'false' or r#>>'{erro,codigo}' is distinct from 'sem_permissao' then
  raise exception 'VINCULO_CRUZADO_ACEITO: %',r;
 end if;
 if not exists(select 1 from auditoria.evento where request_id=req and resultado='negado') then
  raise exception 'AUDITORIA_NEGADO_AUSENTE';
 end if;
 -- O caso do outro paciente continua sem nenhum anexo.
 if exists(select 1 from cadastro.documento_caso_versao where paciente_id=outro) then
  raise exception 'VAZOU_PARA_OUTRO_CASO';
 end if;
end $$;

-- NEGATIVO: AAD apontando para outro paciente é entrada inválida.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; outro uuid:='40000000-0000-4000-8000-000000000002';
 documento uuid:=gen_random_uuid(); registro uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); e jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=public.entrada_documento_fixture(paciente,documento,registro,req,0,'Laudo','equipe','disponivel','chave-aad');
 e:=jsonb_set(e,'{aad,paciente_id}',to_jsonb(outro::text));
 begin
  perform api.documento_operacao_privada(public.assinar_documento_fixture(e,'api.gravar_documento',ator,sessao));
  raise exception 'AAD_TROCADO_ACEITO';
 exception when invalid_parameter_value then null;
 end;
end $$;

-- NEGATIVO: sem classificação ou sem audiência não conclui (FR-030).
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; documento uuid; registro uuid; req uuid; e jsonb; campo text;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 foreach campo in array array['categoria','audiencia'] loop
  documento:=gen_random_uuid(); registro:=gen_random_uuid(); req:=gen_random_uuid();
  e:=public.entrada_documento_fixture(paciente,documento,registro,req,0,'Laudo','equipe','disponivel','chave-'||campo);
  e:=jsonb_set(e,array[campo],'""'::jsonb);
  begin
   perform api.documento_operacao_privada(public.assinar_documento_fixture(e,'api.gravar_documento',ator,sessao));
   raise exception 'CAMPO_OBRIGATORIO_IGNORADO: %',campo;
  exception when invalid_parameter_value then null;
  end;
 end loop;
end $$;

-- NEGATIVO: MAC falso não passa.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; req uuid:=gen_random_uuid(); t jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 t:=public.assinar_documento_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente),'api.ler_documentos',ator,sessao);
 t:=jsonb_set(t,'{entrada,atestado,mac}',to_jsonb(repeat('z',43)));
 begin
  perform api.documento_operacao_privada(t);
  raise exception 'MAC_FALSO_ACEITO';
 exception when insufficient_privilege then null;
 end;
end $$;

-- NEGATIVO: identidade Auth sem perfil é auditada sem virar usuário.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000003'; sessao uuid:='20000000-0000-4000-8000-000000000003';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; req uuid:=gen_random_uuid(); r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(
   jsonb_build_object('request_id',req,'paciente_id',paciente),'api.ler_documentos',ator,sessao));
 if r->>'ok' is distinct from 'false' or r#>>'{erro,codigo}' is distinct from 'sem_permissao' then
  raise exception 'AUTH_SEM_PERFIL_ACEITO: %',r;
 end if;
 if not exists(select 1 from auditoria.evento where request_id=req and ator_auth_id=ator and ator_usuario_id is null and resultado='negado') then
  raise exception 'AUDITORIA_AUTH_AUSENTE';
 end if;
 if exists(select 1 from public.usuario where id=ator) then raise exception 'USUARIO_CRIADO_INDEVIDAMENTE'; end if;
end $$;

-- NEGATIVO: concessão revogada fecha a porta na hora, e a sessão encerrada também.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; req uuid; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 update identidade.concessao_equipe set estado='revogada', revogada_em=clock_timestamp(),
   revogada_por_usuario_id='10000000-0000-4000-8000-000000000001',
   motivo_revogacao_cifrado=public.envelope_fixture() where usuario_id=ator;
 req:=gen_random_uuid();
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(
   jsonb_build_object('request_id',req,'paciente_id',paciente),'api.ler_documentos',ator,sessao));
 if r->>'ok' is distinct from 'false' or r#>>'{erro,codigo}' is distinct from 'sem_permissao' then
  raise exception 'REVOGACAO_IGNORADA: %',r;
 end if;
 update identidade.concessao_equipe set estado='vinculada', revogada_em=null,
   revogada_por_usuario_id=null, motivo_revogacao_cifrado=null where usuario_id=ator;

 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 req:=gen_random_uuid();
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(
   jsonb_build_object('request_id',req,'paciente_id',paciente),'api.ler_documentos',ator,sessao));
 if r->>'ok' is distinct from 'false' or r#>>'{erro,codigo}' is distinct from 'sem_permissao' then
  raise exception 'SESSAO_ENCERRADA_ACEITA: %',r;
 end if;
 update identidade.sessao set encerrada_em=null where session_id=sessao;
end $$;

-- `removido` sai da relação; `indisponivel` continua aparecendo.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; documento uuid:='50000000-0000-4000-8000-000000000001';
 req uuid:=gen_random_uuid(); r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(
   public.entrada_documento_fixture(paciente,documento,gen_random_uuid(),req,2,'Laudo','equipe','removido','chave-removido'),
   'api.gravar_documento',ator,sessao));
 if r->>'ok' is distinct from 'true' then raise exception 'REMOCAO: %',r; end if;
 if jsonb_array_length(r#>'{dados,documentos}') <> 0 then
  raise exception 'REMOVIDO_AINDA_LISTADO: %',r;
 end if;
 -- Removido não é apagado: as três versões continuam na trilha.
 if (select count(*) from cadastro.documento_caso_versao where documento_id=documento) <> 3 then
  raise exception 'REMOCAO_APAGOU_HISTORICO';
 end if;
end $$;

-- Imutabilidade: nem o migrador consegue alterar ou apagar uma versão.
do $$
begin
 begin
  update cadastro.documento_caso_versao set categoria='Outro' where versao=1;
  raise exception 'UPDATE_ACEITO';
 exception when raise_exception then
  if sqlerrm = 'UPDATE_ACEITO' then raise; end if;
 end;
 begin
  delete from cadastro.documento_caso_versao where versao=1;
  raise exception 'DELETE_ACEITO';
 exception when raise_exception then
  if sqlerrm = 'DELETE_ACEITO' then raise; end if;
 end;
end $$;

do $$ begin raise notice 'DOCUMENTOS_OK'; end $$;
