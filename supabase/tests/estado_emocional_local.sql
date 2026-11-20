\set ON_ERROR_STOP on
-- ESCRITO PARA BANCO DESCARTÁVEL. Dados fictícios, nenhum serviço remoto.
-- Catálogo administrado de estado emocional observado (FR-076/FR-081). O termo é vocabulário
-- de OBSERVAÇÃO e NÃO é caminho de autorização.
\ir turno_execucao_clinica_local.sql

update identidade.sessao set encerrada_em=null,revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id in(select usuario_id from acessos_contas_fixture);
update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id in(select usuario_id from acessos_contas_fixture);

create temp table emocional_members_antes as select * from pg_auth_members;
set role turno_core_migrador_fixture;
do $$ begin if (select rolsuper from pg_roles where rolname=current_user) then raise exception 'MIGRADOR_SUPERUSER';end if;end $$;
-- Catálogo de papéis: a migration 20261128230000 estreita o seu CHECK para 80.
\ir ../migrations/20261127130000_papel_declarado_catalogo.sql
\ir ../migrations/20261127140000_grant_papel_declarado_teste.sql
\ir ../migrations/20261127200000_ficha_plantao.sql
\ir ../migrations/20261128210000_estado_emocional_catalogo.sql
\ir ../migrations/20261128220000_grant_estado_emocional_teste.sql
\ir ../migrations/20261128230000_papel_declarado_limite_80.sql
reset role;
do $$ begin
 if exists(select * from emocional_members_antes except select * from pg_auth_members) then raise exception 'MEMBERSHIP_REMOVIDA';end if;
 -- As únicas memberships novas aceitáveis são as implícitas do criador nos papéis recém
 -- criados por estas migrations; nenhuma membership temporária em owner de outra capacidade
 -- pode sobrar.
 if exists(select 1 from (select * from pg_auth_members except select * from emocional_members_antes) d
   where d.roleid not in('ffcmapp_ficha_plantao_owner'::regrole,'ffcmapp_estado_emocional_owner'::regrole,'ffcmapp_papel_declarado_owner'::regrole)) then
  raise exception 'MEMBERSHIP_TEMPORARIA_NAO_RESTAURADA: %',
   (select string_agg(d.roleid::regrole::text||'->'||d.member::regrole::text,',') from (select * from pg_auth_members except select * from emocional_members_antes) d);end if;
end $$;
update identidade.sessao set encerrada_em=null,revogada_em=null where usuario_id in (select usuario_id from acessos_contas_fixture);

-- 1. Semeadura: oito termos de fábrica, ativos, versão 1, nenhum deles com nota, escala,
--    número ou palavra de gravidade. A ordem é alfabética, nunca por gravidade.
do $$
declare esperados text[]:=array['agitado','apático','choroso','comunicativo','irritado','retraído','sonolento','tranquilo'];
begin
 if (select array_agg(estado order by estado) from cadastro.turno_estado_emocional_catalogo) is distinct from esperados then
  raise exception 'SEMEADURA_FORA_DA_DECISAO: %',(select array_agg(estado order by estado) from cadastro.turno_estado_emocional_catalogo);end if;
 if exists(select 1 from cadastro.turno_estado_emocional_catalogo where not de_fabrica or not ativo or versao<>1 or criado_por_usuario_id is not null) then
  raise exception 'SEMEADURA_INCONSISTENTE';end if;
 if exists(select 1 from cadastro.turno_estado_emocional_catalogo where estado ~* '(grave|leve|moder|intens|risco|nota|n[ií]vel|escala|cr[ií]tico|[0-9])') then
  raise exception 'TERMO_SUGERE_GRAVIDADE';end if;
 -- `ordem` é alfabética; nenhuma leitura de produção a usa como gravidade, e a operação
 -- administrada nem sequer a expõe.
 if exists(select 1 from cadastro.turno_estado_emocional_catalogo a join cadastro.turno_estado_emocional_catalogo b on a.ordem<b.ordem where a.estado>b.estado) then
  raise exception 'ORDEM_NAO_ALFABETICA';end if;
end $$;

-- 2. O DEFEITO que motivou a fatia: com o catálogo vazio, a validação de `20261127200000:428`
--    recusa a ficha inteira. Com o catálogo semeado, o mesmo caminho aceita o termo.
do $$ begin
 perform 1 from cadastro.turno_estado_emocional_catalogo c where c.estado='tranquilo' and c.ativo;
 if not found then raise exception 'FICHA_CONTINUA_SEM_TERMO_VALIDO';end if;
 perform 1 from cadastro.turno_estado_emocional_catalogo c where c.estado='inexistente fictício' and c.ativo;
 if found then raise exception 'TERMO_FORA_DO_CATALOGO_ACEITO';end if;
