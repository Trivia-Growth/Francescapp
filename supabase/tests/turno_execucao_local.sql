\set ON_ERROR_STOP on
-- EXECUTADO LOCALMENTE em 19/11/2026: runner predecessor EXIT0; Auth/Vault sintéticos.
-- Matriz FR-055/FR-063: profissional+vínculo, outro caso, familiar/admin isolado,
-- revogação de vínculo/sessão/concessão, replay/alteração, acesso direto, auditoria.
-- Concorrência real em duas conexões e Auth real permanecem gates pendentes.
\ir tarefa_rls_local.sql
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
\ir ../migrations/20261117400000_configuracao_sistema.sql
\ir turno_migrador_local.sql
\ir ../migrations/20261125080000_turno_execucao_privada.sql
create function public.suprimir_auditoria_turno_fixture() returns trigger language plpgsql as $$
begin if current_setting('fixture.turno_suprimir',true)='sim' then return null; end if; return new; end $$;
create trigger turno_auditoria_suprimida before insert on auditoria.evento for each row execute function public.suprimir_auditoria_turno_fixture();

do $$
declare papel text;
begin
 foreach papel in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(papel,'cadastro.turno','SELECT,INSERT,UPDATE,DELETE')
   or has_table_privilege(papel,'operacao.reserva_turno','SELECT,INSERT,UPDATE,DELETE')
   or has_function_privilege(papel,'api.turno_privado(jsonb)','EXECUTE')
   or has_function_privilege(papel,'api.turno_barreira_composicao(jsonb)','EXECUTE')
   or has_function_privilege(papel,'api.registrar_negacao_turno(uuid,text,uuid,uuid)','EXECUTE') then raise exception 'ACESSO_DIRETO_EXPOSTO'; end if;
 end loop;
 if not exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid='api.turno_privado(jsonb)'::regprocedure and r.rolname='ffcmapp_turno_owner' and p.prosecdef and not r.rolsuper and not r.rolbypassrls) then raise exception 'OWNER_INSEGURO'; end if;
end $$;

