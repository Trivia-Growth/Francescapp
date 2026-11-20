\set ON_ERROR_STOP on
-- Respostas de campo acrescentado ao modelo da ficha (FR-078/FR-081; achado A4).
-- PREPARADO para banco descartável local. Auth, Vault e assinador são sintéticos; nenhum
-- dado real, nenhuma ativação remota, nenhuma migração aplicada fora deste banco.
-- Reusa a matriz já provada da ficha: as fixtures de identidade, turno e envelope são as
-- dela, e a prova aqui é só do que esta passagem acrescenta.
\ir ficha_plantao_local.sql

-- A matriz anterior termina com o gate desligado de propósito; religar aqui não declara
-- ativação nenhuma e o arquivo volta a desligá-lo no fim.
update identidade.configuracao_sistema set valor='true' where chave='ffcm.turno.ativo';

-- A fixture da ficha aplica a cadeia até 20261125190000 (catálogo de campos extras do
-- Plano) e salta a generalização. O modelo da ficha vive no catálogo generalizado, então
-- ela entra aqui, na ordem do nome do arquivo, antes da migração desta passagem.
set role turno_core_migrador_fixture;
\ir ../migrations/20261127100000_campo_extra_catalogo_generalizado.sql
\ir ../migrations/20261127120000_modelo_ficha_plantao_campos_fabrica.sql
reset role;

create temp table respostas_acl_antes as
 select oid,proowner,proacl,proconfig,prosecdef from pg_proc
 where oid in('api.ficha_plantao_privado(jsonb)'::regprocedure,'api.turno_execucao(jsonb)'::regprocedure,'api.plano_cuidado_operacao_privada(jsonb)'::regprocedure,'operacao.campo_extra_plano_operacao_privada(jsonb)'::regprocedure);
create temp table respostas_members_antes as select * from pg_auth_members;
create temp table respostas_catalogo_plano_antes as select * from cadastro.campo_extra_plano_catalogo;

set role turno_core_migrador_fixture;
\ir ../migrations/20261128200000_ficha_plantao_respostas_campos.sql
reset role;

-- 1. A migração não reescreve nenhum caminho vizinho: ACL, owner, SECURITY e search_path
--    dos wrappers continuam idênticos, as memberships não mudam e o catálogo do Plano de
--    cuidado não ganha, perde nem altera linha nenhuma.
do $$begin
 if exists(select * from respostas_acl_antes except select oid,proowner,proacl,proconfig,prosecdef from pg_proc)
  or exists(select oid,proowner,proacl,proconfig,prosecdef from pg_proc where oid in(select oid from respostas_acl_antes) except select * from respostas_acl_antes) then raise exception 'WRAPPER_VIZINHO_ALTERADO';end if;
 if exists(select * from respostas_members_antes except select * from pg_auth_members)
  or exists(select * from pg_auth_members except select * from respostas_members_antes) then raise exception 'MEMBERSHIPS_ALTERADAS';end if;
 if exists(select * from respostas_catalogo_plano_antes except select * from cadastro.campo_extra_plano_catalogo)
  or exists(select * from cadastro.campo_extra_plano_catalogo except select * from respostas_catalogo_plano_antes) then raise exception 'CATALOGO_DO_PLANO_TOCADO';end if;
end $$;

