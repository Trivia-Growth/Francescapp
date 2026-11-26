\set ON_ERROR_STOP on
-- FR-005 (contexto de cuidado) e FR-002 (rede de cuidado) compartilham fixture e padrão,
-- por isso provam juntos: autorização, idempotência, versionamento, auditoria e imutabilidade.
-- PostgreSQL descartável; Auth e Vault são fixtures fictícias, sem serviço remoto.
\ir anamnese_operacoes_local.sql
-- Traz a coluna auditoria.evento.ator_auth_id, exigida pela negativa de identidade Auth
-- sem perfil: sem ela a negativa viraria violação de chave estrangeira.
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
\ir ../migrations/20261117300000_contexto_cuidado_versoes_privadas.sql
\ir ../migrations/20261117310000_contexto_cuidado_operacoes_privadas.sql
\ir ../migrations/20261117330000_rede_cuidado_versoes_privadas.sql
\ir ../migrations/20261117340000_rede_cuidado_operacoes_privadas.sql

-- Antes do grant nenhum papel de aplicação alcança wrapper, operação interna ou tabela.
do $$
declare papel text; alvo text;
begin
 foreach papel in array array['anon','authenticated','service_role'] loop
  foreach alvo in array array['api.contexto_cuidado_privado(jsonb)','api.contexto_cuidado_operacao_privada(jsonb)','api.rede_cuidado_privado(jsonb)','api.rede_cuidado_operacao_privada(jsonb)'] loop
   if has_function_privilege(papel,alvo,'execute') then raise exception 'EXECUCAO_DIRETA_PERMITIDA: % %',papel,alvo; end if;
  end loop;
  foreach alvo in array array['cadastro.contexto_cuidado_versao','cadastro.rede_cuidado_versao'] loop
   if has_table_privilege(papel,alvo,'select') or has_table_privilege(papel,alvo,'insert')
    or has_table_privilege(papel,alvo,'update') or has_table_privilege(papel,alvo,'delete') then
    raise exception 'TABELA_EXPOSTA: % %',papel,alvo;
   end if;
  end loop;
 end loop;
 -- Owners continuam isolados entre si e longe do nome cifrado do paciente.
 if pg_has_role('ffcmapp_contexto_cuidado_owner','ffcmapp_rede_cuidado_owner','MEMBER')
  or pg_has_role('ffcmapp_anamnese_owner','ffcmapp_contexto_cuidado_owner','MEMBER')
  or has_column_privilege('ffcmapp_contexto_cuidado_owner','cadastro.paciente','nome_cifrado','SELECT')
  or has_column_privilege('ffcmapp_rede_cuidado_owner','cadastro.paciente','nome_cifrado','SELECT')
  or has_table_privilege('ffcmapp_anamnese_owner','cadastro.contexto_cuidado_versao','SELECT')
  or has_table_privilege('ffcmapp_contexto_cuidado_owner','cadastro.rede_cuidado_versao','SELECT')
  or has_table_privilege('ffcmapp_rede_cuidado_owner','cadastro.anamnese_versao','SELECT') then
  raise exception 'OWNER_NAO_ISOLADO';
 end if;
end $$;

\ir ../migrations/20261117350000_grant_contexto_rede_teste.sql

-- Depois do grant só o wrapper fica alcançável, e só por authenticated.
do $$
begin
 if not has_function_privilege('authenticated','api.contexto_cuidado_privado(jsonb)','execute')
  or not has_function_privilege('authenticated','api.rede_cuidado_privado(jsonb)','execute') then
  raise exception 'GRANT_NAO_APLICADO';
 end if;
 if has_function_privilege('authenticated','api.contexto_cuidado_operacao_privada(jsonb)','execute')
  or has_function_privilege('authenticated','api.rede_cuidado_operacao_privada(jsonb)','execute')
  or has_function_privilege('anon','api.contexto_cuidado_privado(jsonb)','execute')
  or has_function_privilege('service_role','api.rede_cuidado_privado(jsonb)','execute') then
  raise exception 'GRANT_AMPLO_DEMAIS';
 end if;
