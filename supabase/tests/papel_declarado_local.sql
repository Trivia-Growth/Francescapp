\set ON_ERROR_STOP on
-- ESCRITO PARA BANCO DESCARTÁVEL. Dados fictícios, nenhum serviço remoto.
-- Grupo 6 de `openspec/changes/diario-de-plantao` (FR-079, D4): o papel declarado é
-- catálogo administrado e NÃO é caminho de autorização.
\ir acessos_gerenciados_local.sql

create temp table papel_members_antes as select * from pg_auth_members;
set role acessos_migrador_fixture;
do $$ begin if (select rolsuper from pg_roles where rolname=current_user) then raise exception 'MIGRADOR_SUPERUSER';end if;end $$;
\ir ../migrations/20261127130000_papel_declarado_catalogo.sql
\ir ../migrations/20261127140000_grant_papel_declarado_teste.sql
reset role;
do $$ begin
 if exists(select * from papel_members_antes except select * from pg_auth_members) then raise exception 'MEMBERSHIP_REMOVIDA';end if;
 -- A única membership nova aceitável é a implícita do criador no papel recém-criado
 -- (PostgreSQL 16+ dá ADMIN OPTION a quem executa CREATE ROLE); nenhuma membership
 -- temporária em owner de outra capacidade pode sobrar.
 if exists(select 1 from (select * from pg_auth_members except select * from papel_members_antes) d
   where d.roleid <> 'ffcmapp_papel_declarado_owner'::regrole) then
  raise exception 'MEMBERSHIP_TEMPORARIA_NAO_RESTAURADA: %',
   (select string_agg(d.roleid::regrole::text||'->'||d.member::regrole::text,',') from (select * from pg_auth_members except select * from papel_members_antes) d);end if;
 if exists(select 1 from (select * from pg_auth_members except select * from papel_members_antes) d
   where d.roleid = 'ffcmapp_papel_declarado_owner'::regrole and d.member <> 'acessos_migrador_fixture'::regrole) then
  raise exception 'MEMBERSHIP_INESPERADA_NO_OWNER_NOVO';end if;
end $$;
-- A fixture anterior encerra sessões ao testar revogação: restauração é só de teste.
update identidade.sessao set encerrada_em=null,revogada_em=null where usuario_id in (select usuario_id from acessos_contas_fixture);

-- 1. Semeadura (0.3): exatamente dois termos, ambos de fábrica e ativos.
do $$ begin
 if (select array_agg(nome order by nome) from cadastro.papel_declarado_catalogo)
   is distinct from array['Acompanhante terapêutico','Enfermeira'] then raise exception 'SEMEADURA_FORA_DA_DECISAO';end if;
 if exists(select 1 from cadastro.papel_declarado_catalogo where not de_fabrica or not ativo or versao<>1) then
  raise exception 'SEMEADURA_INCONSISTENTE';end if;
end $$;

