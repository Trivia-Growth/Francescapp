\set ON_ERROR_STOP on
-- Ficha de plantão (FR-073/074/075/076/077/081). PREPARADO para banco descartável local.
-- Auth, Vault e assinador são sintéticos; nenhum dado real, nenhuma ativação remota.
\ir turno_execucao_clinica_local.sql

-- Sessão e vínculo sintéticos restaurados; nada além do que a fixture já criou.
update identidade.sessao set encerrada_em=null,revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id in(select usuario_id from acessos_contas_fixture);
update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null,execucao_medicacao_concedida=true where usuario_id in(select usuario_id from acessos_contas_fixture);
update identidade.configuracao_sistema set valor='true' where chave='ffcm.turno.ativo';

create temp table ficha_acl_antes as select oid,proowner,proconfig,prosecdef,prosrc from pg_proc where oid in('operacao.execucao_turno_privada(jsonb)'::regprocedure,'api.turno_execucao(jsonb)'::regprocedure,'operacao.autorizar_execucao_turno(jsonb,text[])'::regprocedure);
create temp table ficha_members_antes as select * from pg_auth_members;
set role turno_core_migrador_fixture;
\ir ../migrations/20261127200000_ficha_plantao.sql
reset role;
do $$begin
 -- O caminho canônico do turno não é reescrito por esta fatia: dono, corpo, SECURITY e
 -- search_path intactos. A única mudança de ACL admitida é o EXECUTE concedido ao owner da
 -- ficha; `authenticated` continua com o que já tinha e ninguém mais entra.
 if exists(select * from ficha_acl_antes except select oid,proowner,proconfig,prosecdef,prosrc from pg_proc) then raise exception 'CAMINHO_CANONICO_ALTERADO';end if;
 if not has_function_privilege('authenticated','api.turno_execucao(jsonb)','EXECUTE')
  or has_function_privilege('anon','api.turno_execucao(jsonb)','EXECUTE') or has_function_privilege('service_role','api.turno_execucao(jsonb)','EXECUTE')
  or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='api.turno_execucao(jsonb)'::regprocedure
    and (a.grantee not in (p.proowner,'authenticated'::regrole,'ffcmapp_ficha_plantao_owner'::regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable)) then raise exception 'ACL_CANONICA_AMPLIADA';end if;
 -- A única membership nova admitida é a do papel criado por esta fatia para o seu criador,
 -- que o PostgreSQL concede ao `create role`. Nenhuma outra é alterada, e o papel novo não
 -- é membro de nada nem tem papel de aplicação como membro.
 if exists(select * from ficha_members_antes except select * from pg_auth_members) then raise exception 'MEMBERSHIPS_REMOVIDAS';end if;
 if exists(select * from pg_auth_members m where m.roleid<>'ffcmapp_ficha_plantao_owner'::regrole
   except select * from ficha_members_antes) then raise exception 'MEMBERSHIPS_NAO_RESTAURADAS';end if;
 if exists(select 1 from pg_auth_members where member='ffcmapp_ficha_plantao_owner'::regrole)
  or exists(select 1 from pg_auth_members where roleid='ffcmapp_ficha_plantao_owner'::regrole and member in('anon'::regrole,'authenticated'::regrole,'service_role'::regrole)) then raise exception 'MEMBERSHIP_DO_OWNER_AMPLIADA';end if;
end $$;

