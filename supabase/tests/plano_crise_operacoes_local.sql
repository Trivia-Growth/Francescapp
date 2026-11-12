-- FR-020: provas locais do plano de crise e da marca de habilitação na concessão.
-- Dados fictícios. Exercita positivos e negativos de autorização: quem não tem a marca não
-- aprova, administrador não aprova (a case manager não emite conduta clínica), e a marca só
-- é gravada por administrador.
\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
-- A coluna `ator_auth_id` da auditoria vem desta migration; a fatia de crise a exige.
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
\ir ../migrations/20261118100000_habilitacao_plano_crise_concessao.sql
\ir ../migrations/20261118110000_plano_crise_versoes_privadas.sql
\ir ../migrations/20261118120000_plano_crise_operacoes_privadas.sql

-- Antes do grant, nenhum papel do PostgREST alcança os wrappers nem as tabelas.
do $$
declare papel text;
begin
 foreach papel in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(papel,'api.plano_crise_operacao_privada(jsonb)','execute')
   or has_function_privilege(papel,'api.habilitacao_plano_crise_privado(jsonb)','execute')
   or has_table_privilege(papel,'cadastro.plano_crise_versao','select')
   or has_table_privilege(papel,'cadastro.plano_crise_versao','insert')
   or has_table_privilege(papel,'cadastro.plano_crise_aprovacao','select')
   or has_table_privilege(papel,'cadastro.plano_crise_aprovacao','insert') then
   raise exception 'ACESSO_INDEVIDO: %', papel;
  end if;
 end loop;
 -- Os owners não enxergam o nome do paciente, não herdam outra fatia e não têm membros.
 if has_column_privilege('ffcmapp_plano_crise_owner','cadastro.paciente','nome_cifrado','SELECT')
  or has_table_privilege('ffcmapp_anamnese_owner','cadastro.plano_crise_versao','SELECT')
  or has_table_privilege('ffcmapp_plano_crise_owner','cadastro.anamnese_versao','SELECT')
  or pg_has_role('ffcmapp_plano_crise_owner','ffcmapp_habilitacao_crise_owner','MEMBER')
  or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid
    where r.rolname in ('ffcmapp_plano_crise_owner','ffcmapp_habilitacao_crise_owner')) then
  raise exception 'OWNER_NAO_ISOLADO';
 end if;
 -- A fatia de crise nunca escreve perfil, estado ou e-mail da concessão.
 if has_column_privilege('ffcmapp_habilitacao_crise_owner','identidade.concessao_equipe','perfil','UPDATE')
  or has_column_privilege('ffcmapp_habilitacao_crise_owner','identidade.concessao_equipe','estado','UPDATE')
  or has_column_privilege('ffcmapp_habilitacao_crise_owner','identidade.concessao_equipe','email_cifrado','UPDATE')
  or has_column_privilege('ffcmapp_plano_crise_owner','identidade.concessao_equipe','habilitado_plano_crise','UPDATE') then
  raise exception 'ESCRITA_AMPLA_DEMAIS';
 end if;
end $$;

\ir ../migrations/20261118130000_grant_plano_crise_teste.sql

do $$ begin
 if not has_function_privilege('authenticated','api.plano_crise_operacao_privada(jsonb)','execute')
  or not has_function_privilege('authenticated','api.habilitacao_plano_crise_privado(jsonb)','execute') then
  raise exception 'GRANT_NAO_APLICADO';
 end if;
 if has_function_privilege('anon','api.plano_crise_operacao_privada(jsonb)','execute')
  or has_function_privilege('service_role','api.plano_crise_operacao_privada(jsonb)','execute')
  or has_function_privilege('anon','api.habilitacao_plano_crise_privado(jsonb)','execute')
  or has_function_privilege('service_role','api.habilitacao_plano_crise_privado(jsonb)','execute') then
  raise exception 'GRANT_AMPLO_DEMAIS';
 end if;