end $$;

-- 3. Barreira estrutural: nenhum owner de autorização alcança o catálogo; o owner da ficha
--    lê e NÃO escreve; ninguém tem DELETE; `authenticated` não toca a tabela.
do $$
declare alcancaveis text[];
begin
 select array_agg(rolname order by rolname) into alcancaveis from pg_roles
  where rolname like 'ffcmapp\_%\_owner' and rolname not in('ffcmapp_estado_emocional_owner','ffcmapp_ficha_plantao_owner')
   and has_table_privilege(rolname,'cadastro.turno_estado_emocional_catalogo','SELECT,INSERT,UPDATE,DELETE,REFERENCES,TRIGGER,TRUNCATE');
 if alcancaveis is not null then raise exception 'OWNER_DE_AUTORIZACAO_ALCANCA_ESTADO_EMOCIONAL: %',alcancaveis;end if;
 if (select count(*) from pg_roles where rolname like 'ffcmapp\_%\_owner')<2 then raise exception 'SEM_OWNERS_PARA_COMPARAR';end if;
 if not has_table_privilege('ffcmapp_ficha_plantao_owner','cadastro.turno_estado_emocional_catalogo','SELECT')
  or has_table_privilege('ffcmapp_ficha_plantao_owner','cadastro.turno_estado_emocional_catalogo','INSERT,UPDATE,DELETE,TRUNCATE') then
  raise exception 'LEITURA_DA_FICHA_ALTERADA';end if;
 if has_table_privilege('authenticated','cadastro.turno_estado_emocional_catalogo','SELECT,INSERT,UPDATE,DELETE')
  or has_table_privilege('anon','cadastro.turno_estado_emocional_catalogo','SELECT')
  or has_column_privilege('service_role','cadastro.turno_estado_emocional_catalogo','estado','SELECT')
  or pg_has_role('authenticated','ffcmapp_estado_emocional_owner','MEMBER') then raise exception 'ACESSO_DIRETO_ESTADO_EMOCIONAL';end if;
 if has_table_privilege('ffcmapp_estado_emocional_owner','cadastro.turno_estado_emocional_catalogo','DELETE') then raise exception 'ESTADO_EMOCIONAL_COM_DELETE';end if;
 -- ACL exata do wrapper, no molde de turno_grant_local.sql.
 if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where p.oid='api.estado_emocional_privado(jsonb)'::regprocedure
     and (a.grantee not in (p.proowner,'authenticated'::regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable)) then
  raise exception 'ACL_GRANT_INEXATA';end if;
 if not has_function_privilege('authenticated','api.estado_emocional_privado(jsonb)','EXECUTE')
  or has_function_privilege('anon','api.estado_emocional_privado(jsonb)','EXECUTE')
  or has_function_privilege('service_role','api.estado_emocional_privado(jsonb)','EXECUTE')
  or has_function_privilege('authenticated','operacao.estado_emocional_operacao_privada(jsonb)','EXECUTE') then
  raise exception 'ACL_WRAPPER_INESPERADA';end if;
 -- FR-076/FR-081: o registro canônico continua sem número, e o enum de perfil intacto.
 if (select pg_get_constraintdef(oid) from pg_constraint where conrelid='cadastro.turno_medida_versao'::regclass
     and conname='turno_medida_versao_forma_chk') !~ 'estado_emocional.{0,200}?valor IS NULL' then
  raise exception 'ESTADO_EMOCIONAL_GANHOU_VALOR';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.usuario'::regclass and contype='c'
   and pg_get_constraintdef(oid) like '%perfil%' and pg_get_constraintdef(oid) like '%administrador%'
   and pg_get_constraintdef(oid) like '%profissional%' and pg_get_constraintdef(oid) like '%familia%') then
  raise exception 'ENUM_PERFIL_AUSENTE';end if;
 if exists(select 1 from pg_constraint where conrelid='public.usuario'::regclass and contype='c'
   and pg_get_constraintdef(oid) like '%perfil%' and pg_get_constraintdef(oid) ~ 'agitado|tranquilo|choroso') then
  raise exception 'TERMO_VAZOU_PARA_O_ENUM_DE_PERFIL';end if;
end $$;

