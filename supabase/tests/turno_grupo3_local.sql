\set ON_ERROR_STOP on
-- PREPARADO, NÃO EXECUTADO. Fixture sintética; não prova Auth/Vault remoto.
\ir diario_operacoes_local.sql
select set_config('fixture.falhar_auditoria','nao',false);
\ir ../migrations/20261117400000_configuracao_sistema.sql
\ir ../migrations/20261118230000_configuracao_diario.sql
\ir ../migrations/20261125080000_turno_execucao_privada.sql
\ir ../migrations/20261125100000_grant_turno_execucao_teste.sql
\ir ../migrations/20261125130000_turno_consulta_atual.sql
-- Fonte de liderança com formato da migration 20261113100000. Não instala handlers
-- de edição de outra fatia para exercitar apenas este contrato de autorização.
create table cadastro.acompanhamento_caso(id uuid primary key,paciente_id uuid not null references cadastro.paciente(id),versao integer not null,responsavel_usuario_id uuid references public.usuario(id));
alter table cadastro.acompanhamento_caso enable row level security;
revoke all on cadastro.acompanhamento_caso from public,anon,authenticated,service_role;

-- Migrador sem SUPERUSER, herdando somente ownership da fixture descartável.
create role turno_grupo3_migrador_fixture nologin nosuperuser createrole inherit;
grant turno_grupo3_migrador_fixture to current_user with inherit false,set true;
do $$ declare dono text;begin
 for dono in select distinct r.rolname from pg_roles r where r.oid in (
 select relowner from pg_class where relnamespace in ('cadastro'::regnamespace,'identidade'::regnamespace,'auditoria'::regnamespace,'operacao'::regnamespace)
 union select nspowner from pg_namespace where nspname in ('api','cadastro','identidade','operacao','public')
 union select proowner from pg_proc where oid='operacao.turno_operacao_privada(jsonb)'::regprocedure) loop
 execute format('grant %I to turno_grupo3_migrador_fixture with inherit true,set false',dono);end loop;
end $$;
grant ffcmapp_diario_owner,ffcmapp_atestado_verificador_owner to turno_grupo3_migrador_fixture with admin true,inherit false,set false;
create temp table grupo3_members_antes as select * from pg_auth_members;
create temp table grupo3_wrapper_antes as select oid,proowner,proacl,prosecdef,proconfig from pg_proc where oid in ('api.turno_privado(jsonb)'::regprocedure,'api.diario_privado(jsonb)'::regprocedure,'operacao.turno_operacao_privada(jsonb)'::regprocedure);
set role turno_grupo3_migrador_fixture;
do $$ begin if (select rolsuper from pg_roles where rolname=current_user) then raise exception 'MIGRADOR_SUPERUSER';end if;end $$;
\ir ../migrations/20261125140000_turno_escala_passagem.sql
reset role;
do $$ begin
 if exists(select * from grupo3_members_antes except select * from pg_auth_members)
 or exists(select * from pg_auth_members where roleid in (select roleid from grupo3_members_antes) and member in (select member from grupo3_members_antes) except select * from grupo3_members_antes)
 or exists(select * from grupo3_wrapper_antes except select oid,proowner,proacl,prosecdef,proconfig from pg_proc where oid in (select oid from grupo3_wrapper_antes)) then raise exception 'PRIVILEGIO_PREEXISTENTE_ALTERADO';end if;
 if has_table_privilege('authenticated','cadastro.turno_escala_versao','SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated','cadastro.diario_turno_passagem','SELECT,INSERT,UPDATE,DELETE')
 or has_function_privilege('anon','api.turno_grupo3_privado(jsonb)','EXECUTE') or has_function_privilege('service_role','api.turno_grupo3_privado(jsonb)','EXECUTE')
 or pg_has_role('authenticated','ffcmapp_turno_grupo3_owner','MEMBER') then raise exception 'GRANT_GRUPO3_AMPLO';end if;
