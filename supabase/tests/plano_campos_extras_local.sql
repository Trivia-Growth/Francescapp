\set ON_ERROR_STOP on
-- ESCRITO, NÃO EXECUTADO. Somente banco descartável e fixtures fictícias.
-- Reutiliza a admissão completa DF-023 e seus helpers, sem copiar credenciais reais.
\ir acessos_gerenciados_local.sql
-- Executar em dois bancos descartáveis: padrão sem SET prévio; segundo com
-- `-v plano_preexisting_set=true`, preservando membership previamente concedida.
\if :{?plano_preexisting_set}
\else
\set plano_preexisting_set false
\endif
\if :plano_preexisting_set
grant ffcmapp_plano_owner to acessos_migrador_fixture with set true;
\endif
create temp table plano_members_antes as select * from pg_auth_members;
create temp table plano_acl_antes as select oid,proowner,proacl,proconfig,prosecdef,proargtypes,prorettype from pg_proc where oid in ('operacao.campo_extra_plano_operacao_privada(jsonb)'::regprocedure,'api.plano_cuidado_operacao_privada(jsonb)'::regprocedure);
create temp table plano_schema_antes as select oid,nspacl from pg_namespace where nspname in ('api','operacao');
set role acessos_migrador_fixture;
do $$ begin if (select rolsuper from pg_roles where rolname=current_user) then raise exception 'MIGRADOR_SUPERUSER';end if;end $$;
\ir ../migrations/20261125190000_plano_campos_extras.sql
reset role;
do $$ begin
 if exists(select * from plano_members_antes except select * from pg_auth_members)
  or exists(select * from pg_auth_members except select * from plano_members_antes) then raise exception 'MEMBERSHIP_MIGRACAO_ALTERADA';end if;
 if exists(select * from plano_acl_antes except select oid,proowner,proacl,proconfig,prosecdef,proargtypes,prorettype from pg_proc) then raise exception 'ACL_OWNER_CONFIG_PLANO_ALTERADO';end if;
 if exists(select * from plano_schema_antes except select oid,nspacl from pg_namespace) then raise exception 'CREATE_TEMPORARIO_NAO_RESTAURADO';end if;
end $$;
-- A fixture anterior encerra sessões ao testar revogação: restauração é só de teste.
update identidade.sessao set encerrada_em=null,revogada_em=null where usuario_id in (select usuario_id from acessos_contas_fixture);

do $$
declare c record; t jsonb; r jsonb; e jsonb; campo uuid:=gen_random_uuid();
 objetivo uuid:=gen_random_uuid(); registro uuid; paciente uuid:='44000000-0000-4000-8000-000000000001';
