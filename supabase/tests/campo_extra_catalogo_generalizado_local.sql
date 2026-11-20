\set ON_ERROR_STOP on
-- ESCRITO PARA BANCO DESCARTÁVEL. Dados fictícios, nenhum serviço remoto.
-- Prova dos grupos 5 e 6 de `openspec/changes/diario-de-plantao`:
--  (a) o comportamento do Plano de cuidado NÃO muda depois da generalização;
--  (b) o escopo da ficha existe, é administrado e preserva resposta antiga;
--  (c) quem não é Administrador não administra o modelo, e a tentativa é auditada.
-- Reusa a fixture do Plano: ela já aplica a cadeia até 20261125190000 e já prova o
-- comportamento ANTES da generalização. O que vem a seguir é o mesmo roteiro DEPOIS.
\ir plano_campos_extras_local.sql

create temp table generalizado_acl_antes as
  select oid, proowner, proacl, proconfig, prosecdef, proargtypes, prorettype from pg_proc
  where oid in ('operacao.campo_extra_plano_operacao_privada(jsonb)'::regprocedure,
                'api.plano_cuidado_operacao_privada(jsonb)'::regprocedure,
                'api.campo_extra_plano_privado(jsonb)'::regprocedure,
                'api.plano_cuidado_privado(jsonb)'::regprocedure);
create temp table generalizado_catalogo_antes as
  select id, nome, tipo, opcoes, ativo, versao, criado_por_usuario_id, criado_em
  from cadastro.campo_extra_plano_catalogo;
create temp table generalizado_versoes_antes as
  select id, objetivo_id, versao, conteudo_cifrado from cadastro.objetivo_cuidado_versao;

set role acessos_migrador_fixture;
do $$ begin if (select rolsuper from pg_roles where rolname=current_user) then raise exception 'MIGRADOR_SUPERUSER';end if;end $$;
\ir ../migrations/20261127100000_campo_extra_catalogo_generalizado.sql
\ir ../migrations/20261127120000_modelo_ficha_plantao_campos_fabrica.sql
reset role;

do $$ begin
 if exists(select * from generalizado_acl_antes except select oid,proowner,proacl,proconfig,prosecdef,proargtypes,prorettype from pg_proc) then
  raise exception 'ACL_OWNER_CONFIG_ALTERADO_PELA_GENERALIZACAO';end if;
 -- Nenhuma linha pré-existente do catálogo foi tocada: só colunas com default entraram.
 if exists(select id,nome,tipo,opcoes,ativo,versao,criado_por_usuario_id,criado_em from generalizado_catalogo_antes
   except select id,nome,tipo,opcoes,ativo,versao,criado_por_usuario_id,criado_em from cadastro.campo_extra_plano_catalogo) then
  raise exception 'LINHA_ANTIGA_DO_CATALOGO_ALTERADA';end if;
 if exists(select 1 from cadastro.campo_extra_plano_catalogo where escopo='plano_cuidado' and (ordem<>0 or obrigatorio or de_fabrica or visibilidade<>'interna')) then
  raise exception 'DEFAULT_NAO_REPRODUZ_COMPORTAMENTO_ATUAL';end if;
 if exists(select id,objetivo_id,versao,conteudo_cifrado from generalizado_versoes_antes
   except select id,objetivo_id,versao,conteudo_cifrado from cadastro.objetivo_cuidado_versao) then
  raise exception 'RESPOSTA_DO_PLANO_TOCADA';end if;
 -- A revalidação saiu do corpo da função do Plano e virou função chamável.
 if (select count(*) from pg_proc where oid='api.plano_cuidado_operacao_privada(jsonb)'::regprocedure
      and prosrc like '%campo_extra_revalidar_snapshot%' and prosrc not like '%versao_catalogo%') <> 1 then
  raise exception 'REVALIDACAO_NAO_EXTRAIDA';end if;
end $$;

-- 1. O Plano, DEPOIS da generalização, responde exatamente como antes.
do $$
declare c record; t jsonb; r jsonb; e jsonb; campo uuid:=gen_random_uuid();
 objetivo uuid:=gen_random_uuid(); registro uuid:=gen_random_uuid();
 paciente uuid:='44000000-0000-4000-8000-000000000001'; linhas bigint;