-- Estrutura: RLS forçada, sem grant para papel de aplicação, sem UPDATE/DELETE nas versionadas.
do $$ declare tabela text;papel text; begin
 foreach tabela in array array['cadastro.turno_plantao_versao','cadastro.turno_plantao_pendencia_versao','cadastro.ficha_plantao_rascunho','operacao.ficha_plantao_recibo','cadastro.turno_periodo_catalogo','cadastro.turno_estado_emocional_catalogo'] loop
  if not exists(select 1 from pg_class where oid=tabela::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'RLS_AUSENTE: %',tabela;end if;
  foreach papel in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(papel,tabela,'SELECT') or has_table_privilege(papel,tabela,'INSERT') or has_table_privilege(papel,tabela,'UPDATE') or has_table_privilege(papel,tabela,'DELETE') then raise exception 'GRANT_DIRETO: % %',papel,tabela;end if;
  end loop;
 end loop;
 foreach tabela in array array['cadastro.turno_plantao_versao','cadastro.turno_plantao_pendencia_versao'] loop
  if has_table_privilege('ffcmapp_ficha_plantao_owner',tabela,'UPDATE') or has_table_privilege('ffcmapp_ficha_plantao_owner',tabela,'DELETE') then raise exception 'VERSIONADA_MUTAVEL: %',tabela;end if;
 end loop;
 -- D6: nenhum owner que não seja o desta fatia alcança o rascunho, em nenhuma superfície.
 for papel in select rolname from pg_roles where rolname like 'ffcmapp_%' and rolname<>'ffcmapp_ficha_plantao_owner' loop
  if has_table_privilege(papel,'cadastro.ficha_plantao_rascunho','SELECT') or has_table_privilege(papel,'cadastro.ficha_plantao_rascunho','INSERT')
   or has_table_privilege(papel,'cadastro.ficha_plantao_rascunho','UPDATE') or has_table_privilege(papel,'cadastro.ficha_plantao_rascunho','DELETE') then raise exception 'RASCUNHO_EXPOSTO_A_OUTRO_OWNER: %',papel;end if;
 end loop;
 -- FR-081/FR-064: nenhuma coluna de valor, nota, escala, gravidade, risco ou alerta.
 if exists(select 1 from information_schema.columns where table_schema='cadastro' and table_name in('turno_plantao_versao','turno_plantao_pendencia_versao','ficha_plantao_rascunho')
  and (column_name in('valor','pontuacao','score','gravidade','risco','alerta','tendencia','nivel') or data_type in('numeric','integer','bigint','double precision') and column_name not in('versao','anterior'))) then raise exception 'COLUNA_DE_DERIVACAO_CLINICA';end if;
 if exists(select 1 from pg_proc where pronamespace='operacao'::regnamespace and proname like 'ficha_plantao%' and (prosrc ilike '%gravidade%' or prosrc ilike '%alerta%' or prosrc ilike '%tendencia%' or prosrc ilike '%pontuacao%')) then raise exception 'DERIVACAO_CLINICA_NO_CODIGO';end if;
 -- FR-079/D4: o enum de perfil permanece intocado por esta fatia.
 if not exists(select 1 from pg_constraint where conrelid='public.usuario'::regclass and contype='c' and pg_get_constraintdef(oid) like '%administrador%' and pg_get_constraintdef(oid) like '%familia%') then raise exception 'ENUM_PERFIL_ALTERADO';end if;
end $$;

-- ACL exata do wrapper, no molde de supabase/tests/turno_grant_local.sql.
do $$begin
 if has_function_privilege('authenticated','api.ficha_plantao_privado(jsonb)','EXECUTE') then raise exception 'ACL_INICIAL_JA_ABERTA';end if;
end $$;
set role turno_core_migrador_fixture;
\ir ../migrations/20261127290000_grant_ficha_plantao_teste.sql
reset role;
do $$ declare assinatura text:='api.ficha_plantao_privado(jsonb)';begin
 if not has_function_privilege('authenticated',to_regprocedure(assinatura),'EXECUTE')
  or has_function_privilege('anon',to_regprocedure(assinatura),'EXECUTE')
  or has_function_privilege('service_role',to_regprocedure(assinatura),'EXECUTE')
  or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=to_regprocedure(assinatura) and (a.grantee not in (p.proowner,'authenticated'::regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable)) then raise exception 'ACL_GRANT_INEXATA';end if;
 if pg_has_role('authenticated','ffcmapp_ficha_plantao_owner','MEMBER') or has_function_privilege('authenticated','operacao.ficha_plantao_operacao_privada(jsonb)','EXECUTE') then raise exception 'CAMINHO_PRIVILEGIADO_EXPOSTO';end if;
end $$;

create function public.ficha_pedir_fixture(e jsonb,acao text) returns jsonb language plpgsql as $$
declare t jsonb;r jsonb;begin t:=public.acessos_assinar_fixture(e,acao);set local role authenticated;r:=api.ficha_plantao_privado(t);reset role;return r;end $$;
create function public.ficha_aad_fixture(registro uuid,tabela text,campo text) returns jsonb language sql as $$
 select jsonb_build_object('tabela',tabela,'registro_id',registro,'campo',campo,'formato',1)$$;
revoke all on function public.ficha_pedir_fixture(jsonb,text),public.ficha_aad_fixture(uuid,text,text) from public,anon,authenticated,service_role;

create temp table ficha_estado(ficha uuid,linha uuid,pendencia uuid,pendencia_linha uuid,medida uuid,refeicao uuid,req uuid,outro_profissional uuid,outro_sid uuid);
insert into ficha_estado select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),c.usuario_id,c.sid from acessos_contas_fixture c where c.funcao='profissional' and c.metodo='google_workspace';
-- Termo fictício no catálogo administrado: o vocabulário real é regra de negócio da cliente.
insert into cadastro.turno_estado_emocional_catalogo(estado) values('estado fictício');
do $$begin if (select count(*) from ficha_estado)<>1 or (select outro_profissional from ficha_estado) is null then raise exception 'FIXTURE_SEM_SEGUNDO_PROFISSIONAL';end if;end $$;

