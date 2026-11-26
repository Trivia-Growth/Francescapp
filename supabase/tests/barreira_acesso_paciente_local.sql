\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
\ir ../migrations/20261109100000_editar_paciente_privado.sql
\ir ../migrations/20261112050000_conceder_acesso_paciente_privado.sql
\ir ../migrations/20261112060000_revogar_acesso_paciente_privado.sql
\ir ../migrations/20261112070000_owners_acesso_paciente_privado.sql
\ir ../drafts/20261112150000_barreira_acesso_paciente.sql
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000001'; paciente uuid:='40000000-0000-4000-8000-000000000001';
 reserva uuid:=gen_random_uuid(); comando uuid:=gen_random_uuid(); outra uuid:=gen_random_uuid(); estado jsonb;
begin
 if has_function_privilege('authenticated','operacao.reservar_concessao_acesso_profissional_privado(uuid,bigint,uuid,uuid,text,uuid,integer)','execute')
  or has_table_privilege('authenticated','operacao.reserva_concessao_acesso_profissional','select') then raise exception 'ACESSO_DIRETO_INDEVIDO'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator)::text,true);
 if operacao.reservar_concessao_acesso_profissional_privado(ator,1,reserva,paciente)<>'aberta' then raise exception 'RESERVA_FALHOU'; end if;
 if operacao.reservar_concessao_acesso_profissional_privado('10000000-0000-4000-8000-000000000002',1,outra,paciente)<>'negada' then raise exception 'ATOR_FORJADO_ACEITO'; end if;
 if operacao.reservar_concessao_acesso_profissional_privado(ator,1,outra,paciente)<>'bloqueada' then raise exception 'SEGUNDA_RESERVA_ACEITA'; end if;
 estado:=operacao.consultar_barreira_concessao_acesso_profissional_privado(gen_random_uuid());
 if estado#>>'{reserva,id}' <> reserva::text or estado#>>'{reserva,estado}' <> 'aberta' then raise exception 'RECONCILIACAO_FALHOU'; end if;
 if operacao.encerrar_concessao_acesso_profissional_privado(ator,1,reserva,comando)<>'cancelada' then raise exception 'ENCERRAMENTO_FALHOU'; end if;
 if operacao.reservar_concessao_acesso_profissional_privado(ator,1,reserva,paciente)<>'cancelada' then raise exception 'RESERVA_ATRASADA_ACEITA'; end if;
 if operacao.reservar_concessao_acesso_profissional_privado(ator,2,outra,paciente)<>'bloqueada' then raise exception 'RECIBO_NAO_BLOQUEOU'; end if;
 if operacao.reconhecer_barreira_concessao_acesso_profissional_privado(comando,gen_random_uuid())<>'reconhecido' then raise exception 'RECONHECIMENTO_FALHOU'; end if;
 if operacao.reservar_concessao_acesso_profissional_privado(ator,2,outra,paciente)<>'aberta' then raise exception 'REABERTURA_FALHOU'; end if;
end $$;
create function public.suprimir_auditoria_acesso_fixture() returns trigger language plpgsql as $$
begin
 if current_setting('ffcm.fixture_suprimir_auditoria',true)='on' and new.acao in ('api.conceder_acesso_paciente','api.revogar_acesso_paciente') then return null; end if;
 return new;
end $$;
create trigger suprimir_auditoria_acesso_fixture before insert on auditoria.evento for each row execute function public.suprimir_auditoria_acesso_fixture();
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000001'; sessao uuid:='20000000-0000-4000-8000-000000000001';
 profissional uuid:='10000000-0000-4000-8000-000000000002'; sessao_prof uuid:='20000000-0000-4000-8000-000000000002';
 req uuid; e jsonb; r jsonb; acao text:='api.consultar_barreira_concessao_acesso_profissional';