end $$;

-- Marcar administrador como habilitado é recusado pela própria tabela.
do $$ begin
 begin
  update identidade.concessao_equipe set habilitado_plano_crise=true
   where id='30000000-0000-4000-8000-000000000001';
  raise exception 'ADMIN_HABILITADO_ACEITO';
 exception when check_violation then null;
 end;
end $$;

-- Escrita do plano por profissional vinculado; a versão nasce sem aprovação.
do $$
#variable_conflict use_variable
declare
 ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; registro uuid:=gen_random_uuid();
 req uuid:=gen_random_uuid(); e jsonb; t jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'registro_id',registro,'versao_esperada',0,
  'chave_idempotencia','crise-1','digest_idempotencia',repeat('a',43),
  'conteudo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
  'aad',jsonb_build_object('tabela','cadastro.plano_crise_versao','paciente_id',paciente::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1));
 t:=public.assinar_anamnese_fixture(e,'api.gravar_plano_crise',ator,sessao);
 r:=api.plano_crise_operacao_privada(t);
 if r->>'ok' is distinct from 'true' or r#>>'{dados,versao}' is distinct from '1'
  or r#>'{dados,aprovacao}' is distinct from 'null'::jsonb then raise exception 'ESCRITA: %',r; end if;
 if not exists(select 1 from auditoria.evento where request_id=req and resultado='permitido' and acao='api.gravar_plano_crise') then
  raise exception 'AUDITORIA_AUSENTE';
 end if;
 r:=api.plano_crise_operacao_privada(t);
 if r->>'ok' is distinct from 'true' or r->>'repeticao' is distinct from 'true'
  or r#>>'{dados,registro_id}' is distinct from registro::text then raise exception 'REPLAY: %',r; end if;
 r:=api.plano_crise_operacao_privada(public.assinar_anamnese_fixture(
   jsonb_set(e,'{digest_idempotencia}',to_jsonb(repeat('b',43))),'api.gravar_plano_crise',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'conflito_idempotencia' then raise exception 'CONFLITO_IDEMPOTENCIA: %',r; end if;
 -- AAD de outra tabela não é aceito: a cifra fica presa ao plano de crise.
 begin
  r:=api.plano_crise_operacao_privada(public.assinar_anamnese_fixture(
    jsonb_set(e,'{aad,tabela}',to_jsonb('cadastro.saude_versao'::text)),'api.gravar_plano_crise',ator,sessao));
  raise exception 'AAD_TROCADO_ACEITO: %',r;
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;
end $$;

-- Sem a marca de habilitação, o mesmo profissional que escreveu não aprova.
do $$
#variable_conflict use_variable
declare
 ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; req uuid:=gen_random_uuid();
 registro uuid; e jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 select v.id into registro from cadastro.plano_crise_versao v where v.paciente_id=paciente order by v.versao desc limit 1;
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'registro_id',registro,'versao',1,
  'chave_idempotencia','aprovar-sem-marca','digest_idempotencia',repeat('c',43));
 r:=api.plano_crise_operacao_privada(public.assinar_anamnese_fixture(e,'api.aprovar_plano_crise',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'APROVOU_SEM_MARCA: %',r; end if;
 if not exists(select 1 from auditoria.evento where request_id=req and resultado='negado' and acao='api.aprovar_plano_crise') then
  raise exception 'AUDITORIA_NEGATIVA_AUSENTE';
 end if;
 if exists(select 1 from cadastro.plano_crise_aprovacao) then raise exception 'APROVACAO_GRAVADA_SEM_MARCA'; end if;
end $$;

-- Profissional não administra a marca de habilitação.
do $$
#variable_conflict use_variable
declare
 ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 req uuid:=gen_random_uuid(); r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.habilitacao_plano_crise_privado(public.assinar_anamnese_fixture(
   jsonb_build_object('request_id',req,'concessao_id','30000000-0000-4000-8000-000000000002','habilitado',true,
     'versao_esperada',0,'chave_idempotencia','marca-profissional','digest_idempotencia',repeat('e',43),
     'auditoria_id',gen_random_uuid()),
   'api.gravar_habilitacao_plano_crise',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'PROFISSIONAL_MARCOU: %',r; end if;
 if exists(select 1 from identidade.concessao_equipe where habilitado_plano_crise) then
  raise exception 'MARCA_GRAVADA_SEM_ADMIN';
 end if;
end $$;

-- Administrador lista a equipe e marca a concessão do profissional.
do $$
#variable_conflict use_variable
declare
 ator uuid:='10000000-0000-4000-8000-000000000001'; sessao uuid:='20000000-0000-4000-8000-000000000001';
 alvo uuid:='30000000-0000-4000-8000-000000000002'; e jsonb; t jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.habilitacao_plano_crise_privado(public.assinar_anamnese_fixture(
   jsonb_build_object('request_id',gen_random_uuid()),'api.listar_habilitacao_plano_crise',ator,sessao));
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r->'dados') <> 2 then raise exception 'LISTA: %',r; end if;
 if exists(select 1 from jsonb_array_elements(r->'dados') i where (i->>'habilitado')::boolean) then
  raise exception 'LISTA_COM_MARCA_INESPERADA: %',r;
 end if;
 -- O e-mail sai cifrado da função; decifrar é responsabilidade do servidor, não do banco.
 if exists(select 1 from jsonb_array_elements(r->'dados') i where jsonb_typeof(i->'email') <> 'object') then
  raise exception 'EMAIL_LEGIVEL_NA_LISTA';
 end if;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'concessao_id',alvo,'habilitado',true,'versao_esperada',0,
   'chave_idempotencia','marca-1','digest_idempotencia',repeat('f',43),'auditoria_id',gen_random_uuid());
 t:=public.assinar_anamnese_fixture(e,'api.gravar_habilitacao_plano_crise',ator,sessao);
 r:=api.habilitacao_plano_crise_privado(t);
 if r->>'ok' is distinct from 'true' or r#>>'{dados,habilitado}' is distinct from 'true'
  or r#>>'{dados,versao}' is distinct from '1' then raise exception 'MARCA: %',r; end if;
 -- Reenvio da mesma chave não dobra a versão da marca.
 r:=api.habilitacao_plano_crise_privado(t);
 if r->>'ok' is distinct from 'true' or r#>>'{dados,versao}' is distinct from '1' then raise exception 'MARCA_REPLAY: %',r; end if;
 -- Versão esperada velha é conflito, não sobrescrita.
 r:=api.habilitacao_plano_crise_privado(public.assinar_anamnese_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'concessao_id',alvo,'habilitado',false,'versao_esperada',0,
     'chave_idempotencia','marca-2','digest_idempotencia',repeat('0',43),'auditoria_id',gen_random_uuid()),
   'api.gravar_habilitacao_plano_crise',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'MARCA_SEM_CONFLITO: %',r; end if;
 -- A marca não vale para administrador, nem por caminho autorizado.
 r:=api.habilitacao_plano_crise_privado(public.assinar_anamnese_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'concessao_id','30000000-0000-4000-8000-000000000001',
     'habilitado',true,'versao_esperada',0,'chave_idempotencia','marca-3','digest_idempotencia',repeat('1',43),
     'auditoria_id',gen_random_uuid()),
   'api.gravar_habilitacao_plano_crise',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'MARCA_EM_ADMIN: %',r; end if;
end $$;

-- Administrador não aprova plano de crise, mesmo administrando a marca.
do $$
#variable_conflict use_variable
declare
 ator uuid:='10000000-0000-4000-8000-000000000001'; sessao uuid:='20000000-0000-4000-8000-000000000001';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; registro uuid; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 select v.id into registro from cadastro.plano_crise_versao v where v.paciente_id=paciente order by v.versao desc limit 1;
 r:=api.plano_crise_operacao_privada(public.assinar_anamnese_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro,'versao',1,
     'chave_idempotencia','aprovar-admin','digest_idempotencia',repeat('2',43)),
   'api.aprovar_plano_crise',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'ADMIN_APROVOU: %',r; end if;
end $$;

-- Com a marca, o profissional aprova a versão corrente e a leitura passa a mostrar o carimbo.
do $$
#variable_conflict use_variable
declare
 ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; registro uuid; e jsonb; t jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 select v.id into registro from cadastro.plano_crise_versao v where v.paciente_id=paciente order by v.versao desc limit 1;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro,'versao',1,
   'chave_idempotencia','aprovar-1','digest_idempotencia',repeat('3',43));
 t:=public.assinar_anamnese_fixture(e,'api.aprovar_plano_crise',ator,sessao);
 r:=api.plano_crise_operacao_privada(t);
 if r->>'ok' is distinct from 'true' or r#>>'{dados,aprovacao,aprovador_usuario_id}' is distinct from ator::text then
  raise exception 'APROVACAO: %',r;
 end if;
 -- A aprovação guarda qual concessão habilitada autorizou o carimbo.
 if not exists(select 1 from cadastro.plano_crise_aprovacao where concessao_id='30000000-0000-4000-8000-000000000002') then
  raise exception 'CONCESSAO_NAO_REGISTRADA';
 end if;
 r:=api.plano_crise_operacao_privada(t);
 if r->>'ok' is distinct from 'true' or r->>'repeticao' is distinct from 'true' then raise exception 'APROVACAO_REPLAY: %',r; end if;
 if (select count(*) from cadastro.plano_crise_aprovacao) <> 1 then raise exception 'APROVACAO_DUPLICADA'; end if;
 -- Nova chave para a mesma versão não gera segundo carimbo da mesma pessoa.
 r:=api.plano_crise_operacao_privada(public.assinar_anamnese_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro,'versao',1,
     'chave_idempotencia','aprovar-2','digest_idempotencia',repeat('4',43)),
   'api.aprovar_plano_crise',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'APROVACAO_REPETIDA: %',r; end if;
 if (select count(*) from cadastro.plano_crise_aprovacao) <> 1 then raise exception 'APROVACAO_DUPLICADA_2'; end if;
 r:=api.plano_crise_operacao_privada(public.assinar_anamnese_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente),'api.ler_plano_crise',ator,sessao));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,aprovacao,aprovador_usuario_id}' is distinct from ator::text then
  raise exception 'LEITURA_SEM_APROVACAO: %',r;
 end if;