-- 2. ACL exata da tabela nova, no molde de supabase/tests/turno_grant_local.sql: um único
--    concedido, dois privilégios, nada concedível adiante, e nenhum papel de aplicação.
do $$ declare papel text;linha record; begin
 if not exists(select 1 from pg_class where oid='cadastro.turno_plantao_resposta_versao'::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'RLS_AUSENTE';end if;
 foreach papel in array array['anon','authenticated','service_role','public'] loop
  if has_table_privilege(papel,'cadastro.turno_plantao_resposta_versao','SELECT') or has_table_privilege(papel,'cadastro.turno_plantao_resposta_versao','INSERT')
   or has_table_privilege(papel,'cadastro.turno_plantao_resposta_versao','UPDATE') or has_table_privilege(papel,'cadastro.turno_plantao_resposta_versao','DELETE') then raise exception 'GRANT_DIRETO: %',papel;end if;
 end loop;
 for linha in select a.grantee::regrole::text as quem,a.privilege_type as priv,a.is_grantable as adiante
  from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid='cadastro.turno_plantao_resposta_versao'::regclass loop
  if linha.quem not in(select rolname from pg_roles where oid=(select relowner from pg_class where oid='cadastro.turno_plantao_resposta_versao'::regclass))
   and (linha.quem<>'ffcmapp_ficha_plantao_owner' or linha.priv not in('SELECT','INSERT') or linha.adiante) then raise exception 'ACL_INEXATA: % % %',linha.quem,linha.priv,linha.adiante;end if;
 end loop;
 -- Nenhum outro owner da aplicação alcança a resposta: a audiência familiar, os relatórios
 -- e a exportação continuam passando pela projeção autorizada, nunca pela tabela.
 for papel in select rolname from pg_roles where rolname like 'ffcmapp_%' and rolname<>'ffcmapp_ficha_plantao_owner' loop
  if has_table_privilege(papel,'cadastro.turno_plantao_resposta_versao','SELECT') or has_table_privilege(papel,'cadastro.turno_plantao_resposta_versao','INSERT')
   or has_table_privilege(papel,'cadastro.turno_plantao_resposta_versao','UPDATE') or has_table_privilege(papel,'cadastro.turno_plantao_resposta_versao','DELETE') then raise exception 'RESPOSTA_EXPOSTA_A_OUTRO_OWNER: %',papel;end if;
 end loop;
 -- O lock do catálogo é só isso: ler e travar a versão. Nenhuma escrita de modelo.
 if not has_column_privilege('ffcmapp_ficha_plantao_owner','cadastro.campo_extra_plano_catalogo','versao','UPDATE')
  or not has_column_privilege('ffcmapp_ficha_plantao_owner','cadastro.campo_extra_plano_catalogo','ativo','SELECT') then raise exception 'LOCK_DO_CATALOGO_AUSENTE';end if;
 if has_table_privilege('ffcmapp_ficha_plantao_owner','cadastro.campo_extra_plano_catalogo','INSERT')
  or has_table_privilege('ffcmapp_ficha_plantao_owner','cadastro.campo_extra_plano_catalogo','DELETE')
  or has_column_privilege('ffcmapp_ficha_plantao_owner','cadastro.campo_extra_plano_catalogo','nome','UPDATE')
  or has_column_privilege('ffcmapp_ficha_plantao_owner','cadastro.campo_extra_plano_catalogo','ativo','UPDATE')
  or has_column_privilege('ffcmapp_ficha_plantao_owner','cadastro.campo_extra_plano_catalogo','obrigatorio','UPDATE') then raise exception 'CATALOGO_ESCRIVEL_PELA_FICHA';end if;
end $$;

-- 3. Fixture do modelo: dois campos no escopo da ficha, acrescentados pelo Administrador.
create temp table respostas_estado(campo_a uuid,campo_b uuid,ficha uuid,linha uuid,resposta_a uuid,resposta_b uuid,admin uuid);
insert into respostas_estado
 select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),
  (select id from public.usuario where perfil='administrador' and ativo limit 1);
do $$begin if (select admin from respostas_estado) is null then raise exception 'FIXTURE_SEM_ADMINISTRADOR';end if;end $$;
insert into cadastro.campo_extra_plano_catalogo(id,escopo,nome,tipo,opcoes,ativo,ordem,obrigatorio,de_fabrica,visibilidade,versao,criado_por_usuario_id)
 select r.campo_a,'ficha_plantao','Campo fictício A','texto',null::jsonb,true,10,false,false,'interna',1,r.admin from respostas_estado r
 union all
 select r.campo_b,'ficha_plantao','Campo fictício B','texto_longo',null::jsonb,true,20,false,false,'compartilhavel',1,r.admin from respostas_estado r;

create function public.resposta_item_fixture(campo uuid,linha uuid,fonte text,visibilidade text) returns jsonb language sql as $$
 select jsonb_build_object('campo_id',campo,'id',linha,'conteudo',public.acessos_envelope_fixture(),'fonte',fonte,'visibilidade',visibilidade,
  'aad',public.ficha_aad_fixture(linha,'cadastro.turno_plantao_resposta_versao','conteudo'))$$;
revoke all on function public.resposta_item_fixture(uuid,uuid,text,text) from public,anon,authenticated,service_role;