-- 1. Submissão atômica: cada conteúdo na sua tabela canônica, numa só transação.
do $$ declare x turno_core_estado;f ficha_estado;e jsonb;r jsonb;filho jsonb;begin
 select * into x from turno_core_estado;select * into f from ficha_estado;
 perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 filho:=public.acessos_assinar_fixture(public.turno_core_gravacao_fixture('rotina',jsonb_build_object('turno_id',x.turno,'tipo','refeicao','instante_ocorrencia',clock_timestamp()-interval '5 minutes','momento','jantar','aceitacao','parcial','observacao',public.acessos_envelope_fixture()),f.refeicao,1,x.paciente)||jsonb_build_object('request_id',f.req),'api.gravar_execucao_turno');
 e:=jsonb_build_object('request_id',f.req,'paciente_id',x.paciente,'turno_id',x.turno,'registro_id',f.ficha,'id',f.linha,'versao',1,'versao_esperada',0,
  'conteudo',jsonb_build_object('periodo','noturno','papel_declarado','Acompanhante terapêutico',
   'atividades',jsonb_build_object('conteudo',public.acessos_envelope_fixture(),'fonte','observacao_direta','visibilidade','compartilhavel'),
   'observacoes',jsonb_build_object('conteudo',public.acessos_envelope_fixture(),'fonte','relato_familiar','visibilidade','interna'),
   'estado_emocional',jsonb_build_object('id',f.medida,'estado','estado fictício','instante_ocorrencia',clock_timestamp()-interval '2 minutes')),
  'aad',jsonb_build_object('atividades',public.ficha_aad_fixture(f.linha,'cadastro.turno_plantao_versao','atividades'),'observacoes',public.ficha_aad_fixture(f.linha,'cadastro.turno_plantao_versao','observacoes')),
  'pendencias',jsonb_build_array(jsonb_build_object('pendencia_id',f.pendencia,'id',f.pendencia_linha,'conteudo',public.acessos_envelope_fixture(),'fonte','observacao_direta','visibilidade','interna','aad',public.ficha_aad_fixture(f.pendencia_linha,'cadastro.turno_plantao_pendencia_versao','conteudo'))),
  'canonicos',jsonb_build_array(filho),
  'chave_idempotencia','ficha-plantao-fixture-0001','digest_idempotencia',repeat('b',43));
 r:=public.ficha_pedir_fixture(e,'api.gravar_ficha_plantao');
 if r->>'ok' is distinct from 'true' or r->>'repeticao' is distinct from 'false' then raise exception 'SUBMISSAO_NEGADA: %',r;end if;
 if r#>>'{dados,ficha,papel_declarado}' is distinct from 'Acompanhante terapêutico' or r#>>'{dados,ficha,periodo}' is distinct from 'noturno' then raise exception 'FICHA_NAO_PROJETADA: %',r;end if;
 if r#>>'{dados,pendencias,0,origem}' is distinct from 'declarada' or r#>>'{dados,pendencias,0,situacao}' is distinct from 'aberta' then raise exception 'PENDENCIA_SEM_ORIGEM: %',r;end if;
 -- Cada campo na sua tabela canônica, sem cópia em outra.
 if not exists(select 1 from cadastro.turno_plantao_versao v where v.registro_id=f.ficha and v.versao=1 and v.turno_id=x.turno and v.autor_usuario_id=x.profissional) then raise exception 'PLANTAO_NAO_GRAVADO';end if;
 if not exists(select 1 from cadastro.turno_medida_versao m where m.registro_id=f.medida and m.tipo='estado_emocional' and m.valor is null and m.qualidade='estado fictício' and m.autor_usuario_id=x.profissional) then raise exception 'ESTADO_EMOCIONAL_NAO_GRAVADO';end if;
 if not exists(select 1 from cadastro.turno_medida_versao m where m.registro_id=f.refeicao and m.tipo='refeicao' and m.momento='jantar') then raise exception 'REFEICAO_NAO_GRAVADA_NO_CANONICO';end if;
 if not exists(select 1 from cadastro.turno_plantao_pendencia_versao p where p.registro_id=f.pendencia and p.versao=1 and p.situacao='aberta' and p.origem='declarada' and p.declarado_por_usuario_id=x.profissional) then raise exception 'PENDENCIA_NAO_GRAVADA';end if;
 if (select periodo from cadastro.turno where id=x.turno) is distinct from 'noturno' then raise exception 'PERIODO_NAO_DECLARADO';end if;
 -- Idempotência: mesmo digest repete sem duplicar; digest diferente é conflito.
 r:=public.ficha_pedir_fixture(e||jsonb_build_object('request_id',gen_random_uuid()),'api.gravar_ficha_plantao');
 if r->>'ok' is distinct from 'true' or r->>'repeticao' is distinct from 'true' then raise exception 'REPLAY_NAO_IDEMPOTENTE: %',r;end if;
 if (select count(*) from cadastro.turno_plantao_versao where registro_id=f.ficha)<>1 then raise exception 'REPLAY_DUPLICOU';end if;
 r:=public.ficha_pedir_fixture(e||jsonb_build_object('request_id',gen_random_uuid(),'digest_idempotencia',repeat('c',43)),'api.gravar_ficha_plantao');
 if r#>>'{erro,codigo}' is distinct from 'conflito_idempotencia' then raise exception 'DIGEST_DIVERGENTE_ACEITO: %',r;end if;