end $$;

-- Familiar e identidade Auth sem perfil, para as negativas.
insert into auth.users values ('10000000-0000-4000-8000-000000000007'),('10000000-0000-4000-8000-000000000008');
insert into public.usuario(id,perfil) values ('10000000-0000-4000-8000-000000000007','familia');
insert into auth.identities select id,id,'google','google-'||id,jsonb_build_object('sub','google-'||id,'email_verified',true,'custom_claims',jsonb_build_object('hd','example.test')) from auth.users where id in ('10000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000008');
insert into auth.sessions values ('20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007',null),('20000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000008',null);

do $$
#variable_conflict use_variable
declare
 ator uuid:='10000000-0000-4000-8000-000000000002';
 sessao uuid:='20000000-0000-4000-8000-000000000002';
 familia uuid:='10000000-0000-4000-8000-000000000007';
 sessao_familia uuid:='20000000-0000-4000-8000-000000000007';
 sem_perfil uuid:='10000000-0000-4000-8000-000000000008';
 sessao_sem_perfil uuid:='20000000-0000-4000-8000-000000000008';
 paciente uuid:='40000000-0000-4000-8000-000000000001';
 feature record; tabela text; wrapper text; gravar text; ler text;
 registro uuid; req uuid; ultima integer; e jsonb; t jsonb; r jsonb;
 conteudo jsonb:=jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22));