-- 4. Gravação: a resposta vai para a tabela própria, cifrada, com fonte e visibilidade
--    por resposta, e volta na projeção da ficha.
do $$ declare x turno_core_estado;r2 respostas_estado;e jsonb;r jsonb;begin
 select * into x from turno_core_estado;select * into r2 from respostas_estado;
 perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'turno_id',x.turno,'registro_id',r2.ficha,'id',r2.linha,'versao',1,'versao_esperada',0,
  'conteudo',jsonb_build_object('respostas',jsonb_build_array(
    public.resposta_item_fixture(r2.campo_a,r2.resposta_a,'observacao_direta','interna'),
    public.resposta_item_fixture(r2.campo_b,r2.resposta_b,'relato_familiar','compartilhavel'))),
  'campos_extras_catalogo',jsonb_build_object(r2.campo_a::text,1,r2.campo_b::text,1),
  'aad','{}'::jsonb,'chave_idempotencia','ficha-respostas-fixture-0001','digest_idempotencia',repeat('m',43));
 r:=public.ficha_pedir_fixture(e,'api.gravar_ficha_plantao');
 if r->>'ok' is distinct from 'true' then raise exception 'RESPOSTAS_NEGADAS: %',r;end if;
 if (select count(*) from cadastro.turno_plantao_resposta_versao where registro_id=r2.ficha and versao=1)<>2 then raise exception 'RESPOSTAS_NAO_GRAVADAS';end if;
 if not exists(select 1 from cadastro.turno_plantao_resposta_versao where campo_id=r2.campo_a and fonte='observacao_direta' and visibilidade='interna' and campo_versao=1 and autor_usuario_id=x.profissional) then raise exception 'RESPOSTA_SEM_FONTE_OU_AUTOR';end if;
 if not exists(select 1 from cadastro.turno_plantao_resposta_versao where campo_id=r2.campo_b and fonte='relato_familiar' and visibilidade='compartilhavel') then raise exception 'VISIBILIDADE_POR_RESPOSTA_PERDIDA';end if;
 if jsonb_array_length(r#>'{dados,ficha,respostas}')<>2 or r#>>'{dados,ficha,respostas,0,campo_nome}' is distinct from 'Campo fictício A' then raise exception 'RESPOSTA_NAO_PROJETADA: %',r;end if;
end $$;

-- 5. Envelope: AAD de outra tabela ou de outra linha não serve, e fonte fora do conjunto
--    fechado é recusada pelo banco. Nada é gravado em nenhum dos casos.
do $$ declare x turno_core_estado;r2 respostas_estado;e jsonb;r jsonb;base jsonb;ficha uuid:=gen_random_uuid();linha uuid:=gen_random_uuid();alvo uuid:=gen_random_uuid();antes bigint;begin
 select * into x from turno_core_estado;select * into r2 from respostas_estado;
 perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 select count(*) into antes from cadastro.turno_plantao_resposta_versao;
 base:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'turno_id',x.turno,'registro_id',ficha,'id',linha,'versao',1,'versao_esperada',0,
  'campos_extras_catalogo',jsonb_build_object(r2.campo_a::text,1),'aad','{}'::jsonb,'digest_idempotencia',repeat('n',43));
 -- AAD da tabela errada.
 e:=base||jsonb_build_object('chave_idempotencia','ficha-respostas-fixture-0002','conteudo',jsonb_build_object('respostas',jsonb_build_array(
  jsonb_build_object('campo_id',r2.campo_a,'id',alvo,'conteudo',public.acessos_envelope_fixture(),'fonte','observacao_direta','visibilidade','interna',
   'aad',public.ficha_aad_fixture(alvo,'cadastro.turno_plantao_versao','atividades')))));
 r:=public.ficha_pedir_fixture(e,'api.gravar_ficha_plantao');
 if r#>>'{erro,codigo}' is distinct from 'entrada_invalida' then raise exception 'AAD_DE_OUTRA_TABELA_ACEITO: %',r;end if;
 -- AAD de outra linha.
 e:=base||jsonb_build_object('chave_idempotencia','ficha-respostas-fixture-0003','conteudo',jsonb_build_object('respostas',jsonb_build_array(
  jsonb_build_object('campo_id',r2.campo_a,'id',alvo,'conteudo',public.acessos_envelope_fixture(),'fonte','observacao_direta','visibilidade','interna',
   'aad',public.ficha_aad_fixture(gen_random_uuid(),'cadastro.turno_plantao_resposta_versao','conteudo')))));
 r:=public.ficha_pedir_fixture(e,'api.gravar_ficha_plantao');
 if r#>>'{erro,codigo}' is distinct from 'entrada_invalida' then raise exception 'AAD_DE_OUTRA_LINHA_ACEITO: %',r;end if;
 -- Fonte fora do conjunto fechado.
 e:=base||jsonb_build_object('chave_idempotencia','ficha-respostas-fixture-0004','conteudo',jsonb_build_object('respostas',jsonb_build_array(
  public.resposta_item_fixture(r2.campo_a,alvo,'intuicao','interna'))));
 r:=public.ficha_pedir_fixture(e,'api.gravar_ficha_plantao');
 if r#>>'{erro,codigo}' is distinct from 'entrada_invalida' then raise exception 'FONTE_FORA_DO_CONJUNTO_ACEITA: %',r;end if;
 -- Campo fora do retrato revalidado: responder a campo que o cliente não travou é recusado.
 e:=base||jsonb_build_object('chave_idempotencia','ficha-respostas-fixture-0005','conteudo',jsonb_build_object('respostas',jsonb_build_array(
  public.resposta_item_fixture(r2.campo_b,alvo,'observacao_direta','interna'))));
 r:=public.ficha_pedir_fixture(e,'api.gravar_ficha_plantao');
 if r#>>'{erro,codigo}' is distinct from 'entrada_invalida' then raise exception 'CAMPO_FORA_DO_RETRATO_ACEITO: %',r;end if;
 if (select count(*) from cadastro.turno_plantao_resposta_versao)<>antes then raise exception 'RECUSA_DEIXOU_LINHA';end if;
 if exists(select 1 from cadastro.turno_plantao_versao where registro_id=ficha) then raise exception 'RECUSA_DEIXOU_MEIA_FICHA';end if;