-- 2. D4, barreira estrutural: nenhum owner de autorização alcança o catálogo, e o enum
--    `usuario.perfil` continua com os mesmos três valores.
do $$
declare r record; alcancaveis text[];
begin
 select array_agg(rolname order by rolname) into alcancaveis from pg_roles
  where rolname like 'ffcmapp\_%\_owner' and rolname<>'ffcmapp_papel_declarado_owner'
   and has_table_privilege(rolname,'cadastro.papel_declarado_catalogo','SELECT,INSERT,UPDATE,DELETE,REFERENCES,TRIGGER,TRUNCATE');
 if alcancaveis is not null then raise exception 'OWNER_DE_AUTORIZACAO_ALCANCA_PAPEL: %',alcancaveis;end if;
 if (select count(*) from pg_roles where rolname like 'ffcmapp\_%\_owner')<2 then raise exception 'SEM_OWNERS_PARA_COMPARAR';end if;
 if has_table_privilege('authenticated','cadastro.papel_declarado_catalogo','SELECT,INSERT,UPDATE,DELETE')
  or has_table_privilege('anon','cadastro.papel_declarado_catalogo','SELECT')
  or has_column_privilege('service_role','cadastro.papel_declarado_catalogo','id','SELECT')
  or pg_has_role('authenticated','ffcmapp_papel_declarado_owner','MEMBER') then raise exception 'ACESSO_DIRETO_PAPEL';end if;
 if has_table_privilege('ffcmapp_papel_declarado_owner','cadastro.papel_declarado_catalogo','DELETE') then raise exception 'PAPEL_COM_DELETE';end if;
 if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where p.oid='api.papel_declarado_privado(jsonb)'::regprocedure
     and (a.grantee not in (p.proowner,'authenticated'::regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable)) then
  raise exception 'ACL_GRANT_INEXATA';end if;
 if not has_function_privilege('authenticated','api.papel_declarado_privado(jsonb)','EXECUTE')
  or has_function_privilege('anon','api.papel_declarado_privado(jsonb)','EXECUTE')
  or has_function_privilege('service_role','api.papel_declarado_privado(jsonb)','EXECUTE')
  or has_function_privilege('authenticated','operacao.papel_declarado_operacao_privada(jsonb)','EXECUTE') then
  raise exception 'ACL_WRAPPER_INESPERADA';end if;
 -- Decisão 2 do solicitante: o enum de perfil não é alterado por este recorte.
 if not exists(select 1 from pg_constraint where conrelid='public.usuario'::regclass and contype='c'
   and pg_get_constraintdef(oid) like '%perfil%' and pg_get_constraintdef(oid) like '%administrador%'
   and pg_get_constraintdef(oid) like '%profissional%' and pg_get_constraintdef(oid) like '%familia%') then
  raise exception 'ENUM_PERFIL_AUSENTE';end if;
 if exists(select 1 from pg_constraint where conrelid='public.usuario'::regclass and contype='c'
   and pg_get_constraintdef(oid) like '%perfil%'
   and pg_get_constraintdef(oid) ~ 'acompanhante|enfermeir|fono|terapeuta') then
  raise exception 'PAPEL_VAZOU_PARA_O_ENUM_DE_PERFIL';end if;
end $$;

-- 3. Administração pelo Administrador: acrescentar e desativar, sem apagar nada.
do $$
declare c record; t jsonb; r jsonb; e jsonb; novo uuid:=gen_random_uuid();
 at_id uuid:='7f2d0001-0000-4000-8000-000000000001'; linhas bigint;
begin
 select count(*) into linhas from cadastro.papel_declarado_catalogo;
 select * into c from acessos_contas_fixture where funcao='administrador' order by metodo, usuario_id limit 1;
 perform public.acessos_claims_fixture(c.usuario_id,c.sid,case when c.metodo='interno' then 'password' else 'oauth' end);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'papel_id',novo,'nome','Fonoaudióloga','ativo',true,'versao_esperada',0,'chave_idempotencia',gen_random_uuid()::text,'digest_idempotencia',repeat('a',43),'auditoria_id',gen_random_uuid());
 t:=public.acessos_assinar_fixture(e,'api.gravar_papel_declarado');
 set local role authenticated; r:=api.papel_declarado_privado(t); reset role;
 if r->>'ok' is distinct from 'true' or r#>>'{dados,versao}' is distinct from '1' or r#>>'{dados,de_fabrica}' is distinct from 'false' then
  raise exception 'ADMIN_NAO_CRIOU_PAPEL: %',r;end if;
 -- Nome repetido não cria um segundo papel com o mesmo significado.
 e:=jsonb_build_object('request_id',gen_random_uuid(),'papel_id',gen_random_uuid(),'nome','  fonoaudióloga ','ativo',true,'versao_esperada',0,'chave_idempotencia',gen_random_uuid()::text,'digest_idempotencia',repeat('b',43),'auditoria_id',gen_random_uuid());
 t:=public.acessos_assinar_fixture(e,'api.gravar_papel_declarado');
 set local role authenticated; r:=api.papel_declarado_privado(t); reset role;
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'PAPEL_DUPLICADO_ACEITO: %',r;end if;
 -- Desativar é ativo=false com bump de versão; a linha permanece.
 e:=jsonb_build_object('request_id',gen_random_uuid(),'papel_id',at_id,'nome','Acompanhante terapêutico','ativo',false,'versao_esperada',1,'chave_idempotencia',gen_random_uuid()::text,'digest_idempotencia',repeat('c',43),'auditoria_id',gen_random_uuid());
 t:=public.acessos_assinar_fixture(e,'api.gravar_papel_declarado');
 set local role authenticated; r:=api.papel_declarado_privado(t); reset role;
 if r->>'ok' is distinct from 'true' or r#>>'{dados,ativo}' is distinct from 'false' or r#>>'{dados,versao}' is distinct from '2' then
  raise exception 'ADMIN_NAO_DESATIVOU_PAPEL: %',r;end if;
 if (select count(*) from cadastro.papel_declarado_catalogo) <> linhas+1 then raise exception 'LINHA_APAGADA';end if;
 -- Versão vencida é conflito, não ajuste silencioso.
 t:=public.acessos_assinar_fixture(jsonb_set(e,'{request_id}',to_jsonb(gen_random_uuid())) || jsonb_build_object('chave_idempotencia',gen_random_uuid()::text),'api.gravar_papel_declarado');
 set local role authenticated; r:=api.papel_declarado_privado(t); reset role;
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'VERSAO_VENCIDA_ACEITA: %',r;end if;
end $$;