end $$;
update identidade.configuracao_sistema set valor='true' where chave in ('ffcm.turno.ativo','ffcm.diario.ativo');
update identidade.configuracao_sistema set valor='["Área fictícia"]' where chave='ffcm.diario.areas_sintese';
update identidade.configuracao_sistema set valor='"Área fictícia"' where chave='ffcm.turno.area_passagem';
update identidade.configuracao_sistema set valor='"480"' where chave='ffcm.turno.duracao_padrao_minutos';
update identidade.configuracao_sistema set valor='"15"' where chave='ffcm.turno.tolerancia_atraso_minutos';
update identidade.configuracao_sistema set valor='"sinalizar_pendencia"' where chave='ffcm.turno.tratamento_nao_encerrado';
update public.usuario set perfil='profissional',ativo=true where id='10000000-0000-4000-8000-000000000002';
update identidade.concessao_equipe set perfil='profissional',estado='vinculada',revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id='10000000-0000-4000-8000-000000000002';
update identidade.sessao set encerrada_em=null,revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id='10000000-0000-4000-8000-000000000002';
update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id='10000000-0000-4000-8000-000000000002';
insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado)
 select gen_random_uuid(),'40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',public.envelope_diario_fixture('a') where not exists(select 1 from cadastro.acesso_paciente where paciente_id='40000000-0000-4000-8000-000000000001' and usuario_id='10000000-0000-4000-8000-000000000001');
insert into cadastro.acompanhamento_caso values(gen_random_uuid(),'40000000-0000-4000-8000-000000000001',1,'10000000-0000-4000-8000-000000000001');
-- Auth/request são fornecidos pelo assinador sintético somente na fixture privilegiada.
create function public.grupo3_pedir_fixture(e jsonb,acao text) returns jsonb language plpgsql as $$
declare transporte jsonb;r jsonb;begin
 transporte:=public.assinar_diario_fixture(e,acao,auth_privado.uid(),(auth_privado.jwt()->>'session_id')::uuid);
 set local role authenticated;r:=api.turno_grupo3_privado(transporte);reset role;return r;
end $$;
revoke all on function public.grupo3_pedir_fixture(jsonb,text) from public,anon,authenticated,service_role;

-- Escala: administrador responsável, versões, stale write, motivo e reautorização.
do $$
#variable_conflict use_variable
declare paciente uuid:='40000000-0000-4000-8000-000000000001';escala uuid:=gen_random_uuid();e jsonb;r jsonb;antes integer;
begin
 perform public.claims_diario_fixture('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','oauth');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'escala_id',escala,'profissional_previsto_usuario_id','10000000-0000-4000-8000-000000000002','inicio_previsto','2026-11-18T12:00:00Z','fim_previsto','2026-11-18T20:00:00Z','chave_idempotencia','escala-fixture-criar','digest_idempotencia',repeat('a',43));
 r:=public.grupo3_pedir_fixture(e,'api.criar_escala_turno');if r#>>'{dados,versao}' is distinct from '1' then raise exception 'ESCALA_NAO_CRIADA: %',r;end if;
 r:=public.grupo3_pedir_fixture(e,'api.criar_escala_turno');if r->>'repeticao' is distinct from 'true' then raise exception 'REPLAY_ESCALA_DUPLICOU';end if;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'escala_id',escala,'profissional_assumiu_usuario_id','10000000-0000-4000-8000-000000000002','tipo','substituicao','versao_esperada',1,'motivo',public.envelope_diario_fixture('b'),'aad_motivo',jsonb_build_object('tabela','cadastro.turno_escala_versao','paciente_id',paciente,'escala_id',escala,'versao',2,'campo','motivo','formato',1),'chave_idempotencia','escala-fixture-alterar','digest_idempotencia',repeat('b',43));
 r:=public.grupo3_pedir_fixture(e,'api.alterar_escala_turno');if r#>>'{dados,versao}' is distinct from '2' or (select count(*) from cadastro.turno_escala_versao where escala_id=escala)<>2 then raise exception 'HISTORICO_ESCALA_PERDIDO';end if;
 r:=public.grupo3_pedir_fixture(e||jsonb_build_object('chave_idempotencia','escala-stale-fixture','digest_idempotencia',repeat('c',43)),'api.alterar_escala_turno');if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'STALE_WRITE_ACEITA';end if;
 r:=public.grupo3_pedir_fixture((e-'motivo')||jsonb_build_object('versao_esperada',2,'chave_idempotencia','sem-motivo-fixture'),'api.alterar_escala_turno');if r->>'ok'='true' then raise exception 'SUBSTITUICAO_SEM_MOTIVO_ACEITA';end if;
 insert into cadastro.acompanhamento_caso values(gen_random_uuid(),paciente,2,'10000000-0000-4000-8000-000000000002');
 r:=public.grupo3_pedir_fixture(e,'api.alterar_escala_turno');if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'REPLAY_GESTOR_ANTIGO_ACEITO';end if;
 perform public.claims_diario_fixture('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth');
 r:=public.grupo3_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente),'api.consultar_escala_turno');if r#>>'{dados,pode_gerir}' is distinct from 'false' or r#>'{dados,profissionais}' is distinct from '[]'::jsonb then raise exception 'PROFISSIONAL_RECEBEU_GESTAO_CATALOGO';end if;