-- 4. Divergência de tamanho (migration 20261128230000): o catálogo de papéis passa a aceitar
--    no máximo 80, igual à ficha. Nenhum papel semeado foi perdido.
do $$ declare definicao text; begin
 select pg_get_constraintdef(oid) into definicao from pg_constraint
  where conrelid='cadastro.papel_declarado_catalogo'::regclass and conname='papel_declarado_catalogo_nome_chk';
 if definicao is null or definicao !~ '\m80\M' or definicao ~ '120' then raise exception 'LIMITE_80_NAO_APLICADO: %',coalesce(definicao,'(ausente)');end if;
 if (select count(*) from cadastro.papel_declarado_catalogo) <> 2 then raise exception 'SEMEADURA_DE_PAPEL_PERDIDA';end if;
 begin
  insert into cadastro.papel_declarado_catalogo(id,nome,ativo,de_fabrica,versao,criado_por_usuario_id)
   values(gen_random_uuid(),repeat('x',81),true,true,1,null);
  raise exception 'NOME_DE_81_ACEITO';
 exception when check_violation then null; end;
end $$;

-- 5. Administração pelo Administrador: acrescentar, renomear e desativar, sem apagar nada.
do $$
declare c record; t jsonb; r jsonb; e jsonb; novo uuid:=gen_random_uuid();
 tranquilo uuid:='7f2d0002-0000-4000-8000-000000000008'; linhas bigint;
begin
 select count(*) into linhas from cadastro.turno_estado_emocional_catalogo;
 select * into c from acessos_contas_fixture where funcao='administrador' order by metodo, usuario_id limit 1;
 perform public.acessos_claims_fixture(c.usuario_id,c.sid,case when c.metodo='interno' then 'password' else 'oauth' end);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'estado_id',novo,'estado','conversando pouco','ativo',true,'versao_esperada',0,'chave_idempotencia',gen_random_uuid()::text,'digest_idempotencia',repeat('a',43),'auditoria_id',gen_random_uuid());
 t:=public.acessos_assinar_fixture(e,'api.gravar_estado_emocional');
 set local role authenticated; r:=api.estado_emocional_privado(t); reset role;
 if r->>'ok' is distinct from 'true' or r#>>'{dados,versao}' is distinct from '1' or r#>>'{dados,de_fabrica}' is distinct from 'false' then
  raise exception 'ADMIN_NAO_CRIOU_TERMO: %',r;end if;
 -- Termo repetido (outra caixa, com espaços) não cria um segundo termo com o mesmo sentido.
 e:=jsonb_build_object('request_id',gen_random_uuid(),'estado_id',gen_random_uuid(),'estado','  Tranquilo ','ativo',true,'versao_esperada',0,'chave_idempotencia',gen_random_uuid()::text,'digest_idempotencia',repeat('b',43),'auditoria_id',gen_random_uuid());
 t:=public.acessos_assinar_fixture(e,'api.gravar_estado_emocional');
 set local role authenticated; r:=api.estado_emocional_privado(t); reset role;
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'TERMO_DUPLICADO_ACEITO: %',r;end if;
 -- Renomear é update sob `id`: a ficha antiga guarda o rótulo da época e não é reescrita.
 e:=jsonb_build_object('request_id',gen_random_uuid(),'estado_id',tranquilo,'estado','calmo','ativo',true,'versao_esperada',1,'chave_idempotencia',gen_random_uuid()::text,'digest_idempotencia',repeat('e',43),'auditoria_id',gen_random_uuid());
 t:=public.acessos_assinar_fixture(e,'api.gravar_estado_emocional');
 set local role authenticated; r:=api.estado_emocional_privado(t); reset role;
 if r->>'ok' is distinct from 'true' or r#>>'{dados,estado}' is distinct from 'calmo' or r#>>'{dados,versao}' is distinct from '2' then
  raise exception 'ADMIN_NAO_RENOMEOU_TERMO: %',r;end if;
 -- Desativar é ativo=false com bump de versão; a linha permanece.
 e:=jsonb_build_object('request_id',gen_random_uuid(),'estado_id',tranquilo,'estado','calmo','ativo',false,'versao_esperada',2,'chave_idempotencia',gen_random_uuid()::text,'digest_idempotencia',repeat('c',43),'auditoria_id',gen_random_uuid());
 t:=public.acessos_assinar_fixture(e,'api.gravar_estado_emocional');
 set local role authenticated; r:=api.estado_emocional_privado(t); reset role;
 if r->>'ok' is distinct from 'true' or r#>>'{dados,ativo}' is distinct from 'false' or r#>>'{dados,versao}' is distinct from '3' then
  raise exception 'ADMIN_NAO_DESATIVOU_TERMO: %',r;end if;
 if (select count(*) from cadastro.turno_estado_emocional_catalogo) <> linhas+1 then raise exception 'LINHA_APAGADA';end if;
 -- Termo desativado deixa de valer para a ficha, sem apagar registro antigo.
 perform 1 from cadastro.turno_estado_emocional_catalogo x where x.estado='calmo' and x.ativo;
 if found then raise exception 'TERMO_DESATIVADO_AINDA_VALE';end if;
 -- Versão vencida é conflito, não ajuste silencioso.
 t:=public.acessos_assinar_fixture(jsonb_set(e,'{request_id}',to_jsonb(gen_random_uuid())) || jsonb_build_object('chave_idempotencia',gen_random_uuid()::text),'api.gravar_estado_emocional');
 set local role authenticated; r:=api.estado_emocional_privado(t); reset role;
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'VERSAO_VENCIDA_ACEITA: %',r;end if;
 -- Teto de 80: o mesmo da ficha, recusado como entrada inválida antes de tocar a tabela.
 e:=jsonb_build_object('request_id',gen_random_uuid(),'estado_id',gen_random_uuid(),'estado',repeat('z',81),'ativo',true,'versao_esperada',0,'chave_idempotencia',gen_random_uuid()::text,'digest_idempotencia',repeat('f',43),'auditoria_id',gen_random_uuid());
 t:=public.acessos_assinar_fixture(e,'api.gravar_estado_emocional');
 begin
  set local role authenticated; r:=api.estado_emocional_privado(t); reset role;
  raise exception 'TERMO_DE_81_ACEITO: %',r;
 exception when sqlstate '22023' then null; end;