end $$;

-- 6. Modelo alterado durante o preenchimento: recusa com `conflito`, nunca ajuste em
--    silêncio, e nenhuma gravação parcial. É a mesma semântica provada no Plano.
do $$ declare x turno_core_estado;r2 respostas_estado;e jsonb;r jsonb;ficha uuid:=gen_random_uuid();linha uuid:=gen_random_uuid();antes bigint;begin
 select * into x from turno_core_estado;select * into r2 from respostas_estado;
 update cadastro.campo_extra_plano_catalogo set nome='Campo fictício A renomeado',versao=versao+1,atualizado_em=clock_timestamp() where id=r2.campo_a;
 perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 select count(*) into antes from cadastro.turno_plantao_resposta_versao;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'turno_id',x.turno,'registro_id',ficha,'id',linha,'versao',1,'versao_esperada',0,
  'conteudo',jsonb_build_object('papel_declarado','Enfermeira','respostas',jsonb_build_array(public.resposta_item_fixture(r2.campo_a,gen_random_uuid(),'observacao_direta','interna'))),
  'campos_extras_catalogo',jsonb_build_object(r2.campo_a::text,1),
  'aad','{}'::jsonb,'chave_idempotencia','ficha-respostas-fixture-0006','digest_idempotencia',repeat('o',43));
 r:=public.ficha_pedir_fixture(e,'api.gravar_ficha_plantao');
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'MODELO_ALTERADO_NAO_GEROU_CONFLITO: %',r;end if;
 if (select count(*) from cadastro.turno_plantao_resposta_versao)<>antes then raise exception 'CONFLITO_DEIXOU_RESPOSTA';end if;
 if exists(select 1 from cadastro.turno_plantao_versao where registro_id=ficha) then raise exception 'CONFLITO_DEIXOU_FICHA';end if;
 -- Com o retrato atualizado, a mesma gravação passa: o conflito é do modelo, não do caminho.
 e:=e||jsonb_build_object('request_id',gen_random_uuid(),'chave_idempotencia','ficha-respostas-fixture-0007','campos_extras_catalogo',jsonb_build_object(r2.campo_a::text,2));
 r:=public.ficha_pedir_fixture(e,'api.gravar_ficha_plantao');
 if r->>'ok' is distinct from 'true' then raise exception 'RETRATO_ATUAL_NEGADO: %',r;end if;
end $$;