end $$;

-- Publicação filha + vínculo são atômicos; assinatura/AAD são sintéticos, conteúdo fictício.
create temp table grupo3_estado_fixture(turno_id uuid,registro_id uuid,diario_id uuid,turno_seguinte uuid);
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002';sessao uuid:='20000000-0000-4000-8000-000000000002';paciente uuid:='40000000-0000-4000-8000-000000000001';
 turno uuid:=gen_random_uuid();diario uuid:=gen_random_uuid();registro uuid:=gen_random_uuid();req uuid:=gen_random_uuid();e jsonb;de jsonb;filho jsonb;r jsonb;antes integer;
begin
 perform public.claims_diario_fixture(ator,sessao,'oauth');
 insert into cadastro.turno(id,paciente_id,profissional_usuario_id,parametros) values(turno,paciente,ator,jsonb_build_object('duracao_padrao_minutos',480,'tolerancia_atraso_minutos',15,'tratamento_nao_encerrado','sinalizar_pendencia'));
 de:=jsonb_build_object('request_id',req,'paciente_id',paciente,'diario_registro_id',diario,'registro_id',registro,'versao_esperada',0,'tipo','evolucao_profissional','estado','publicado','audiencia','equipe','atencao',false,'retorno_solicitado',false,'origem_conteudo','texto','area','Área fictícia','aconteceu_em','2026-11-18','chave_idempotencia','passagem-fixture','digest_idempotencia',repeat('d',43),'conteudo',public.envelope_diario_fixture('e'),'aad',public.aad_diario_fixture(paciente,diario,registro,1,'conteudo'));
 filho:=public.assinar_diario_fixture(de,'api.gravar_diario',ator,sessao);
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'turno_id',turno,'versao_esperada',0,'diario',filho,'chave_idempotencia','passagem-fixture','digest_idempotencia',repeat('f',43));
 -- Auditoria filha suprimida/falha não deixa publicação ou vínculo parcial.
 perform set_config('fixture.falhar_auditoria','sim',true);
 begin perform public.grupo3_pedir_fixture(e,'api.publicar_passagem_turno');exception when raise_exception then if sqlerrm<>'FALHA_AUDITORIA_FIXTURE' then raise;end if;end;
 if exists(select 1 from cadastro.diario_turno_passagem where turno_id=turno) or exists(select 1 from cadastro.diario_registro where id=diario) then raise exception 'PUBLICACAO_PARCIAL';end if;
 perform set_config('fixture.falhar_auditoria','nao',true);
 r:=public.grupo3_pedir_fixture(e,'api.publicar_passagem_turno');if r#>>'{dados,registro_id}' is distinct from registro::text then raise exception 'PASSAGEM_NAO_PUBLICADA: %',r;end if;
 r:=public.grupo3_pedir_fixture(e,'api.publicar_passagem_turno');if r->>'repeticao' is distinct from 'true' or (select count(*) from cadastro.diario_registro where id=diario)<>1 then raise exception 'PUBLICACAO_REPLAY_DUPLICOU';end if;
 insert into grupo3_estado_fixture values(turno,registro,diario,null);