begin
 select count(*) into linhas from cadastro.objetivo_cuidado_versao;
 insert into cadastro.campo_extra_plano_catalogo(id,nome,tipo,opcoes,ativo,versao,criado_por_usuario_id)
 values(campo,'Número fictício depois','numero',null,true,1,'11000000-0000-4000-8000-000000000001');
 if (select escopo from cadastro.campo_extra_plano_catalogo where id=campo) is distinct from 'plano_cuidado' then
  raise exception 'DEFAULT_DE_ESCOPO_NAO_PRESERVA_PLANO';end if;
 select * into strict c from acessos_contas_fixture where funcao='profissional' and metodo='interno';
 perform public.acessos_claims_fixture(c.usuario_id,c.sid,'password');
 insert into cadastro.objetivo_cuidado(id,paciente_id) values(objetivo,paciente);
 insert into cadastro.objetivo_cuidado_versao(id,objetivo_id,versao,versao_esperada,conteudo_cifrado,criado_por_usuario_id,visibilidade)
 values(gen_random_uuid(),objetivo,1,null,public.acessos_envelope_fixture(),c.usuario_id,'interna');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'objetivo_id',objetivo,'registro_id',registro,'versao_esperada',1,'visibilidade','interna','campos_extras_catalogo',jsonb_build_object(campo::text,1),'chave_idempotencia',gen_random_uuid()::text,'digest_idempotencia',repeat('e',43),'conteudo',public.acessos_envelope_fixture(),'aad',jsonb_build_object('tabela','cadastro.objetivo_cuidado_versao','paciente_id',paciente::text,'objetivo_id',objetivo::text,'registro_id',registro::text,'versao',2,'campo','conteudo','formato',1));
 update cadastro.campo_extra_plano_catalogo set ativo=false,versao=2 where id=campo;
 t:=public.acessos_assinar_fixture(e,'api.gravar_objetivo_cuidado');
 set local role authenticated; r:=api.plano_cuidado_privado(t); reset role;
 if r#>>'{erro,codigo}' is distinct from 'conflito' or exists(select 1 from cadastro.objetivo_cuidado_versao where id=registro) then
  raise exception 'DEPOIS_CATALOGO_INATIVO_ACEITO: %',r;end if;
 update cadastro.campo_extra_plano_catalogo set ativo=true where id=campo;
 t:=public.acessos_assinar_fixture(e,'api.gravar_objetivo_cuidado');
 set local role authenticated; r:=api.plano_cuidado_privado(t); reset role;
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'DEPOIS_VERSAO_ANTIGA_ACEITA: %',r;end if;
 -- Um campo da FICHA não serve de retrato do Plano: escopo errado é conflito, não aceite.
 e:=jsonb_set(e,'{campos_extras_catalogo}',jsonb_build_object('7f1c0001-0000-4000-8000-000000000002',1));
 t:=public.acessos_assinar_fixture(e,'api.gravar_objetivo_cuidado');
 set local role authenticated; r:=api.plano_cuidado_privado(t); reset role;
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'CAMPO_DE_OUTRO_ESCOPO_ACEITO_NO_PLANO: %',r;end if;
 e:=jsonb_set(e,'{campos_extras_catalogo}',jsonb_build_object(campo::text,2));
 t:=public.acessos_assinar_fixture(e,'api.gravar_objetivo_cuidado');
 set local role authenticated; r:=api.plano_cuidado_privado(t); reset role;
 if r->>'ok' is distinct from 'true' or r#>>'{dados,registro_id}' is distinct from registro::text then
  raise exception 'DEPOIS_EXTRA_VIGENTE_RECUSADO: %',r;end if;
 if (select count(*) from cadastro.objetivo_cuidado_versao) <> linhas+2 then raise exception 'HISTORICO_DEPOIS_NAO_PRESERVADO';end if;
end $$;