-- 7. Campo desativado preserva a resposta antiga, legível e marcada como de campo
--    desativado, e NENHUMA linha de resposta é tocada pela alteração do modelo.
do $$ declare x turno_core_estado;r2 respostas_estado;r jsonb;e jsonb;antes_txid bigint;begin
 select * into x from turno_core_estado;select * into r2 from respostas_estado;
 create temp table respostas_antes on commit drop as
  select id,registro_id,versao,campo_id,campo_versao,conteudo,fonte,visibilidade,autor_usuario_id,registrado_em,xmin::text as versao_fisica
   from cadastro.turno_plantao_resposta_versao;
 update cadastro.campo_extra_plano_catalogo set ativo=false,versao=versao+1,atualizado_em=clock_timestamp() where id=r2.campo_a;
 if exists(select * from respostas_antes except
   select id,registro_id,versao,campo_id,campo_versao,conteudo,fonte,visibilidade,autor_usuario_id,registrado_em,xmin::text
    from cadastro.turno_plantao_resposta_versao)
  or (select count(*) from cadastro.turno_plantao_resposta_versao)<>(select count(*) from respostas_antes) then raise exception 'DESATIVACAO_TOCOU_RESPOSTA';end if;
 perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'turno_id',x.turno,'registro_id',r2.ficha,'atestado',null);
 r:=public.ficha_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'turno_id',x.turno,'registro_id',r2.ficha),'api.consultar_ficha_plantao');
 if r->>'ok' is distinct from 'true' then raise exception 'CONSULTA_NEGADA: %',r;end if;
 if jsonb_array_length(r#>'{dados,ficha,respostas}')<>2 then raise exception 'RESPOSTA_SUMIU_COM_CAMPO_DESATIVADO: %',r;end if;
 if not exists(select 1 from jsonb_array_elements(r#>'{dados,ficha,respostas}') v
   where v->>'campo_id'=r2.campo_a::text and v->>'campo_ativo'='false' and v->>'campo_versao'='1' and jsonb_typeof(v->'conteudo')='object') then raise exception 'RESPOSTA_DE_CAMPO_DESATIVADO_NAO_LEGIVEL: %',r;end if;
 -- Resposta de campo desativado NÃO pode ser regravada: o retrato não valida campo inativo.
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'turno_id',x.turno,'registro_id',gen_random_uuid(),'id',gen_random_uuid(),'versao',1,'versao_esperada',0,
  'conteudo',jsonb_build_object('respostas',jsonb_build_array(public.resposta_item_fixture(r2.campo_a,gen_random_uuid(),'observacao_direta','interna'))),
  'campos_extras_catalogo',jsonb_build_object(r2.campo_a::text,3),
  'aad','{}'::jsonb,'chave_idempotencia','ficha-respostas-fixture-0008','digest_idempotencia',repeat('p',43));
 r:=public.ficha_pedir_fixture(e,'api.gravar_ficha_plantao');
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'CAMPO_DESATIVADO_ACEITOU_RESPOSTA_NOVA: %',r;end if;
end $$;

-- 8. Append-only: a tabela de respostas não aceita UPDATE nem DELETE nem pelo owner da
--    fatia, e a versão 2 da ficha grava resposta nova sem tocar a da versão 1.
do $$ declare x turno_core_estado;r2 respostas_estado;e jsonb;r jsonb;linha2 uuid:=gen_random_uuid();erro text;begin
 select * into x from turno_core_estado;select * into r2 from respostas_estado;
 -- A tentativa roda com o papel mais poderoso do banco de teste: o bloqueio é do TRIGGER,
 -- não só da ausência de grant (que o item 2 já provou). Quem ignora privilégio e RLS
 -- continua sem conseguir reescrever nem apagar resposta gravada.
 begin
  update cadastro.turno_plantao_resposta_versao set fonte='documento' where registro_id=r2.ficha;
  raise exception 'UPDATE_ACEITO';
 exception when others then
  get stacked diagnostics erro=message_text;
  if erro='UPDATE_ACEITO' then raise exception 'RESPOSTA_ACEITOU_UPDATE';end if;
 end;
 begin
  delete from cadastro.turno_plantao_resposta_versao where registro_id=r2.ficha;
  raise exception 'DELETE_ACEITO';
 exception when others then
  get stacked diagnostics erro=message_text;
  if erro='DELETE_ACEITO' then raise exception 'RESPOSTA_ACEITOU_DELETE';end if;
 end;
 if (select count(*) from cadastro.turno_plantao_resposta_versao where registro_id=r2.ficha)<>2 then raise exception 'RESPOSTA_SUMIU';end if;
 perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'turno_id',x.turno,'registro_id',r2.ficha,'id',linha2,'versao',2,'versao_esperada',1,
  'conteudo',jsonb_build_object('respostas',jsonb_build_array(public.resposta_item_fixture(r2.campo_b,gen_random_uuid(),'documento','compartilhavel'))),
  'campos_extras_catalogo',jsonb_build_object(r2.campo_b::text,1),
  'motivo',public.acessos_envelope_fixture(),'aad',jsonb_build_object('motivo',public.ficha_aad_fixture(linha2,'cadastro.turno_plantao_versao','motivo')),
  'chave_idempotencia','ficha-respostas-fixture-0009','digest_idempotencia',repeat('q',43));
 r:=public.ficha_pedir_fixture(e,'api.gravar_ficha_plantao');
 if r->>'ok' is distinct from 'true' or r#>>'{dados,ficha,versao}' is distinct from '2' then raise exception 'VERSAO_2_NEGADA: %',r;end if;
 if (select count(*) from cadastro.turno_plantao_resposta_versao where registro_id=r2.ficha and versao=1)<>2 then raise exception 'VERSAO_1_PERDIDA';end if;
 if (select count(*) from cadastro.turno_plantao_resposta_versao where registro_id=r2.ficha and versao=2)<>1 then raise exception 'VERSAO_2_NAO_GRAVADA';end if;
 -- A projeção segue a versão corrente, e a resposta da versão antiga continua na tabela.
 if jsonb_array_length(r#>'{dados,ficha,respostas}')<>1 then raise exception 'PROJECAO_MISTUROU_VERSOES: %',r;end if;
end $$;

-- 9. Provas negativas de autorização: familiar e profissional de outro caso não gravam
--    resposta nenhuma, e a tentativa é auditada.
do $$ declare x turno_core_estado;r2 respostas_estado;e jsonb;r jsonb;c record;antes bigint;auditados bigint;quantos integer:=0;begin
 select * into x from turno_core_estado;select * into r2 from respostas_estado;
 select count(*) into antes from cadastro.turno_plantao_resposta_versao;
 for c in select usuario_id,sid,funcao from acessos_contas_fixture where funcao in('familia','familiar') or usuario_id=(select outro_profissional from ficha_estado) loop
  perform public.acessos_claims_fixture(c.usuario_id,c.sid,'password');
  e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'turno_id',x.turno,'registro_id',gen_random_uuid(),'id',gen_random_uuid(),'versao',1,'versao_esperada',0,
   'conteudo',jsonb_build_object('respostas',jsonb_build_array(public.resposta_item_fixture(r2.campo_b,gen_random_uuid(),'observacao_direta','interna'))),
   'campos_extras_catalogo',jsonb_build_object(r2.campo_b::text,1),
   'aad','{}'::jsonb,'chave_idempotencia','ficha-respostas-negativa-'||replace(c.usuario_id::text,'-',''),'digest_idempotencia',repeat('r',43));
  select count(*) into auditados from auditoria.evento where ator_usuario_id=c.usuario_id and acao='api.gravar_ficha_plantao' and resultado='negado';
  r:=public.ficha_pedir_fixture(e,'api.gravar_ficha_plantao');
  if r->>'ok' is distinct from 'false' then raise exception 'SEM_VINCULO_GRAVOU: % %',c.funcao,r;end if;
  if (select count(*) from auditoria.evento where ator_usuario_id=c.usuario_id and acao='api.gravar_ficha_plantao' and resultado='negado')<=auditados then raise exception 'TENTATIVA_NAO_AUDITADA: %',c.funcao;end if;
 quantos:=quantos+1;
 end loop;
 if quantos<2 then raise exception 'MATRIZ_NEGATIVA_VAZIA: %',quantos;end if;
 if (select count(*) from cadastro.turno_plantao_resposta_versao)<>antes then raise exception 'NEGADA_DEIXOU_RESPOSTA';end if;
 -- INSERT direto na tabela, por papel de aplicação, continua sendo negado por privilégio.
 begin
  set local role authenticated;
  insert into cadastro.turno_plantao_resposta_versao(id,registro_id,versao,campo_id,campo_versao,paciente_id,turno_id,conteudo,fonte,visibilidade,autor_usuario_id)
   values(gen_random_uuid(),r2.ficha,1,r2.campo_b,1,x.paciente,x.turno,'{}'::jsonb,'documento','interna',x.profissional);
  reset role;raise exception 'INSERT_DIRETO_ACEITO';
 exception when insufficient_privilege then null;
 end;
 reset role;
 if (select count(*) from cadastro.turno_plantao_resposta_versao)<>antes then raise exception 'INSERT_DIRETO_PERSISTIU';end if;
end $$;

-- O gate volta desligado: executar a matriz não declara ativação nem prova Auth real.
update identidade.configuracao_sistema set valor='false' where chave='ffcm.turno.ativo';
\echo FICHA_PLANTAO_RESPOSTAS_LOCAL_OK