begin
 insert into cadastro.campo_extra_plano_catalogo(id,nome,tipo,opcoes,ativo,versao,criado_por_usuario_id)
 values(campo,'Número fictício','numero',null,true,1,'11000000-0000-4000-8000-000000000001');
 for c in select * from acessos_contas_fixture loop
  perform public.acessos_claims_fixture(c.usuario_id,c.sid,case when c.metodo='interno' then 'password' else 'oauth' end);
  t:=public.acessos_assinar_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.listar_campo_extra_plano');
  set local role authenticated; r:=api.campo_extra_plano_privado(t); reset role;
  if c.funcao='familia' then
   if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'FAMILIA_LEU_CATALOGO';end if;
  elsif r->>'ok' is distinct from 'true' then raise exception 'COLABORADOR_NAO_LEU_CATALOGO: %',r;end if;
  if c.funcao<>'administrador' then
   e:=jsonb_build_object('request_id',gen_random_uuid(),'campo_id',campo,'nome','Alteração indevida','tipo','numero','opcoes',null,'ativo',false,'versao_esperada',1,'chave_idempotencia',gen_random_uuid()::text,'digest_idempotencia',repeat('c',43),'auditoria_id',gen_random_uuid());
   t:=public.acessos_assinar_fixture(e,'api.gravar_campo_extra_plano');
   set local role authenticated; r:=api.campo_extra_plano_privado(t); reset role;
   if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'NAO_ADMIN_EDITOU_CATALOGO';end if;
  end if;
  update identidade.sessao set revogada_em=clock_timestamp(),revogada_por_usuario_id=c.usuario_id,motivo_revogacao_cifrado=public.acessos_envelope_fixture() where session_id=c.sid;
  t:=public.acessos_assinar_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.listar_campo_extra_plano');
  set local role authenticated; r:=api.campo_extra_plano_privado(t); reset role;
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'REVOGADO_LEU_CATALOGO';end if;
  update identidade.sessao set revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where session_id=c.sid;
 end loop;
 -- Profissional admitido não precisa vínculo individual para plano no modelo vigente.
 select * into strict c from acessos_contas_fixture where funcao='profissional' and metodo='interno';
 perform public.acessos_claims_fixture(c.usuario_id,c.sid,'password');
 insert into cadastro.objetivo_cuidado(id,paciente_id) values(objetivo,paciente);
 insert into cadastro.objetivo_cuidado_versao(id,objetivo_id,versao,versao_esperada,conteudo_cifrado,criado_por_usuario_id,visibilidade)
 values(gen_random_uuid(),objetivo,1,null,public.acessos_envelope_fixture(),c.usuario_id,'interna');
 registro:=gen_random_uuid();
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'objetivo_id',objetivo,'registro_id',registro,'versao_esperada',1,'visibilidade','interna','campos_extras_catalogo',jsonb_build_object(campo::text,1),'chave_idempotencia',gen_random_uuid()::text,'digest_idempotencia',repeat('e',43),'conteudo',public.acessos_envelope_fixture(),'aad',jsonb_build_object('tabela','cadastro.objetivo_cuidado_versao','paciente_id',paciente::text,'objetivo_id',objetivo::text,'registro_id',registro::text,'versao',2,'campo','conteudo','formato',1));
 -- Inatividade entre consulta e gravação não pode publicar uma versão nova.
 update cadastro.campo_extra_plano_catalogo set ativo=false,versao=2 where id=campo;
 t:=public.acessos_assinar_fixture(e,'api.gravar_objetivo_cuidado');
 set local role authenticated; r:=api.plano_cuidado_privado(t); reset role;
 if r#>>'{erro,codigo}' is distinct from 'conflito' or exists(select 1 from cadastro.objetivo_cuidado_versao where id=registro) then raise exception 'CATALOGO_INATIVO_ACEITO: %',r;end if;
 update cadastro.campo_extra_plano_catalogo set ativo=true where id=campo;
 t:=public.acessos_assinar_fixture(e,'api.gravar_objetivo_cuidado');
 set local role authenticated; r:=api.plano_cuidado_privado(t); reset role;
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'VERSAO_CATALOGO_ANTIGA_ACEITA';end if;
 e:=jsonb_set(e,'{campos_extras_catalogo}',jsonb_build_object(campo::text,2));
 t:=public.acessos_assinar_fixture(e,'api.gravar_objetivo_cuidado');
 set local role authenticated; r:=api.plano_cuidado_privado(t); reset role;
 if r->>'ok' is distinct from 'true' or r#>>'{dados,registro_id}' is distinct from registro::text then raise exception 'EXTRA_VIGENTE_RECUSADO: %',r;end if;
 if (select count(*) from cadastro.objetivo_cuidado_versao where objetivo_id=objetivo)<>2 then raise exception 'HISTORICO_NAO_PRESERVADO';end if;
 if has_table_privilege('authenticated','cadastro.campo_extra_plano_catalogo','SELECT,INSERT,UPDATE,DELETE')
  or has_column_privilege('service_role','cadastro.campo_extra_plano_catalogo','id','SELECT')
  or pg_has_role('authenticated','ffcmapp_plano_owner','MEMBER') then raise exception 'ACESSO_DIRETO_CATALOGO';end if;
end $$;
-- Tipo/opção inválidos são provados na fronteira servidor antes da cifra;
-- SQL recebe somente envelope e snapshot assinado, não recebe valor clínico em claro.
-- Concurrency real, locks/owners sob migrador NOSUPER e Auth externo ainda exigem execução.