-- 4. Provas negativas: quem não é Administrador não administra; família não lê.
do $$
declare c record; t jsonb; r jsonb; e jsonb; antes jsonb; depois jsonb; negados bigint;
begin
 select jsonb_agg(to_jsonb(x) order by x.id) into antes from (select * from cadastro.papel_declarado_catalogo) x;
 for c in select * from acessos_contas_fixture where funcao<>'administrador' loop
  perform public.acessos_claims_fixture(c.usuario_id,c.sid,case when c.metodo='interno' then 'password' else 'oauth' end);
  e:=jsonb_build_object('request_id',gen_random_uuid(),'papel_id',gen_random_uuid(),'nome','Papel indevido','ativo',true,'versao_esperada',0,'chave_idempotencia',gen_random_uuid()::text,'digest_idempotencia',repeat('d',43),'auditoria_id',gen_random_uuid());
  t:=public.acessos_assinar_fixture(e,'api.gravar_papel_declarado');
  set local role authenticated; r:=api.papel_declarado_privado(t); reset role;
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'NAO_ADMIN_ADMINISTROU_PAPEL: % %',c.funcao,r;end if;
  select count(*) into negados from auditoria.evento where ator_usuario_id=c.usuario_id and acao='api.gravar_papel_declarado' and resultado='negado';
  if negados=0 then raise exception 'TENTATIVA_NAO_AUDITADA: %',c.funcao;end if;
  t:=public.acessos_assinar_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.listar_papel_declarado');
  set local role authenticated; r:=api.papel_declarado_privado(t); reset role;
  if c.funcao='familia' then
   if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'FAMILIA_LEU_CATALOGO_DE_PAPEIS';end if;
  elsif r->>'ok' is distinct from 'true' then raise exception 'PROFISSIONAL_NAO_LEU_PAPEIS: %',r;end if;
  -- Sessão revogada perde o catálogo imediatamente.
  update identidade.sessao set revogada_em=clock_timestamp(),revogada_por_usuario_id=c.usuario_id,motivo_revogacao_cifrado=public.acessos_envelope_fixture() where session_id=c.sid;
  t:=public.acessos_assinar_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.listar_papel_declarado');
  set local role authenticated; r:=api.papel_declarado_privado(t); reset role;
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'REVOGADO_LEU_PAPEIS';end if;
  update identidade.sessao set revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where session_id=c.sid;
 end loop;
 select jsonb_agg(to_jsonb(x) order by x.id) into depois from (select * from cadastro.papel_declarado_catalogo) x;
 if antes is distinct from depois then raise exception 'CATALOGO_ALTERADO_POR_NAO_ADMIN';end if;
end $$;

-- 5. Acesso direto à tabela por `authenticated` continua impossível.
set role authenticated;
do $$ begin
 begin perform 1 from cadastro.papel_declarado_catalogo; raise exception 'TABELA_PAPEL_EXPOSTA';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Concorrência real, Auth externo e integração remota continuam fora do alcance desta prova.