end $$;

-- 6. Provas negativas: quem não é Administrador não administra; família não lê.
do $$
declare c record; t jsonb; r jsonb; e jsonb; antes jsonb; depois jsonb; negados bigint;
begin
 select jsonb_agg(to_jsonb(x) order by x.id) into antes from (select * from cadastro.turno_estado_emocional_catalogo) x;
 for c in select * from acessos_contas_fixture where funcao<>'administrador' loop
  perform public.acessos_claims_fixture(c.usuario_id,c.sid,case when c.metodo='interno' then 'password' else 'oauth' end);
  e:=jsonb_build_object('request_id',gen_random_uuid(),'estado_id',gen_random_uuid(),'estado','termo indevido','ativo',true,'versao_esperada',0,'chave_idempotencia',gen_random_uuid()::text,'digest_idempotencia',repeat('d',43),'auditoria_id',gen_random_uuid());
  t:=public.acessos_assinar_fixture(e,'api.gravar_estado_emocional');
  set local role authenticated; r:=api.estado_emocional_privado(t); reset role;
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'NAO_ADMIN_ADMINISTROU_TERMO: % %',c.funcao,r;end if;
  select count(*) into negados from auditoria.evento where ator_usuario_id=c.usuario_id and acao='api.gravar_estado_emocional' and resultado='negado';
  if negados=0 then raise exception 'TENTATIVA_NAO_AUDITADA: %',c.funcao;end if;
  t:=public.acessos_assinar_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.listar_estado_emocional');
  set local role authenticated; r:=api.estado_emocional_privado(t); reset role;
  if c.funcao='familia' then
   if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'FAMILIA_LEU_CATALOGO_DE_TERMOS';end if;
  elsif r->>'ok' is distinct from 'true' then raise exception 'PROFISSIONAL_NAO_LEU_TERMOS: %',r;end if;
  -- Sessão revogada perde o catálogo imediatamente.
  update identidade.sessao set revogada_em=clock_timestamp(),revogada_por_usuario_id=c.usuario_id,motivo_revogacao_cifrado=public.acessos_envelope_fixture() where session_id=c.sid;
  t:=public.acessos_assinar_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.listar_estado_emocional');
  set local role authenticated; r:=api.estado_emocional_privado(t); reset role;
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'REVOGADO_LEU_TERMOS';end if;
  update identidade.sessao set revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where session_id=c.sid;
 end loop;
 select jsonb_agg(to_jsonb(x) order by x.id) into depois from (select * from cadastro.turno_estado_emocional_catalogo) x;
 if antes is distinct from depois then raise exception 'CATALOGO_ALTERADO_POR_NAO_ADMIN';end if;
end $$;

-- 7. Acesso direto à tabela por `authenticated` continua impossível.
set role authenticated;
do $$ begin
 begin perform 1 from cadastro.turno_estado_emocional_catalogo; raise exception 'TABELA_ESTADO_EMOCIONAL_EXPOSTA';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Concorrência real, Auth externo e integração remota continuam fora do alcance desta prova.