end $$;

-- 2. Falha de uma parte não deixa meia-gravação.
do $$ declare x turno_core_estado;e jsonb;r jsonb;filho jsonb;ficha uuid:=gen_random_uuid();linha uuid:=gen_random_uuid();medida uuid:=gen_random_uuid();antes bigint;antes_medida bigint;req uuid:=gen_random_uuid();begin
 select * into x from turno_core_estado;perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 select count(*) into antes from cadastro.turno_plantao_versao;select count(*) into antes_medida from cadastro.turno_medida_versao;
 -- Refeição sem `momento`: o caminho canônico recusa, e a ficha inteira cai com ela.
 filho:=public.acessos_assinar_fixture(public.turno_core_gravacao_fixture('rotina',jsonb_build_object('turno_id',x.turno,'tipo','refeicao','instante_ocorrencia',clock_timestamp(),'aceitacao','parcial'),gen_random_uuid(),1,x.paciente)||jsonb_build_object('request_id',req),'api.gravar_execucao_turno');
 e:=jsonb_build_object('request_id',req,'paciente_id',x.paciente,'turno_id',x.turno,'registro_id',ficha,'id',linha,'versao',1,'versao_esperada',0,
  'conteudo',jsonb_build_object('estado_emocional',jsonb_build_object('id',medida,'estado','estado fictício','instante_ocorrencia',clock_timestamp()-interval '1 minute')),
  'aad','{}'::jsonb,'canonicos',jsonb_build_array(filho),'chave_idempotencia','ficha-plantao-fixture-0002','digest_idempotencia',repeat('d',43));
 r:=public.ficha_pedir_fixture(e,'api.gravar_ficha_plantao');
 if r->>'ok' is distinct from 'false' then raise exception 'MEIA_FICHA_ACEITA: %',r;end if;
 if (select count(*) from cadastro.turno_plantao_versao)<>antes or (select count(*) from cadastro.turno_medida_versao)<>antes_medida then raise exception 'MEIA_GRAVACAO_PERSISTIDA';end if;
 if exists(select 1 from cadastro.turno_plantao_versao where registro_id=ficha) or exists(select 1 from cadastro.turno_execucao_registro where id=medida) then raise exception 'LINHA_ORFA_DA_FICHA';end if;
 if exists(select 1 from operacao.ficha_plantao_recibo where chave='ficha-plantao-fixture-0002') then raise exception 'RECIBO_DE_FALHA_PERSISTIDO';end if;
end $$;

-- 3. Ficha sem turno aberto é recusada; nenhum segundo caminho de escrita clínica existe.
do $$ declare x turno_core_estado;e jsonb;r jsonb;begin
 select * into x from turno_core_estado;perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'turno_id',gen_random_uuid(),'registro_id',gen_random_uuid(),'id',gen_random_uuid(),'versao',1,'versao_esperada',0,
  'conteudo','{}'::jsonb,'aad','{}'::jsonb,'chave_idempotencia','ficha-plantao-fixture-0003','digest_idempotencia',repeat('e',43));
 r:=public.ficha_pedir_fixture(e,'api.gravar_ficha_plantao');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'FICHA_SEM_TURNO_ACEITA: %',r;end if;