do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; turno uuid:=gen_random_uuid(); reserva uuid:=gen_random_uuid();
 entrada jsonb; resposta jsonb; antes timestamptz:=clock_timestamp(); snapshot jsonb; segundo uuid:=gen_random_uuid();
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 resposta:=api.turno_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'turno_id',turno),'api.consultar_turno',ator,sessao));
 if resposta#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'GATE_RPC_DESLIGADO_IGNORADO'; end if;
 resposta:=api.turno_barreira_composicao(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.consultar_barreira_turno'),'api.consultar_barreira_turno',ator,sessao));
 if resposta#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'GATE_BARREIRA_DESLIGADO_IGNORADO'; end if;
 update identidade.configuracao_sistema set valor='true' where chave='ffcm.turno.ativo';
 resposta:=api.turno_barreira_composicao(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reservar_turno','epoca',1,'reserva_id',reserva,'paciente_id',paciente,'turno_id',turno,'versao_esperada',0),'api.reservar_turno',ator,sessao));
 if resposta#>>'{dados,estado}' is distinct from 'aberta' then raise exception 'RESERVA_FALHOU'; end if;
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'turno_id',turno,'reserva_id',reserva,'geracao_reserva',1,'chave_idempotencia','turno-fixture','digest_idempotencia',repeat('a',43));
 -- Catálogo vazio não abre turno nem confirma recibo ou idempotência.
 resposta:=api.turno_privado(public.assinar_anamnese_fixture(entrada,'api.abrir_turno',ator,sessao));
 if resposta#>>'{erro,codigo}' is distinct from 'conflito' or exists(select 1 from cadastro.turno where id=turno) or exists(select 1 from operacao.requisicao where chave_idempotencia='turno-fixture') then raise exception 'CONFIGURACAO_VAZIA_ACEITA'; end if;
 update identidade.configuracao_sistema set valor='"480"' where chave='ffcm.turno.duracao_padrao_minutos';
 update identidade.configuracao_sistema set valor='"15"' where chave='ffcm.turno.tolerancia_atraso_minutos';
 update identidade.configuracao_sistema set valor='"sinalizar_pendencia"' where chave='ffcm.turno.tratamento_nao_encerrado';
 -- Falha silenciosa de auditoria precisa reverter turno, recibo e idempotência.
 perform set_config('fixture.turno_suprimir','sim',true);
 begin
  perform api.turno_privado(public.assinar_anamnese_fixture(entrada,'api.abrir_turno',ator,sessao));
  raise exception 'AUDITORIA_SUPRIMIDA_ACEITA';
 exception when no_data_found then if sqlerrm<>'AUDITORIA_NAO_INSERIDA' then raise; end if; end;
 if exists(select 1 from cadastro.turno where id=turno) or exists(select 1 from operacao.requisicao where chave_idempotencia='turno-fixture') or (select estado from operacao.reserva_turno where id=reserva)<>'aberta' then raise exception 'ROLLBACK_INCOMPLETO'; end if;
 perform set_config('fixture.turno_suprimir','nao',true);
 resposta:=api.turno_privado(public.assinar_anamnese_fixture(entrada,'api.abrir_turno',ator,sessao));
 if resposta->>'ok' is distinct from 'true' or resposta->>'repeticao' is distinct from 'false' or (resposta#>>'{dados,aberto_em}')::timestamptz<antes or resposta#>>'{dados,profissional_usuario_id}' is distinct from ator::text then raise exception 'ABERTURA_FALHOU'; end if;
 snapshot:=resposta#>'{dados,parametros}';
 resposta:=api.turno_privado(public.assinar_anamnese_fixture(entrada,'api.abrir_turno',ator,sessao));
 if resposta->>'ok' is distinct from 'true' or resposta->>'repeticao' is distinct from 'true' or (select count(*) from cadastro.turno where id=turno)<>1 then raise exception 'REPLAY_DUPLICOU'; end if;
 resposta:=api.turno_privado(public.assinar_anamnese_fixture(entrada||jsonb_build_object('digest_idempotencia',repeat('b',43)),'api.abrir_turno',ator,sessao));
 if resposta#>>'{erro,codigo}' is distinct from 'conflito_idempotencia' then raise exception 'REPLAY_ALTERADO_ACEITO'; end if;
 update identidade.configuracao_sistema set valor='"720"' where chave='ffcm.turno.duracao_padrao_minutos';
 if (select parametros from cadastro.turno where id=turno) is distinct from snapshot then raise exception 'SNAPSHOT_ALTERADO'; end if;
 -- Índice protege mesmo escrita privilegiada que contorna barreira.
 begin
  insert into cadastro.turno(id,paciente_id,profissional_usuario_id,parametros) values(segundo,paciente,ator,snapshot);
  raise exception 'SEGUNDO_TURNO_ACEITO';
 exception when unique_violation then null; end;
 -- Nenhum relógio/autoria do cliente é aceito, mesmo transporte assinado.
 begin
  perform api.turno_privado(public.assinar_anamnese_fixture(entrada||jsonb_build_object('aberto_em','2000-01-01T00:00:00Z'),'api.abrir_turno',ator,sessao));
  raise exception 'RELOGIO_CLIENTE_ACEITO';
 exception when insufficient_privilege then null; end;
 -- Encerramento não pode funcionar antes da prova de síntese de FR-057.
 resposta:=api.turno_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'turno_id',turno,'sintese_registro_id',gen_random_uuid(),'versao_esperada',1),'api.encerrar_turno',ator,sessao));
 if resposta#>>'{erro,codigo}' is distinct from 'conflito' or (select situacao from cadastro.turno where id=turno)<>'aberto' then raise exception 'ENCERRAMENTO_SEM_PROVA_ACEITO'; end if;
 -- Outra pessoa/caso é negado antes de ler o agregado.
 resposta:=api.turno_privado(public.assinar_anamnese_fixture(entrada||jsonb_build_object('paciente_id','40000000-0000-4000-8000-000000000002'),'api.abrir_turno',ator,sessao));
 if resposta#>>'{erro,codigo}' is distinct from 'sem_permissao' or resposta?'dados' then raise exception 'OUTRO_CASO_ACEITO'; end if;
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id='10000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado=motivo_concessao_cifrado where paciente_id=paciente and usuario_id=ator;
 resposta:=api.turno_privado(public.assinar_anamnese_fixture(entrada,'api.abrir_turno',ator,sessao));
 if resposta#>>'{erro,codigo}' is distinct from 'sem_permissao' or resposta?'dados' or not exists(select 1 from cadastro.turno where id=turno and profissional_usuario_id=ator) then raise exception 'REVOGACAO_VINCULO_FALHOU'; end if;
 update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where paciente_id=paciente and usuario_id=ator;
 update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),revogada_por_usuario_id=ator,motivo_revogacao_cifrado=motivo_cifrado where usuario_id=ator;
 resposta:=api.turno_privado(public.assinar_anamnese_fixture(entrada,'api.abrir_turno',ator,sessao));
 if resposta#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'CONCESSAO_REVOGADA_ACEITA'; end if;
 update identidade.concessao_equipe set estado='vinculada',revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=ator;
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 resposta:=api.turno_privado(public.assinar_anamnese_fixture(entrada,'api.abrir_turno',ator,sessao));
 if resposta#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SESSAO_ENCERRADA_ACEITA'; end if;
 update identidade.sessao set encerrada_em=null where session_id=sessao;
 update public.usuario set perfil='familia' where id=ator;
 resposta:=api.turno_privado(public.assinar_anamnese_fixture(entrada,'api.abrir_turno',ator,sessao));
 if resposta#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FAMILIAR_ACEITO'; end if;
 update public.usuario set perfil='administrador' where id=ator;
 resposta:=api.turno_privado(public.assinar_anamnese_fixture(entrada,'api.abrir_turno',ator,sessao));
 if resposta#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'ADMIN_ISOLADO_ACEITO'; end if;
 update public.usuario set perfil='profissional' where id=ator;
 if not exists(select 1 from auditoria.evento where acao='api.abrir_turno' and resultado='negado' and ator_usuario_id=ator) then raise exception 'NEGATIVA_SEM_AUDITORIA'; end if;