end $$;

create function public.grupo3_turno_pedir_fixture(e jsonb,acao text) returns jsonb language plpgsql as $$
declare transporte jsonb;r jsonb;begin
 transporte:=public.assinar_diario_fixture(e,acao,auth_privado.uid(),(auth_privado.jwt()->>'session_id')::uuid);
 set local role authenticated;
 if acao in ('api.abrir_turno','api.encerrar_turno','api.consultar_turno') then r:=api.turno_privado(transporte);else r:=api.turno_barreira_composicao(transporte);end if;
 reset role;return r;
end $$;
revoke all on function public.grupo3_turno_pedir_fixture(jsonb,text) from public,anon,authenticated,service_role;
create function public.grupo3_publicar_fixture(p_turno uuid,p_versao integer,p_chave text) returns jsonb language plpgsql as $$
declare paciente uuid:='40000000-0000-4000-8000-000000000001';req uuid:=gen_random_uuid();diario uuid:=gen_random_uuid();registro uuid:=gen_random_uuid();de jsonb;
begin
 de:=jsonb_build_object('request_id',req,'paciente_id',paciente,'diario_registro_id',diario,'registro_id',registro,'versao_esperada',0,'tipo','evolucao_profissional','estado','publicado','audiencia','equipe','atencao',false,'retorno_solicitado',false,'origem_conteudo','texto','area','Área fictícia','aconteceu_em','2026-11-18','chave_idempotencia',p_chave,'digest_idempotencia',repeat('g',43),'conteudo',public.envelope_diario_fixture('h'),'aad',public.aad_diario_fixture(paciente,diario,registro,1,'conteudo'));
 return public.grupo3_pedir_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente,'turno_id',p_turno,'versao_esperada',p_versao,'chave_idempotencia',p_chave,'digest_idempotencia',repeat('i',43),'diario',public.assinar_diario_fixture(de,'api.gravar_diario',auth_privado.uid(),(auth_privado.jwt()->>'session_id')::uuid)),'api.publicar_passagem_turno');
end $$;
revoke all on function public.grupo3_publicar_fixture(uuid,integer,text) from public,anon,authenticated,service_role;

-- Retificação anterior ao fechamento impede carimbo antigo; publicação explícita
-- versiona vínculo e recupera o turno sem apagar Diário ou histórico da passagem.
do $$
#variable_conflict use_variable
declare paciente uuid:='40000000-0000-4000-8000-000000000001';ator uuid:='10000000-0000-4000-8000-000000000002';
 turno uuid;registro uuid;diario uuid;reserva uuid:=gen_random_uuid();comando uuid:=gen_random_uuid();seguinte uuid:=gen_random_uuid();reserva_seguinte uuid:=gen_random_uuid();
 r jsonb;e jsonb;epoca bigint;anterior timestamptz;