-- 2. Ação literal continua significando `plano_cuidado`; a da ficha não enxerga o Plano.
do $$
declare c record; t jsonb; r jsonb; plano jsonb; ficha jsonb; esperado bigint;
begin
 select * into c from acessos_contas_fixture where funcao='administrador' order by metodo, usuario_id limit 1;
 perform public.acessos_claims_fixture(c.usuario_id,c.sid,case when c.metodo='interno' then 'password' else 'oauth' end);
 t:=public.acessos_assinar_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.listar_campo_extra_plano');
 set local role authenticated; r:=api.campo_extra_plano_privado(t); reset role;
 if r->>'ok' is distinct from 'true' then raise exception 'LITERAL_NAO_LISTOU: %',r;end if;
 plano:=r->'dados';
 select count(*) into esperado from cadastro.campo_extra_plano_catalogo where escopo='plano_cuidado';
 if jsonb_array_length(plano) <> esperado then raise exception 'LITERAL_MUDOU_DE_CONJUNTO';end if;
 if exists(select 1 from jsonb_array_elements(plano) i where i->>'campo_id' like '7f1c0001%') then
  raise exception 'LITERAL_ENXERGOU_FICHA';end if;
 if exists(select 1 from jsonb_array_elements(plano) i where i ?| array['escopo','ordem','obrigatorio','de_fabrica','visibilidade']) then
  raise exception 'LITERAL_MUDOU_DE_FORMATO';end if;
 t:=public.acessos_assinar_fixture(jsonb_build_object('request_id',gen_random_uuid(),'escopo','ficha_plantao'),'api.listar_campo_extra');
 set local role authenticated; r:=api.campo_extra_plano_privado(t); reset role;
 if r->>'ok' is distinct from 'true' then raise exception 'FICHA_NAO_LISTOU: %',r;end if;
 ficha:=r->'dados';
 if jsonb_array_length(ficha) <> 8 then raise exception 'SEMEADURA_INESPERADA: %',ficha;end if;
 if exists(select 1 from jsonb_array_elements(ficha) i where i->>'escopo' is distinct from 'ficha_plantao' or i->>'de_fabrica' is distinct from 'true') then
  raise exception 'FICHA_FORA_DO_ESCOPO';end if;
 -- Decisão 0.4: nenhum campo de fábrica nasce obrigatório.
 if exists(select 1 from jsonb_array_elements(ficha) i where i->>'obrigatorio' is distinct from 'false') then
  raise exception 'FABRICA_NASCEU_OBRIGATORIA';end if;
 -- Decisão 0.6: nascem compartilháveis exatamente Rotina, Alimentação e Atividades.
 if (select array_agg(i->>'nome' order by i->>'nome') from jsonb_array_elements(ficha) i where i->>'visibilidade'='compartilhavel')
   is distinct from array['Alimentação','Atividades','Rotina'] then
  raise exception 'COMPARTILHAVEIS_FORA_DA_DECISAO';end if;
 -- Ordem determinística, não mais por criado_em.
 if (select array_agg((i->>'ordem')::int) from jsonb_array_elements(ficha) with ordinality t2(i,n))
   is distinct from array[1,2,3,4,5,6,7,8] then raise exception 'ORDEM_NAO_APLICADA';end if;
end $$;

-- 3. Administração do modelo da ficha: acrescentar, reordenar, marcar obrigatório e
--    desativar — inclusive campo de fábrica. Nada é apagado.
do $$
declare c record; t jsonb; r jsonb; e jsonb; novo uuid:=gen_random_uuid();
 fabrica uuid:='7f1c0001-0000-4000-8000-000000000007'; linhas bigint;