begin
 if has_function_privilege('authenticated','api.acesso_barreira_composicao(jsonb)','execute') then raise exception 'WRAPPER_EXPOSTO'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 req:=gen_random_uuid(); e:=jsonb_build_object('request_id',req,'operacao',acao);
 r:=api.acesso_barreira_composicao(public.assinar_anamnese_fixture(e,acao,ator,sessao));
 if r->>'ok' is distinct from 'true' or not exists(select 1 from auditoria.evento where request_id=req and ator_usuario_id=ator and resultado='permitido') then raise exception 'CONSULTA_ADMIN_FALHOU: %',r; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',profissional,'session_id',sessao_prof,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 req:=gen_random_uuid(); e:=jsonb_build_object('request_id',req,'operacao',acao);
 r:=api.acesso_barreira_composicao(public.assinar_anamnese_fixture(e,acao,profissional,sessao_prof));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' or not exists(select 1 from auditoria.evento where request_id=req and ator_usuario_id=profissional and resultado='negado') then raise exception 'PROFISSIONAL_ACEITO'; end if;
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 req:=gen_random_uuid(); e:=jsonb_build_object('request_id',req,'operacao',acao);
 r:=api.acesso_barreira_composicao(public.assinar_anamnese_fixture(e,acao,ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' or not exists(select 1 from auditoria.evento where request_id=req and ator_usuario_id=ator and resultado='negado') then raise exception 'SESSAO_ENCERRADA_ACEITA'; end if;
 update identidade.sessao set encerrada_em=null where session_id=sessao;
end $$;
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000001'; sessao uuid:='20000000-0000-4000-8000-000000000001';
 paciente uuid:='40000000-0000-4000-8000-000000000002'; reserva uuid:=gen_random_uuid(); acesso uuid:=gen_random_uuid();
 encerrada uuid:=gen_random_uuid(); tardio uuid:=gen_random_uuid(); comando uuid:=gen_random_uuid(); entrada jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 -- Fixture anterior deixou reserva aberta em época 2; encerra e reconhece para iniciar nova tentativa.
 select reserva_atual into encerrada from operacao.barreira_concessao_acesso_profissional where ator_usuario_id=ator;
 if operacao.encerrar_concessao_acesso_profissional_privado(ator,2,encerrada,comando)<>'cancelada' then raise exception 'PREPARO_ENCERRAMENTO'; end if;
 if operacao.reconhecer_barreira_concessao_acesso_profissional_privado(comando,gen_random_uuid())<>'reconhecido' then raise exception 'PREPARO_RECONHECIMENTO'; end if;
 if operacao.reservar_concessao_acesso_profissional_privado(ator,3,reserva,paciente)<>'aberta' then raise exception 'RESERVA'; end if;
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'acesso_id',acesso,'usuario_id','10000000-0000-4000-8000-000000000002',
  'reserva_id',reserva,'geracao_reserva',3,'auditoria_id',gen_random_uuid(),'chave_idempotencia','acesso-reservado-fixture','digest_idempotencia',repeat('a',43),
  'motivo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)));
 perform set_config('ffcm.fixture_suprimir_auditoria','on',true);
 begin
  perform api.conceder_acesso_paciente_privado(public.assinar_anamnese_fixture(entrada,'api.conceder_acesso_paciente',ator,sessao));
  raise exception 'AUDITORIA_SUPRIMIDA_ACEITA';
 exception when no_data_found then
  if sqlerrm <> 'AUDITORIA_NAO_INSERIDA' then raise; end if;
 end;
 perform set_config('ffcm.fixture_suprimir_auditoria','off',true);
 if exists(select 1 from cadastro.acesso_paciente where id=acesso)
  or exists(select 1 from operacao.requisicao where chave_idempotencia='acesso-reservado-fixture')
  or not exists(select 1 from operacao.reserva_concessao_acesso_profissional where id=reserva and estado='aberta') then raise exception 'ROLLBACK_SUPRESSAO_INCOMPLETO'; end if;
 entrada:=jsonb_set(entrada,'{auditoria_id}',to_jsonb((select id from auditoria.evento limit 1)));
 begin
  perform api.conceder_acesso_paciente_privado(public.assinar_anamnese_fixture(entrada,'api.conceder_acesso_paciente',ator,sessao));
  raise exception 'AUDITORIA_DUPLICADA_ACEITA';
 exception when unique_violation then null;
 end;
 if exists(select 1 from cadastro.acesso_paciente where id=acesso)
  or exists(select 1 from operacao.requisicao where chave_idempotencia='acesso-reservado-fixture')
  or not exists(select 1 from operacao.reserva_concessao_acesso_profissional where id=reserva and estado='aberta') then raise exception 'ROLLBACK_INCOMPLETO'; end if;
 entrada:=jsonb_set(entrada,'{auditoria_id}',to_jsonb(gen_random_uuid()));
 r:=api.conceder_acesso_paciente_privado(public.assinar_anamnese_fixture(entrada,'api.conceder_acesso_paciente',ator,sessao));
 if r->>'ok' is distinct from 'true' or not exists(select 1 from cadastro.acesso_paciente where id=acesso)
  or not exists(select 1 from operacao.reserva_concessao_acesso_profissional where id=reserva and estado='confirmada' and acesso_resultado_id=acesso) then raise exception 'CONFIRMACAO_INCOMPLETA: %',r; end if;
 r:=api.conceder_acesso_paciente_privado(public.assinar_anamnese_fixture(entrada,'api.conceder_acesso_paciente',ator,sessao));
 if r->>'ok' is distinct from 'true' or (select count(*) from cadastro.acesso_paciente where id=acesso)<>1 then raise exception 'REPLAY_FALHOU'; end if;
 comando:=gen_random_uuid();
 if operacao.encerrar_concessao_acesso_profissional_privado(ator,3,reserva,comando)<>'confirmada' then raise exception 'ENCERRAMENTO_CONFIRMACAO'; end if;
 if operacao.reconhecer_barreira_concessao_acesso_profissional_privado(comando,gen_random_uuid())<>'reconhecido' then raise exception 'RECONHECIMENTO'; end if;
 reserva:=gen_random_uuid(); comando:=gen_random_uuid();
 if operacao.reservar_concessao_acesso_profissional_privado(ator,4,reserva,paciente)<>'aberta' then raise exception 'RESERVA_TARDIA'; end if;
 if operacao.encerrar_concessao_acesso_profissional_privado(ator,4,reserva,comando)<>'cancelada' then raise exception 'CANCELAMENTO'; end if;
 entrada:=entrada || jsonb_build_object('request_id',gen_random_uuid(),'auditoria_id',gen_random_uuid(),'acesso_id',tardio,'reserva_id',reserva,'geracao_reserva',4,'chave_idempotencia','tardio-fixture');
 r:=api.conceder_acesso_paciente_privado(public.assinar_anamnese_fixture(entrada,'api.conceder_acesso_paciente',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'conflito' or exists(select 1 from cadastro.acesso_paciente where id=tardio) then raise exception 'TARDIO_ACEITO: %',r; end if;
end $$;
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000001'; sessao uuid:='20000000-0000-4000-8000-000000000001';
 paciente uuid:='40000000-0000-4000-8000-000000000002'; acesso uuid; reserva uuid:=gen_random_uuid(); comando uuid:=gen_random_uuid();
 entrada jsonb; resultado jsonb; pendente uuid;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 select resultado_pendente into pendente from operacao.barreira_concessao_acesso_profissional where ator_usuario_id=ator;
 if operacao.reconhecer_barreira_concessao_acesso_profissional_privado(pendente,gen_random_uuid())<>'reconhecido' then raise exception 'PREPARO'; end if;
 select id into strict acesso from cadastro.acesso_paciente where paciente_id=paciente and revogada_em is null;
 if operacao.reservar_concessao_acesso_profissional_privado(ator,5,reserva,paciente,'revogar',acesso,1)<>'aberta' then raise exception 'RESERVA_REVOGACAO'; end if;
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'acesso_id',acesso,'reserva_id',reserva,'geracao_reserva',5,
 'auditoria_id',gen_random_uuid(),'chave_idempotencia','revogacao-reservada','digest_idempotencia',repeat('a',43),'versao_esperada',1,
 'motivo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
 'motivo_auditoria',jsonb_build_object('formato',1,'key_id','auditoria','nonce',repeat('b',16),'ciphertext','Yg','tag',repeat('b',22)));
 perform set_config('ffcm.fixture_suprimir_auditoria','on',true);
 begin
  perform api.revogar_acesso_paciente_privado(public.assinar_anamnese_fixture(entrada,'api.revogar_acesso_paciente',ator,sessao));
  raise exception 'REVOGACAO_SEM_AUDITORIA_ACEITA';
 exception when no_data_found then
  if sqlerrm <> 'AUDITORIA_NAO_INSERIDA' then raise; end if;
 end;
 perform set_config('ffcm.fixture_suprimir_auditoria','off',true);
 if not exists(select 1 from cadastro.acesso_paciente where id=acesso and revogada_em is null and versao=1)
  or not exists(select 1 from operacao.reserva_concessao_acesso_profissional where id=reserva and estado='aberta')
  or exists(select 1 from operacao.requisicao where chave_idempotencia='revogacao-reservada') then raise exception 'ROLLBACK_REVOGACAO_INCOMPLETO'; end if;
 resultado:=api.revogar_acesso_paciente_privado(public.assinar_anamnese_fixture(entrada,'api.revogar_acesso_paciente',ator,sessao));
 if resultado->>'ok' is distinct from 'true' or not exists(select 1 from cadastro.acesso_paciente where id=acesso and revogada_em is not null and versao=2)
  or not exists(select 1 from operacao.reserva_concessao_acesso_profissional where id=reserva and estado='confirmada') then raise exception 'REVOGACAO_NAO_CONFIRMADA: %',resultado; end if;
 resultado:=api.revogar_acesso_paciente_privado(public.assinar_anamnese_fixture(entrada,'api.revogar_acesso_paciente',ator,sessao));
 if resultado->>'ok' is distinct from 'true' then raise exception 'REPLAY_REVOGACAO: %',resultado; end if;
 if operacao.encerrar_concessao_acesso_profissional_privado(ator,5,reserva,comando)<>'confirmada' then raise exception 'ENCERRAMENTO_REVOGACAO'; end if;
 resultado:=operacao.consultar_barreira_concessao_acesso_profissional_privado(gen_random_uuid());
 if resultado#>>'{resultado_pendente,acao}'<>'revogar' or resultado#>>'{resultado_pendente,acesso_id}'<>acesso::text or resultado#>>'{resultado_pendente,versao_esperada}'<>'1' then raise exception 'RECIBO_REVOGACAO_INVALIDO: %',resultado; end if;
 if operacao.reconhecer_barreira_concessao_acesso_profissional_privado(comando,gen_random_uuid())<>'reconhecido' then raise exception 'RECONHECIMENTO_REVOGACAO'; end if;
 reserva:=gen_random_uuid(); comando:=gen_random_uuid(); acesso:=gen_random_uuid();
 insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado) values(acesso,paciente,'10000000-0000-4000-8000-000000000002',ator,entrada->'motivo');
 if operacao.reservar_concessao_acesso_profissional_privado(ator,6,reserva,paciente,'revogar',acesso,1)<>'aberta' then raise exception 'RESERVA_TARDIA'; end if;
 if operacao.encerrar_concessao_acesso_profissional_privado(ator,6,reserva,comando)<>'cancelada' then raise exception 'CANCELAMENTO'; end if;
 entrada:=entrada || jsonb_build_object('reserva_id',reserva,'geracao_reserva',6,'acesso_id',acesso,'versao_esperada',1,'request_id',gen_random_uuid(),'auditoria_id',gen_random_uuid(),'chave_idempotencia','revogacao-tardia');
 resultado:=api.revogar_acesso_paciente_privado(public.assinar_anamnese_fixture(entrada,'api.revogar_acesso_paciente',ator,sessao));
 if resultado#>>'{erro,codigo}' is distinct from 'conflito' or not exists(select 1 from cadastro.acesso_paciente where id=acesso and revogada_em is null and versao=1) then raise exception 'REVOGACAO_TARDIA_ACEITA: %',resultado; end if;
end $$;
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000001'; sessao uuid:='20000000-0000-4000-8000-000000000001';
 paciente uuid:='40000000-0000-4000-8000-000000000002'; acesso uuid; pendente uuid; e jsonb; resultado jsonb; reserva uuid:=gen_random_uuid();
 acao text:='api.reservar_concessao_acesso_profissional';
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 select resultado_pendente into pendente from operacao.barreira_concessao_acesso_profissional where ator_usuario_id=ator;
 if operacao.reconhecer_barreira_concessao_acesso_profissional_privado(pendente,gen_random_uuid())<>'reconhecido' then raise exception 'PREPARO'; end if;
 select id into strict acesso from cadastro.acesso_paciente where paciente_id=paciente and revogada_em is not null;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'operacao',acao,'epoca',7,'reserva_id',reserva,'paciente_id',paciente,'acao','revogar','acesso_id',acesso,'versao_esperada',2);
 resultado:=api.acesso_barreira_composicao(public.assinar_anamnese_fixture(e,acao,ator,sessao));
 if resultado#>>'{dados,estado}' is distinct from 'aberta' then raise exception 'COMPOSICAO_REVOGACAO: %',resultado; end if;
end $$;