end $$;

-- 4. Abertura retroativa declarada: os dois instantes lado a lado, com teto na tolerância.
do $$ declare x turno_core_estado;e jsonb;r jsonb;aberto timestamptz;ficha uuid:=gen_random_uuid();begin
 select * into x from turno_core_estado;perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 select aberto_em into aberto from cadastro.turno where id=x.turno;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'turno_id',x.turno,'registro_id',ficha,'id',gen_random_uuid(),'versao',1,'versao_esperada',0,
  'conteudo',jsonb_build_object('janela_declarada',jsonb_build_object('inicio',aberto-interval '600 minutes','fim',clock_timestamp())),
  'aad','{}'::jsonb,'chave_idempotencia','ficha-plantao-fixture-0004','digest_idempotencia',repeat('f',43));
 -- Tolerância administrada da fixture é 15 minutos: 600 minutos estouram o teto.
 r:=public.ficha_pedir_fixture(e,'api.gravar_ficha_plantao');
 if r#>>'{erro,codigo}' is distinct from 'entrada_invalida' then raise exception 'RETROATIVA_ACIMA_DO_TETO_ACEITA: %',r;end if;
 if (select janela_declarada_inicio from cadastro.turno where id=x.turno) is not null then raise exception 'JANELA_GRAVADA_APOS_RECUSA';end if;
 e:=jsonb_set(e,'{conteudo,janela_declarada,inicio}',to_jsonb(aberto-interval '10 minutes'))||jsonb_build_object('request_id',gen_random_uuid(),'chave_idempotencia','ficha-plantao-fixture-0005');
 r:=public.ficha_pedir_fixture(e,'api.gravar_ficha_plantao');
 if r->>'ok' is distinct from 'true' then raise exception 'RETROATIVA_DENTRO_DO_TETO_NEGADA: %',r;end if;
 if (select aberto_em from cadastro.turno where id=x.turno) is distinct from aberto then raise exception 'INSTANTE_DO_SERVIDOR_SUBSTITUIDO';end if;
 if (select janela_declarada_inicio from cadastro.turno where id=x.turno) is distinct from aberto-interval '10 minutes'
  or (select janela_declarada_por_usuario_id from cadastro.turno where id=x.turno) is distinct from x.profissional then raise exception 'JANELA_DECLARADA_NAO_PRESERVADA';end if;
 if r#>>'{dados,ficha,retroativo}' is distinct from 'true' then raise exception 'RETROATIVO_NAO_VISIVEL: %',r;end if;
end $$;

-- 5. Rascunho: só o autor lê, e a publicação o remove na mesma transação.
do $$ declare x turno_core_estado;f ficha_estado;e jsonb;r jsonb;rascunho uuid:=gen_random_uuid();ficha uuid:=gen_random_uuid();visiveis bigint;begin
 select * into x from turno_core_estado;select * into f from ficha_estado;
 perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'turno_id',x.turno,'id',rascunho,'conteudo',public.acessos_envelope_fixture(),'aad',jsonb_build_object('conteudo',public.ficha_aad_fixture(rascunho,'cadastro.ficha_plantao_rascunho','conteudo')));
 r:=public.ficha_pedir_fixture(e,'api.salvar_rascunho_ficha_plantao');
 if r->>'ok' is distinct from 'true' or r#>>'{dados,rascunho,rascunho_id}' is distinct from rascunho::text then raise exception 'RASCUNHO_NAO_SALVO: %',r;end if;
 r:=public.ficha_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'turno_id',x.turno),'api.consultar_rascunho_ficha_plantao');
 if r#>>'{dados,rascunho,rascunho_id}' is distinct from rascunho::text then raise exception 'RASCUNHO_NAO_RECUPERADO: %',r;end if;
 -- Terceiro com vínculo vivo no caso não alcança o rascunho nem pela wrapper nem pela tabela.
 perform public.acessos_claims_fixture(f.outro_profissional,f.outro_sid,'oauth');
 r:=public.ficha_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'turno_id',x.turno),'api.consultar_rascunho_ficha_plantao');
 if r->>'ok' is distinct from 'false' then raise exception 'RASCUNHO_DE_TERCEIRO_LIDO: %',r;end if;
 set local role ffcmapp_ficha_plantao_owner;
 select count(*) into visiveis from cadastro.ficha_plantao_rascunho;
 reset role;
 if visiveis<>0 then raise exception 'RLS_DO_RASCUNHO_NAO_ISOLA: %',visiveis;end if;
 perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 set local role ffcmapp_ficha_plantao_owner;
 select count(*) into visiveis from cadastro.ficha_plantao_rascunho;
 reset role;
 if visiveis<>1 then raise exception 'AUTOR_PERDEU_O_PROPRIO_RASCUNHO: %',visiveis;end if;
 -- Publicação remove o rascunho; falha de publicação o preserva.
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'turno_id',x.turno,'registro_id',ficha,'id',gen_random_uuid(),'versao',1,'versao_esperada',0,
  'conteudo','{}'::jsonb,'aad','{}'::jsonb,'chave_idempotencia','ficha-plantao-fixture-0006','digest_idempotencia',repeat('g',43));
 r:=public.ficha_pedir_fixture(e,'api.gravar_ficha_plantao');
 if r->>'ok' is distinct from 'true' then raise exception 'PUBLICACAO_NEGADA: %',r;end if;
 if exists(select 1 from cadastro.ficha_plantao_rascunho where turno_id=x.turno and autor_usuario_id=x.profissional) then raise exception 'RASCUNHO_SOBREVIVEU_A_PUBLICACAO';end if;