begin
 select count(*) into linhas from cadastro.campo_extra_plano_catalogo;
 select * into c from acessos_contas_fixture where funcao='administrador' order by metodo, usuario_id limit 1;
 perform public.acessos_claims_fixture(c.usuario_id,c.sid,case when c.metodo='interno' then 'password' else 'oauth' end);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'campo_id',novo,'escopo','ficha_plantao','nome','Houve banho?','tipo','booleano','opcoes',null,'ativo',true,'ordem',9,'obrigatorio',false,'visibilidade','interna','versao_esperada',0,'chave_idempotencia',gen_random_uuid()::text,'digest_idempotencia',repeat('f',43),'auditoria_id',gen_random_uuid());
 t:=public.acessos_assinar_fixture(e,'api.gravar_campo_extra');
 set local role authenticated; r:=api.campo_extra_plano_privado(t); reset role;
 if r->>'ok' is distinct from 'true' or r#>>'{dados,tipo}' is distinct from 'booleano' or r#>>'{dados,de_fabrica}' is distinct from 'false' then
  raise exception 'TIPO_NOVO_RECUSADO: %',r;end if;
 -- Campo de fábrica reordenado, marcado obrigatório e desativado pelo Administrador.
 e:=jsonb_build_object('request_id',gen_random_uuid(),'campo_id',fabrica,'escopo','ficha_plantao','nome','Observações','tipo','texto_longo','opcoes',null,'ativo',false,'ordem',99,'obrigatorio',true,'visibilidade','interna','versao_esperada',1,'chave_idempotencia',gen_random_uuid()::text,'digest_idempotencia',repeat('g',43),'auditoria_id',gen_random_uuid());
 t:=public.acessos_assinar_fixture(e,'api.gravar_campo_extra');
 set local role authenticated; r:=api.campo_extra_plano_privado(t); reset role;
 if r->>'ok' is distinct from 'true' or r#>>'{dados,versao}' is distinct from '2'
  or r#>>'{dados,ativo}' is distinct from 'false' or r#>>'{dados,obrigatorio}' is distinct from 'true'
  or r#>>'{dados,ordem}' is distinct from '99' or r#>>'{dados,de_fabrica}' is distinct from 'true' then
  raise exception 'FABRICA_NAO_ADMINISTRAVEL: %',r;end if;
 -- Desativar é ativo=false com bump de versão: nada sai da tabela.
 if (select count(*) from cadastro.campo_extra_plano_catalogo) <> linhas+1 then raise exception 'LINHA_APAGADA';end if;
 -- Retrato id->versão vencido recusa a escrita nova em vez de ajustar em silêncio.
 if operacao.campo_extra_revalidar_snapshot('ficha_plantao', jsonb_build_object(fabrica::text,1)) is not false then
  raise exception 'SNAPSHOT_VENCIDO_ACEITO';end if;
 if operacao.campo_extra_revalidar_snapshot('ficha_plantao', jsonb_build_object(novo::text,1)) is not true then
  raise exception 'SNAPSHOT_VIGENTE_RECUSADO';end if;
 -- Campo desativado não revalida nem com a versão certa: ficha nova não o oferece.
 if operacao.campo_extra_revalidar_snapshot('ficha_plantao', jsonb_build_object(fabrica::text,2)) is not false then
  raise exception 'CAMPO_DESATIVADO_OFERECIDO';end if;
 -- Escopo cruzado não revalida.
 if operacao.campo_extra_revalidar_snapshot('plano_cuidado', jsonb_build_object(novo::text,1)) is not false then
  raise exception 'ESCOPO_CRUZADO_ACEITO';end if;
 -- A ação literal do Plano não aceita as chaves novas nem alcança campo da ficha.
 e:=jsonb_build_object('request_id',gen_random_uuid(),'campo_id',novo,'nome','Invasão','tipo','texto','opcoes',null,'ativo',false,'versao_esperada',1,'chave_idempotencia',gen_random_uuid()::text,'digest_idempotencia',repeat('h',43),'auditoria_id',gen_random_uuid());
 t:=public.acessos_assinar_fixture(e,'api.gravar_campo_extra_plano');
 set local role authenticated;
 begin r:=api.campo_extra_plano_privado(t); reset role;
  if r->>'ok' is distinct from 'false' then raise exception 'LITERAL_ALCANCOU_FICHA: %',r;end if;
 exception when others then reset role;
  if sqlstate not in ('22023','P0001') then raise; end if;
 end;
 if (select ativo from cadastro.campo_extra_plano_catalogo where id=novo) is distinct from true then
  raise exception 'LITERAL_DESATIVOU_CAMPO_DA_FICHA';end if;
end $$;

-- 4. Provas negativas da administração do modelo (FR-078, último cenário).
do $$
declare c record; t jsonb; r jsonb; e jsonb; antes jsonb; depois jsonb; negados bigint;
 fabrica uuid:='7f1c0001-0000-4000-8000-000000000002';