begin
 select turno_id,registro_id,diario_id into turno,registro,diario from grupo3_estado_fixture;
 -- Fixture insere retificação na mesma tabela imutável utilizada pelo Diário real.
 insert into cadastro.diario_registro_versao(id,diario_registro_id,versao,versao_esperada,estado,audiencia,atencao,retorno_solicitado,origem_conteudo,conteudo_cifrado,justificativa_cifrada,criado_por_usuario_id,aconteceu_em,area)
 select gen_random_uuid(),diario,2,1,'retificado',audiencia,atencao,retorno_solicitado,origem_conteudo,conteudo_cifrado,public.envelope_diario_fixture('j'),ator,aconteceu_em,area from cadastro.diario_registro_versao where id=registro;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reservar_turno','epoca',1,'reserva_id',reserva,'paciente_id',paciente,'turno_id',turno,'versao_esperada',1);
 r:=public.grupo3_turno_pedir_fixture(e,'api.reservar_turno');if r#>>'{dados,estado}' is distinct from 'aberta' then raise exception 'RESERVA_ENCERRAMENTO_FALHOU';end if;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'turno_id',turno,'reserva_id',reserva,'geracao_reserva',1,'versao_esperada',1,'sintese_registro_id',registro,'chave_idempotencia','encerrar-fixture','digest_idempotencia',repeat('k',43));
 r:=public.grupo3_turno_pedir_fixture(e,'api.encerrar_turno');if r#>>'{erro,codigo}' is distinct from 'conflito' or (select situacao from cadastro.turno where id=turno)<>'aberto' then raise exception 'SINTESE_RETIFICADA_ENCERROU';end if;
 r:=public.grupo3_publicar_fixture(turno,1,'republicacao-fixture');if r#>>'{dados,versao_passagem}' is distinct from '2' then raise exception 'REPUBLICACAO_NAO_RECUPEROU';end if;
 registro:=(r#>>'{dados,registro_id}')::uuid;
 if (select count(*) from cadastro.diario_turno_passagem where turno_id=turno)<>2 then raise exception 'VINCULO_HISTORICO_PERDIDO';end if;
 r:=public.grupo3_publicar_fixture(turno,1,'republicacao-stale-fixture');if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'VINCULO_STALE_ACEITO';end if;
 e:=e||jsonb_build_object('sintese_registro_id',registro);
 anterior:=clock_timestamp();r:=public.grupo3_turno_pedir_fixture(e,'api.encerrar_turno');
 if not exists(select 1 from operacao.requisicao where ator_usuario_id=ator and operacao='api.encerrar_turno' and chave_idempotencia='encerrar-fixture') or r#>>'{dados,situacao}' is distinct from 'encerrado' or r#>>'{dados,versao}' is distinct from '2' or (r#>>'{dados,encerrado_em}')::timestamptz<anterior then raise exception 'ENCERRAMENTO_NAO_CONFIRMADO: %',r;end if;
 r:=public.grupo3_turno_pedir_fixture(e,'api.encerrar_turno');if r->>'repeticao' is distinct from 'true' or r#>>'{dados,versao}' is distinct from '2' then raise exception 'REPLAY_ENCERRAMENTO_DUPLICOU';end if;
 -- Perda de resposta: a barreira devolve recibo de turno fechado consultável por UUID.
 r:=public.grupo3_turno_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.encerrar_barreira_turno','epoca',1,'reserva_id',reserva,'comando_id',comando),'api.encerrar_barreira_turno');
 if r#>>'{dados,estado}' is distinct from 'confirmada' then raise exception 'FECHAMENTO_BARREIRA_NAO_CONFIRMADO';end if;
 r:=public.grupo3_turno_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.consultar_barreira_turno'),'api.consultar_barreira_turno');
 if r#>>'{dados,resultado_pendente,turno_id}' is distinct from turno::text or r#>>'{dados,resultado_pendente,versao_esperada}' is distinct from '1' then raise exception 'RECIBO_ENCERRAMENTO_PERDIDO';end if;
 r:=public.grupo3_turno_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'turno_id',turno),'api.consultar_turno');if r#>>'{dados,situacao}' is distinct from 'encerrado' then raise exception 'RECUPERACAO_UUID_FECHADO_FALHOU';end if;
 r:=public.grupo3_turno_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'modo','ultimo'),'api.consultar_turno');if r#>>'{dados,turno_id}' is distinct from turno::text then raise exception 'ULTIMO_NAO_RECUPERA_REMETENTE';end if;
 r:=public.grupo3_turno_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente),'api.consultar_turno');if r->'dados' is distinct from 'null'::jsonb then raise exception 'ATUAL_EXPOS_FECHADO';end if;
 perform public.grupo3_turno_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reconhecer_barreira_turno','comando_id',comando),'api.reconhecer_barreira_turno');
 -- Abertura autenticada do próximo turno deriva destinatário, não ID do cliente.
 r:=public.grupo3_turno_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.consultar_barreira_turno'),'api.consultar_barreira_turno');epoca:=(r#>>'{dados,epoca}')::bigint;
 r:=public.grupo3_turno_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reservar_turno','epoca',epoca,'reserva_id',reserva_seguinte,'paciente_id',paciente,'turno_id',seguinte,'versao_esperada',0),'api.reservar_turno');
 r:=public.grupo3_turno_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'turno_id',seguinte,'reserva_id',reserva_seguinte,'geracao_reserva',epoca,'chave_idempotencia','turno-seguinte-fixture','digest_idempotencia',repeat('l',43)),'api.abrir_turno');
 if r#>>'{dados,turno_id}' is distinct from seguinte::text or not exists(select 1 from cadastro.diario_turno_destinatario where turno_destinatario_id=seguinte and turno_origem_id=turno and usuario_id=ator and versao_passagem_origem=2) then raise exception 'DESTINATARIO_NAO_DERIVADO';end if;
 update grupo3_estado_fixture set turno_seguinte=seguinte;