end $$;

-- 6. Pendência escrita: resolução é ato explícito de pessoa identificada, e nada a fecha sozinho.
do $$ declare x turno_core_estado;f ficha_estado;e jsonb;r jsonb;linha uuid:=gen_random_uuid();begin
 select * into x from turno_core_estado;select * into f from ficha_estado;
 perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 -- Consulta, passagem do tempo e turno novo não mudam a situação.
 perform pg_sleep(0.01);
 r:=public.ficha_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'turno_id',x.turno,'registro_id',f.ficha),'api.consultar_ficha_plantao');
 if r#>>'{dados,pendencias,0,situacao}' is distinct from 'aberta' then raise exception 'PENDENCIA_FECHOU_SOZINHA: %',r;end if;
 -- Quem não tem vínculo no caso não resolve.
 perform public.acessos_claims_fixture(x.cm,x.cm_sid,'password');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','44000000-0000-4000-8000-000000000002','registro_id',f.pendencia,'id',linha,'versao_esperada',1,
  'motivo',public.acessos_envelope_fixture(),'aad',jsonb_build_object('motivo',public.ficha_aad_fixture(linha,'cadastro.turno_plantao_pendencia_versao','motivo')),
  'chave_idempotencia','ficha-plantao-fixture-0007','digest_idempotencia',repeat('h',43));
 r:=public.ficha_pedir_fixture(e,'api.resolver_pendencia_plantao');
 if r->>'ok' is distinct from 'false' then raise exception 'RESOLUCAO_SEM_VINCULO_ACEITA: %',r;end if;
 if (select situacao from cadastro.turno_plantao_pendencia_versao where registro_id=f.pendencia and versao=1) is distinct from 'aberta' then raise exception 'PENDENCIA_ALTERADA_POR_NAO_AUTORIZADO';end if;
 -- Resolução por pessoa autorizada preserva texto, fonte e autoria originais.
 perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 e:=e||jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'chave_idempotencia','ficha-plantao-fixture-0008');
 r:=public.ficha_pedir_fixture(e,'api.resolver_pendencia_plantao');
 if r->>'ok' is distinct from 'true' or r#>>'{dados,pendencias,0,situacao}' is distinct from 'resolvida' then raise exception 'RESOLUCAO_NEGADA: %',r;end if;
 if not exists(select 1 from cadastro.turno_plantao_pendencia_versao p2 join cadastro.turno_plantao_pendencia_versao p1 on p1.registro_id=p2.registro_id and p1.versao=1
  where p2.registro_id=f.pendencia and p2.versao=2 and p2.conteudo=p1.conteudo and p2.fonte=p1.fonte and p2.declarado_por_usuario_id=p1.declarado_por_usuario_id
   and p2.resolvido_por_usuario_id=x.profissional and p2.resolvido_em is not null and p2.motivo is not null) then raise exception 'RESOLUCAO_NAO_PRESERVOU_ORIGEM';end if;