end $$;

-- Editar o plano cria versão nova, que nasce sem aprovação; a versão antiga não é mais aprovável.
do $$
#variable_conflict use_variable
declare
 ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; registro uuid:=gen_random_uuid();
 antigo uuid; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 select v.id into antigo from cadastro.plano_crise_versao v where v.paciente_id=paciente and v.versao=1;
 r:=api.plano_crise_operacao_privada(public.assinar_anamnese_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro,'versao_esperada',1,
     'chave_idempotencia','crise-2','digest_idempotencia',repeat('5',43),
     'conteudo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','Yg','tag',repeat('a',22)),
     'aad',jsonb_build_object('tabela','cadastro.plano_crise_versao','paciente_id',paciente::text,'registro_id',registro::text,'versao',2,'campo','conteudo','formato',1)),
   'api.gravar_plano_crise',ator,sessao));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,versao}' is distinct from '2'
  or r#>'{dados,aprovacao}' is distinct from 'null'::jsonb then raise exception 'VERSAO_2: %',r; end if;
 r:=api.plano_crise_operacao_privada(public.assinar_anamnese_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',antigo,'versao',1,
     'chave_idempotencia','aprovar-antiga','digest_idempotencia',repeat('6',43)),
   'api.aprovar_plano_crise',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'APROVOU_VERSAO_ANTIGA: %',r; end if;