end $$;

-- Consultar e registrar ciência são atos distintos; remetente vê ambos com instante.
do $$
#variable_conflict use_variable
declare paciente uuid:='40000000-0000-4000-8000-000000000001';turno uuid;seguinte uuid;r jsonb;e jsonb;
begin
 select turno_id,turno_seguinte into turno,seguinte from grupo3_estado_fixture;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'turno_id',seguinte);
 r:=public.grupo3_pedir_fixture(e,'api.consultar_passagem_turno');
 if r#>>'{dados,anterior,referencia,turno_aberto_em}' is null or r#>>'{dados,anterior,referencia,turno_encerrado_em}' is null or r#>>'{dados,anterior,referencia,publicado_em}' is null or r#>>'{dados,anterior,referencia,turno_id}' is distinct from turno::text or r#>'{dados,anterior,ciencia}' is distinct from 'null'::jsonb or exists(select 1 from cadastro.diario_ciencia_turno where turno_destinatario_id=seguinte) then raise exception 'CONSULTA_INFERIU_CIENCIA';end if;
 r:=public.grupo3_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'turno_id',turno),'api.consultar_passagem_turno');if r#>>'{dados,recebimento,consultado_em}' is null or r#>'{dados,recebimento,ciencia}' is distinct from 'null'::jsonb then raise exception 'REMETENTE_NAO_DISTINGUE_CONSULTA';end if;
 e:=e||jsonb_build_object('chave_idempotencia','ciencia-fixture','digest_idempotencia',repeat('m',43));
 r:=public.grupo3_pedir_fixture(e,'api.ciencia_passagem_turno');if r#>>'{dados,usuario_id}' is distinct from auth_privado.uid()::text or r#>>'{dados,registrada_em}' is null then raise exception 'CIENCIA_NAO_REGISTRADA';end if;
 r:=public.grupo3_pedir_fixture(e,'api.ciencia_passagem_turno');if r->>'repeticao' is distinct from 'true' or (select count(*) from cadastro.diario_ciencia_turno where turno_destinatario_id=seguinte)<>1 then raise exception 'CIENCIA_DUPLICADA';end if;
 r:=public.grupo3_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'turno_id',turno),'api.consultar_passagem_turno');if r#>>'{dados,recebimento,ciencia,usuario_id}' is distinct from auth_privado.uid()::text then raise exception 'REMETENTE_NAO_VE_CIENCIA';end if;
 r:=public.grupo3_pedir_fixture(e||jsonb_build_object('turno_id',turno,'chave_idempotencia','ciencia-nao-destinatario-fixture'),'api.ciencia_passagem_turno');if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'NAO_DESTINATARIO_REGISTROU_CIENCIA';end if;
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id='10000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado=motivo_concessao_cifrado where paciente_id=paciente and usuario_id=auth_privado.uid();
 r:=public.grupo3_pedir_fixture(e,'api.ciencia_passagem_turno');if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'CIENCIA_REPLAY_REVOGADO_ACEITO';end if;