begin
 for feature in select * from (values
  ('cadastro.contexto_cuidado_versao','api.contexto_cuidado_privado','api.gravar_contexto_cuidado','api.ler_contexto_cuidado'),
  ('cadastro.rede_cuidado_versao','api.rede_cuidado_privado','api.gravar_rede_cuidado','api.ler_rede_cuidado')
 ) as f(tabela,wrapper,gravar,ler) loop
  tabela:=feature.tabela; wrapper:=feature.wrapper; gravar:=feature.gravar; ler:=feature.ler;

  -- Leitura sem registro devolve vazio, não erro.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
  e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente);
  execute format('select %s($1)',wrapper) into r using public.assinar_anamnese_fixture(e,ler,ator,sessao);
  if r->>'ok' is distinct from 'true' or r->'dados' is distinct from 'null'::jsonb then raise exception 'LEITURA_VAZIA %: %',tabela,r; end if;

  -- Primeira gravação cria a versão 1.
  registro:=gen_random_uuid(); req:=gen_random_uuid();
  e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'registro_id',registro,'versao_esperada',0,
   'chave_idempotencia','chave-'||tabela||'-1','digest_idempotencia',repeat('a',43),'conteudo',conteudo,
   'aad',jsonb_build_object('tabela',tabela,'paciente_id',paciente::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1));
  t:=public.assinar_anamnese_fixture(e,gravar,ator,sessao);
  execute format('select %s($1)',wrapper) into r using t;
  if r->>'ok' is distinct from 'true' or r#>>'{dados,versao}' is distinct from '1'
   or r->>'repeticao' is distinct from 'false' then raise exception 'ESCRITA_V1 %: %',tabela,r; end if;
  if not exists(select 1 from auditoria.evento where request_id=req and resultado='permitido' and ator_usuario_id=ator) then
   raise exception 'AUDITORIA_PERMITIDO_AUSENTE %',tabela;
  end if;

  -- Replay com a mesma chave e o mesmo digest não grava de novo.
  execute format('select %s($1)',wrapper) into r using t;
  if r->>'ok' is distinct from 'true' or r->>'repeticao' is distinct from 'true'
   or r#>>'{dados,registro_id}' is distinct from registro::text then raise exception 'REPLAY %: %',tabela,r; end if;

  -- Mesma chave com digest diferente é conflito de idempotência, não sobrescrita.
  execute format('select %s($1)',wrapper) into r
   using public.assinar_anamnese_fixture(jsonb_set(e,'{digest_idempotencia}',to_jsonb(repeat('b',43))),gravar,ator,sessao);
  if r#>>'{erro,codigo}' is distinct from 'conflito_idempotencia' then raise exception 'CONFLITO_IDEMPOTENCIA %: %',tabela,r; end if;

  -- Versão esperada defasada é conflito.
  registro:=gen_random_uuid();
  e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro,'versao_esperada',0,
   'chave_idempotencia','chave-'||tabela||'-defasada','digest_idempotencia',repeat('c',43),'conteudo',conteudo,
   'aad',jsonb_build_object('tabela',tabela,'paciente_id',paciente::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1));
  execute format('select %s($1)',wrapper) into r using public.assinar_anamnese_fixture(e,gravar,ator,sessao);
  if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'CONFLITO_VERSAO %: %',tabela,r; end if;

  -- Segunda gravação encadeia a versão 2 na anterior.
  registro:=gen_random_uuid();
  e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro,'versao_esperada',1,
   'chave_idempotencia','chave-'||tabela||'-2','digest_idempotencia',repeat('d',43),'conteudo',conteudo,
   'aad',jsonb_build_object('tabela',tabela,'paciente_id',paciente::text,'registro_id',registro::text,'versao',2,'campo','conteudo','formato',1));
  execute format('select %s($1)',wrapper) into r using public.assinar_anamnese_fixture(e,gravar,ator,sessao);
  if r->>'ok' is distinct from 'true' or r#>>'{dados,versao}' is distinct from '2' then raise exception 'ESCRITA_V2 %: %',tabela,r; end if;

  -- Leitura devolve sempre a versão mais recente.
  e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente);
  execute format('select %s($1)',wrapper) into r using public.assinar_anamnese_fixture(e,ler,ator,sessao);
  if r#>>'{dados,versao}' is distinct from '2' or r#>>'{dados,registro_id}' is distinct from registro::text then
   raise exception 'LEITURA_RECENTE %: %',tabela,r;
  end if;

  -- AAD apontando para outra tabela é recusado antes de qualquer escrita.
  registro:=gen_random_uuid();
  e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro,'versao_esperada',2,
   'chave_idempotencia','chave-'||tabela||'-aad','digest_idempotencia',repeat('e',43),'conteudo',conteudo,
   'aad',jsonb_build_object('tabela','cadastro.anamnese_versao','paciente_id',paciente::text,'registro_id',registro::text,'versao',3,'campo','conteudo','formato',1));
  begin
   execute format('select %s($1)',wrapper) into r using public.assinar_anamnese_fixture(e,gravar,ator,sessao);
   raise exception using errcode='22000',message=format('AAD_DIVERGENTE_ACEITO %s: %s',tabela,r);
  exception when invalid_parameter_value then
   null; -- Esperado: ENTRADA_INVALIDA (22023), sem gravar nada.
  end;
  execute format('select max(versao) from %s where paciente_id=$1',tabela) into ultima using paciente;
  if ultima is distinct from 2 then raise exception 'AAD_DIVERGENTE_GRAVOU %: %',tabela,ultima; end if;
 end loop;
end $$;

do $$
#variable_conflict use_variable
declare
 familia uuid:='10000000-0000-4000-8000-000000000007';
 sessao_familia uuid:='20000000-0000-4000-8000-000000000007';
 sem_perfil uuid:='10000000-0000-4000-8000-000000000008';
 sessao_sem_perfil uuid:='20000000-0000-4000-8000-000000000008';
 paciente uuid:='40000000-0000-4000-8000-000000000001';
 feature record; wrapper text; ler text; req uuid; e jsonb; r jsonb;