end $$;

-- Retirar a marca tira a aprovação futura; o carimbo antigo permanece como registro histórico.
do $$
#variable_conflict use_variable
declare
 admin uuid:='10000000-0000-4000-8000-000000000001'; sessao_admin uuid:='20000000-0000-4000-8000-000000000001';
 ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; registro uuid; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'session_id',sessao_admin,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.habilitacao_plano_crise_privado(public.assinar_anamnese_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'concessao_id','30000000-0000-4000-8000-000000000002',
     'habilitado',false,'versao_esperada',1,'chave_idempotencia','marca-4','digest_idempotencia',repeat('7',43),
     'auditoria_id',gen_random_uuid()),
   'api.gravar_habilitacao_plano_crise',admin,sessao_admin));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,habilitado}' is distinct from 'false' then raise exception 'DESMARCA: %',r; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 select v.id into registro from cadastro.plano_crise_versao v where v.paciente_id=paciente order by v.versao desc limit 1;
 r:=api.plano_crise_operacao_privada(public.assinar_anamnese_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro,'versao',2,
     'chave_idempotencia','aprovar-3','digest_idempotencia',repeat('8',43)),
   'api.aprovar_plano_crise',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'APROVOU_APOS_DESMARCA: %',r; end if;
 if (select count(*) from cadastro.plano_crise_aprovacao) <> 1 then raise exception 'CARIMBO_HISTORICO_PERDIDO'; end if;