end $$;
set role authenticated;
do $$ begin
 begin perform 1 from cadastro.diario_turno_passagem;raise exception 'PASSAGEM_DIRETA_EXPOSTA';exception when insufficient_privilege then null;end;
 begin perform 1 from cadastro.diario_ciencia_turno;raise exception 'CIENCIA_DIRETA_EXPOSTA';exception when insufficient_privilege then null;end;
 begin perform api.turno_grupo3_privado('{}');raise exception 'RPC_SEM_ATESTADO_ACEITA';exception when insufficient_privilege then null;end;
end $$;
reset role;
update identidade.configuracao_sistema set valor='false' where chave='ffcm.turno.ativo';

-- Crescimento além de 500 versões permanece consultável por cursor estável.
update identidade.configuracao_sistema set valor='true' where chave='ffcm.turno.ativo';
update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where paciente_id='40000000-0000-4000-8000-000000000001' and usuario_id='10000000-0000-4000-8000-000000000002';
insert into cadastro.turno_escala_versao(escala_id,paciente_id,versao,profissional_previsto_usuario_id,inicio_previsto,fim_previsto,tipo,autor_usuario_id)
 select gen_random_uuid(),'40000000-0000-4000-8000-000000000001',1,'10000000-0000-4000-8000-000000000002','2026-11-18T12:00:00Z'::timestamptz,'2026-11-18T20:00:00Z'::timestamptz,'previsto','10000000-0000-4000-8000-000000000001' from generate_series(1,505);
do $$
declare e jsonb;r jsonb;cursor jsonb;total integer:=0;vistos text[]:='{}';item jsonb;chave text;paginas integer:=0;
begin
 perform public.claims_diario_fixture('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth');
 loop
  e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000001');
  if cursor is not null then e:=e||jsonb_build_object('cursor_escala_id',cursor->>'escala_id','cursor_versao',cursor->'versao');end if;
  r:=public.grupo3_pedir_fixture(e,'api.consultar_escala_turno');
  if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,itens}')>50 then raise exception 'PAGINA_ESCALA_INVALIDA';end if;
  if not exists(select 1 from jsonb_array_elements(r#>'{dados,identidades}') i where i->>'usuario_id'='10000000-0000-4000-8000-000000000001') then raise exception 'AUTOR_ADMIN_SEM_ROTULO_AUTORIZADO';end if;
  for item in select * from jsonb_array_elements(r#>'{dados,itens}') loop
   chave:=(item->>'escala_id')||':'||(item->>'versao');if chave=any(vistos) then raise exception 'CURSOR_DUPLICOU_VERSAO';end if;vistos:=array_append(vistos,chave);total:=total+1;
  end loop;
  cursor:=nullif(r#>'{dados,proximo_cursor}','null'::jsonb);paginas:=paginas+1;exit when cursor is null;
  if paginas>20 then raise exception 'CURSOR_NAO_AVANCOU';end if;
 end loop;
 if total<>(select count(*) from cadastro.turno_escala_versao where paciente_id='40000000-0000-4000-8000-000000000001') or total<=500 then raise exception 'HISTORICO_TRUNCADO';end if;
end $$;
update identidade.configuracao_sistema set valor='false' where chave='ffcm.turno.ativo';

\ir turno_grupo3_concorrencia_local.sql