end $$;

-- 7. Provas negativas de autorização e de acesso direto ao banco.
do $$ declare x turno_core_estado;f ficha_estado;e jsonb;r jsonb;auditados bigint;req uuid:=gen_random_uuid();begin
 select * into x from turno_core_estado;select * into f from ficha_estado;
 e:=jsonb_build_object('request_id',req,'paciente_id',x.paciente,'turno_id',x.turno,'registro_id',gen_random_uuid(),'id',gen_random_uuid(),'versao',1,'versao_esperada',0,
  'conteudo','{}'::jsonb,'aad','{}'::jsonb,'chave_idempotencia','ficha-plantao-fixture-0009','digest_idempotencia',repeat('i',43));
 -- Perfil familiar, com vínculo vivo no caso: a ficha é do profissional do plantão.
 perform public.acessos_claims_fixture(x.familiar,x.familiar_sid,'password');
 r:=public.ficha_pedir_fixture(e,'api.gravar_ficha_plantao');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'FAMILIAR_GRAVOU_FICHA: %',r;end if;
 r:=public.ficha_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'turno_id',x.turno,'registro_id',f.ficha),'api.consultar_ficha_plantao');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'FAMILIAR_LEU_FICHA: %',r;end if;
 select count(*) into auditados from auditoria.evento where request_id=req and resultado='negado';
 if auditados<1 then raise exception 'TENTATIVA_NEGADA_NAO_AUDITADA';end if;
 -- Profissional de outro caso, sem vínculo.
 perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 r:=public.ficha_pedir_fixture(e||jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','44000000-0000-4000-8000-000000000002','chave_idempotencia','ficha-plantao-fixture-0010'),'api.gravar_ficha_plantao');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'OUTRO_CASO_ACEITO: %',r;end if;
 -- Acesso direto às tabelas como papel da aplicação.
 set local role authenticated;
 begin perform 1 from cadastro.turno_plantao_versao;raise exception 'TABELA_PLANTAO_EXPOSTA'; exception when insufficient_privilege then null;end;
 begin perform 1 from cadastro.ficha_plantao_rascunho;raise exception 'RASCUNHO_EXPOSTO'; exception when insufficient_privilege then null;end;
 begin insert into cadastro.turno_plantao_pendencia_versao(id,registro_id,versao,paciente_id,turno_id,conteudo,fonte,visibilidade,situacao,declarado_por_usuario_id,autor_usuario_id) values(gen_random_uuid(),gen_random_uuid(),1,x.paciente,x.turno,'{}'::jsonb,'documento','interna','aberta',x.profissional,x.profissional);raise exception 'INSERT_DIRETO_ACEITO'; exception when insufficient_privilege then null;end;
 reset role;
end $$;

-- 8. Revogação durante o plantão retira o acesso imediatamente.
do $$ declare x turno_core_estado;e jsonb;r jsonb;begin
 select * into x from turno_core_estado;
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id='11000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado=motivo_concessao_cifrado where paciente_id=x.paciente and usuario_id=x.profissional;
 perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'turno_id',x.turno,'registro_id',gen_random_uuid(),'id',gen_random_uuid(),'versao',1,'versao_esperada',0,
  'conteudo','{}'::jsonb,'aad','{}'::jsonb,'chave_idempotencia','ficha-plantao-fixture-0011','digest_idempotencia',repeat('j',43));
 r:=public.ficha_pedir_fixture(e,'api.gravar_ficha_plantao');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'REVOGADO_GRAVOU: %',r;end if;
 update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where paciente_id=x.paciente and usuario_id=x.profissional;
end $$;

-- 9. Append-only e estado emocional sem valor: o banco recusa por estrutura.
do $$ declare x turno_core_estado;f ficha_estado;begin
 select * into x from turno_core_estado;select * into f from ficha_estado;
 set local role ffcmapp_ficha_plantao_owner;
 begin update cadastro.turno_plantao_versao set papel_declarado='outro' where registro_id=f.ficha;raise exception 'UPDATE_PERMITIDO'; exception when insufficient_privilege then null;end;
 begin delete from cadastro.turno_plantao_pendencia_versao where registro_id=f.pendencia;raise exception 'DELETE_PERMITIDO'; exception when insufficient_privilege then null;end;
 reset role;
 begin
  update cadastro.turno_plantao_versao set papel_declarado='outro' where registro_id=f.ficha;
  raise exception 'TRIGGER_IMUTAVEL_AUSENTE';
 exception when raise_exception then if sqlerrm<>'REGISTRO_TURNO_IMUTAVEL' then raise;end if;end;
 begin
  insert into cadastro.turno_medida_versao(registro_id,versao,tipo,instante_ocorrencia,qualidade,valor,autor_usuario_id) values(f.medida,2,'estado_emocional',clock_timestamp(),'estado fictício',7,x.profissional);
  raise exception 'ESTADO_EMOCIONAL_COM_VALOR_ACEITO';
 exception when check_violation then null;end;