begin
 select jsonb_agg(to_jsonb(x) order by x.id) into antes from (select * from cadastro.campo_extra_plano_catalogo) x;
 for c in select * from acessos_contas_fixture where funcao<>'administrador' loop
  perform public.acessos_claims_fixture(c.usuario_id,c.sid,case when c.metodo='interno' then 'password' else 'oauth' end);
  e:=jsonb_build_object('request_id',gen_random_uuid(),'campo_id',fabrica,'escopo','ficha_plantao','nome','Alteração indevida','tipo','texto','opcoes',null,'ativo',false,'ordem',1,'obrigatorio',true,'visibilidade','compartilhavel','versao_esperada',1,'chave_idempotencia',gen_random_uuid()::text,'digest_idempotencia',repeat('i',43),'auditoria_id',gen_random_uuid());
  t:=public.acessos_assinar_fixture(e,'api.gravar_campo_extra');
  set local role authenticated; r:=api.campo_extra_plano_privado(t); reset role;
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'NAO_ADMIN_ADMINISTROU_MODELO: % %',c.funcao,r;end if;
  select count(*) into negados from auditoria.evento
   where ator_usuario_id=c.usuario_id and acao='api.gravar_campo_extra' and resultado='negado';
  if negados=0 then raise exception 'TENTATIVA_NAO_AUDITADA: %',c.funcao;end if;
  -- Familiar não lê o modelo; profissional lê (é quem preenche a ficha).
  t:=public.acessos_assinar_fixture(jsonb_build_object('request_id',gen_random_uuid(),'escopo','ficha_plantao'),'api.listar_campo_extra');
  set local role authenticated; r:=api.campo_extra_plano_privado(t); reset role;
  if c.funcao='familia' then
   if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'FAMILIA_LEU_MODELO_DA_FICHA';end if;
  elsif r->>'ok' is distinct from 'true' then raise exception 'PROFISSIONAL_NAO_LEU_MODELO: %',r;end if;
 end loop;
 select jsonb_agg(to_jsonb(x) order by x.id) into depois from (select * from cadastro.campo_extra_plano_catalogo) x;
 if antes is distinct from depois then raise exception 'MODELO_ALTERADO_POR_NAO_ADMIN';end if;
end $$;

-- 5. ACL: nenhum acesso direto, nenhum DELETE, nada concedido a anon/authenticated/service_role.
do $$ begin
 if has_table_privilege('authenticated','cadastro.campo_extra_plano_catalogo','SELECT,INSERT,UPDATE,DELETE')
  or has_table_privilege('anon','cadastro.campo_extra_plano_catalogo','SELECT')
  or has_column_privilege('service_role','cadastro.campo_extra_plano_catalogo','id','SELECT')
  or pg_has_role('authenticated','ffcmapp_campo_extra_plano_owner','MEMBER')
  or pg_has_role('authenticated','ffcmapp_plano_owner','MEMBER') then raise exception 'ACESSO_DIRETO_CATALOGO';end if;
 if has_table_privilege('ffcmapp_campo_extra_plano_owner','cadastro.campo_extra_plano_catalogo','DELETE')
  or has_table_privilege('ffcmapp_plano_owner','cadastro.campo_extra_plano_catalogo','DELETE') then raise exception 'CATALOGO_COM_DELETE';end if;
 if has_function_privilege('authenticated','operacao.campo_extra_revalidar_snapshot(text,jsonb)','EXECUTE')
  or has_function_privilege('anon','operacao.campo_extra_revalidar_snapshot(text,jsonb)','EXECUTE')
  or has_function_privilege('service_role','operacao.campo_extra_revalidar_snapshot(text,jsonb)','EXECUTE') then
  raise exception 'REVALIDACAO_EXPOSTA';end if;
 if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where p.oid='operacao.campo_extra_revalidar_snapshot(text,jsonb)'::regprocedure
     and (a.grantee not in (p.proowner,'ffcmapp_plano_owner'::regrole,'ffcmapp_campo_extra_plano_owner'::regrole)
       or a.privilege_type<>'EXECUTE' or a.is_grantable)) then raise exception 'ACL_REVALIDACAO_INEXATA';end if;
end $$;
-- Concorrência real, Auth externo e integração remota continuam fora do alcance desta prova.