end $$;

-- Auth existe, mas não há perfil admitido. Não inventar public.usuario para auditar.
insert into auth.users values('10000000-0000-4000-8000-000000000099');
insert into auth.sessions values('20000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000099',null);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000099","session_id":"20000000-0000-4000-8000-000000000099","amr":[{"method":"password"}]}',false);
do $$
declare acao text; req uuid; e jsonb; r jsonb;
begin
 foreach acao in array array['api.abrir_turno','api.encerrar_turno','api.consultar_turno'] loop
  req:=gen_random_uuid(); e:=jsonb_build_object('request_id',req,'paciente_id',gen_random_uuid(),'turno_id',gen_random_uuid());
  r:=api.turno_privado(public.assinar_anamnese_fixture(e,acao,auth_privado.uid(),(auth_privado.jwt()->>'session_id')::uuid));
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' or not exists(select 1 from auditoria.evento where request_id=req and ator_auth_id=auth_privado.uid() and ator_usuario_id is null and resultado='negado') then raise exception 'AUTH_NAO_ADMITIDO_SEM_NEGATIVA_AUDITADA'; end if;
 end loop;
 if exists(select 1 from public.usuario where id=auth_privado.uid()) then raise exception 'PERFIL_INVENTADO'; end if;
end $$;
\ir turno_concorrencia_local.sql

-- Acesso direto real pelo papel de aplicação, não apenas inspeção de ACL.
set role authenticated;
do $$ begin
 begin perform 1 from cadastro.turno; raise exception 'SELECT_DIRETO_ACEITO'; exception when insufficient_privilege then null; end;
 begin perform api.turno_privado('{}'); raise exception 'RPC_DIRETA_ACEITA'; exception when insufficient_privilege then null; end;
 begin perform api.turno_barreira_composicao('{}'); raise exception 'BARREIRA_DIRETA_ACEITA'; exception when insufficient_privilege then null; end;
end $$;
reset role;

\ir turno_negacao_local.sql
\ir turno_grant_local.sql