end $$;

-- 10. Retificação por versão: a ficha não cria segunda linha para o mesmo evento.
do $$ declare x turno_core_estado;f ficha_estado;e jsonb;r jsonb;filho jsonb;req uuid:=gen_random_uuid();ficha uuid:=gen_random_uuid();begin
 select * into x from turno_core_estado;select * into f from ficha_estado;
 perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 filho:=public.acessos_assinar_fixture(public.turno_core_gravacao_fixture('rotina',jsonb_build_object('turno_id',x.turno,'tipo','refeicao','instante_ocorrencia',clock_timestamp()-interval '4 minutes','momento','jantar','aceitacao','total','observacao',public.acessos_envelope_fixture()),f.refeicao,2,x.paciente)||jsonb_build_object('request_id',req),'api.gravar_execucao_turno');
 e:=jsonb_build_object('request_id',req,'paciente_id',x.paciente,'turno_id',x.turno,'registro_id',ficha,'id',gen_random_uuid(),'versao',1,'versao_esperada',0,
  'conteudo','{}'::jsonb,'aad','{}'::jsonb,'canonicos',jsonb_build_array(filho),'chave_idempotencia','ficha-plantao-fixture-0012','digest_idempotencia',repeat('k',43));
 r:=public.ficha_pedir_fixture(e,'api.gravar_ficha_plantao');
 if r->>'ok' is distinct from 'true' then raise exception 'RETIFICACAO_NEGADA: %',r;end if;
 if (select count(*) from cadastro.turno_execucao_registro where id=f.refeicao)<>1 or (select max(versao) from cadastro.turno_medida_versao where registro_id=f.refeicao)<>2 then raise exception 'FICHA_DUPLICOU_REGISTRO_AVULSO';end if;
end $$;

-- 11. Correção da ficha publicada exige motivo e cria versão nova.
do $$ declare x turno_core_estado;f ficha_estado;e jsonb;r jsonb;linha uuid:=gen_random_uuid();begin
 select * into x from turno_core_estado;select * into f from ficha_estado;
 perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'turno_id',x.turno,'registro_id',f.ficha,'id',linha,'versao',2,'versao_esperada',1,
  'conteudo',jsonb_build_object('papel_declarado','Enfermeira'),'aad','{}'::jsonb,'chave_idempotencia','ficha-plantao-fixture-0013','digest_idempotencia',repeat('l',43));
 r:=public.ficha_pedir_fixture(e,'api.gravar_ficha_plantao');
 if r->>'ok' is distinct from 'false' then raise exception 'CORRECAO_SEM_MOTIVO_ACEITA: %',r;end if;
 if (select max(versao) from cadastro.turno_plantao_versao where registro_id=f.ficha)<>1 then raise exception 'CORRECAO_SEM_MOTIVO_GRAVOU';end if;
 e:=e||jsonb_build_object('request_id',gen_random_uuid(),'chave_idempotencia','ficha-plantao-fixture-0014','motivo',public.acessos_envelope_fixture(),
  'aad',jsonb_build_object('motivo',public.ficha_aad_fixture(linha,'cadastro.turno_plantao_versao','motivo')));
 r:=public.ficha_pedir_fixture(e,'api.gravar_ficha_plantao');
 if r->>'ok' is distinct from 'true' or r#>>'{dados,ficha,versao}' is distinct from '2' then raise exception 'CORRECAO_COM_MOTIVO_NEGADA: %',r;end if;
 if not exists(select 1 from cadastro.turno_plantao_versao where registro_id=f.ficha and versao=1 and papel_declarado='Acompanhante terapêutico') then raise exception 'VERSAO_ANTERIOR_PERDIDA';end if;
end $$;

-- Termina com o gate desligado: executar a matriz não declara ativação nem prova Auth real.
update identidade.configuracao_sistema set valor='false' where chave='ffcm.turno.ativo';
\echo FICHA_PLANTAO_LOCAL_OK