end $$;

-- Sessão encerrada e concessão revogada perdem o acesso mesmo com atestado válido.
do $$
#variable_conflict use_variable
declare
 ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; e jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente);
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 r:=api.plano_crise_operacao_privada(public.assinar_anamnese_fixture(e,'api.ler_plano_crise',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SESSAO_ENCERRADA: %',r; end if;
 update identidade.sessao set encerrada_em=null where session_id=sessao;
 update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),revogada_por_usuario_id=ator,motivo_revogacao_cifrado=motivo_cifrado where usuario_id=ator;
 r:=api.plano_crise_operacao_privada(public.assinar_anamnese_fixture(
   jsonb_set(e,'{request_id}',to_jsonb(gen_random_uuid())),'api.ler_plano_crise',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'CONCESSAO_REVOGADA: %',r; end if;
 update identidade.concessao_equipe set estado='vinculada',revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=ator;
 -- Atestado assinado com outra chave é recusado antes de qualquer leitura.
 begin
  r:=api.plano_crise_operacao_privada(jsonb_set(
    public.assinar_anamnese_fixture(e,'api.ler_plano_crise',ator,sessao),
    '{entrada,atestado,mac}',to_jsonb(repeat('A',43))));
  raise exception 'MAC_FALSO_ACEITO: %',r;
 exception when insufficient_privilege then null;
 end;
end $$;

-- Identidade Auth sem perfil fica auditada sem criar usuário no cadastro.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000009'; sessao uuid:='20000000-0000-4000-8000-000000000009';
 req uuid:=gen_random_uuid(); r jsonb;
begin
 insert into auth.users values (ator);
 insert into auth.sessions values (sessao,ator,null);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.plano_crise_operacao_privada(public.assinar_anamnese_fixture(
   jsonb_build_object('request_id',req,'paciente_id','40000000-0000-4000-8000-000000000001'),'api.ler_plano_crise',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'AUTH_SEM_PERFIL: %',r; end if;
 if not exists(select 1 from auditoria.evento where request_id=req and ator_auth_id=ator and ator_usuario_id is null and resultado='negado') then
  raise exception 'AUDITORIA_AUTH_AUSENTE';
 end if;
 if exists(select 1 from public.usuario where id=ator) then raise exception 'USUARIO_CRIADO_INDEVIDAMENTE'; end if;
end $$;