begin
 for feature in select * from (values
  ('api.contexto_cuidado_privado','api.ler_contexto_cuidado'),
  ('api.rede_cuidado_privado','api.ler_rede_cuidado')
 ) as f(wrapper,ler) loop
  wrapper:=feature.wrapper; ler:=feature.ler;

  -- Família não tem concessão de equipe: negada e auditada com perfil conhecido.
  req:=gen_random_uuid();
  perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
  e:=jsonb_build_object('request_id',req,'paciente_id',paciente);
  execute format('select %s($1)',wrapper) into r using public.assinar_anamnese_fixture(e,ler,familia,sessao_familia);
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FAMILIA_ACEITA %: %',wrapper,r; end if;
  if not exists(select 1 from auditoria.evento where request_id=req and resultado='negado' and ator_usuario_id=familia) then
   raise exception 'AUDITORIA_FAMILIA_AUSENTE %',wrapper;
  end if;

  -- Identidade Auth sem perfil: negada e auditada por ator_auth_id, sem criar usuário.
  req:=gen_random_uuid();
  perform set_config('request.jwt.claims',jsonb_build_object('sub',sem_perfil,'session_id',sessao_sem_perfil,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
  e:=jsonb_build_object('request_id',req,'paciente_id',paciente);
  execute format('select %s($1)',wrapper) into r using public.assinar_anamnese_fixture(e,ler,sem_perfil,sessao_sem_perfil);
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'AUTH_SEM_PERFIL_ACEITO %: %',wrapper,r; end if;
  if not exists(select 1 from auditoria.evento where request_id=req and resultado='negado' and ator_auth_id=sem_perfil and ator_usuario_id is null) then
   raise exception 'AUDITORIA_AUTH_AUSENTE %',wrapper;
  end if;
  if exists(select 1 from public.usuario where id=sem_perfil) then raise exception 'PERFIL_CRIADO_INDEVIDAMENTE %',wrapper; end if;
 end loop;
end $$;

-- Atestado de outra operação não serve para esta: assinatura é amarrada à ação.
do $$
#variable_conflict use_variable
declare
 ator uuid:='10000000-0000-4000-8000-000000000002';
 sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001';
 e jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente);
 begin
  r:=api.contexto_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_rede_cuidado',ator,sessao));
  raise exception 'ATESTADO_CRUZADO_ACEITO: %',r;
 exception when insufficient_privilege then null;
 end;
 begin
  r:=api.rede_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_anamnese',ator,sessao));
  raise exception 'ATESTADO_ANAMNESE_ACEITO: %',r;
 exception when insufficient_privilege then null;
 end;
end $$;

-- Estado final confere que as asserções acima realmente exercitaram as duas features.
do $$
declare tabela text; total integer; cadeia integer;
begin
 foreach tabela in array array['cadastro.contexto_cuidado_versao','cadastro.rede_cuidado_versao'] loop
  execute format('select count(*), count(*) filter (where versao_esperada is not null) from %s',tabela) into total,cadeia;
  if total<>2 or cadeia<>1 then raise exception 'ESTADO_FINAL %: total=% encadeadas=%',tabela,total,cadeia; end if;
 end loop;
 if (select count(*) from auditoria.evento where acao like '%contexto_cuidado%' and resultado='permitido')<4
  or (select count(*) from auditoria.evento where acao like '%rede_cuidado%' and resultado='negado')<2 then
  raise exception 'AUDITORIA_INCOMPLETA';
 end if;
end $$;

-- Versões gravadas são imutáveis mesmo para quem alcança a tabela.
do $$
declare tabela text;
begin
 foreach tabela in array array['cadastro.contexto_cuidado_versao','cadastro.rede_cuidado_versao'] loop
  begin
   execute format('update %s set versao=versao+100',tabela);
   raise exception using errcode='22000',message=format('UPDATE_ACEITO: %s',tabela);
  exception when raise_exception then null;
  end;
  begin
   execute format('delete from %s',tabela);
   raise exception using errcode='22000',message=format('DELETE_ACEITO: %s',tabela);
  exception when raise_exception then null;
  end;
 end loop;
end $$;
