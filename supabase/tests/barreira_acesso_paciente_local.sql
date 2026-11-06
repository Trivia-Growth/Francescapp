\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
\ir ../migrations/20261112050000_conceder_acesso_paciente_privado.sql
\ir ../drafts/20261112150000_barreira_acesso_paciente.sql
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000001'; paciente uuid:='40000000-0000-4000-8000-000000000001';
 reserva uuid:=gen_random_uuid(); comando uuid:=gen_random_uuid(); outra uuid:=gen_random_uuid(); estado jsonb;
begin
 if has_function_privilege('authenticated','operacao.reservar_concessao_acesso_profissional_privado(uuid,bigint,uuid,uuid)','execute')
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
 entrada:=jsonb_set(entrada,'{auditoria_id}',to_jsonb((select id from auditoria.evento limit 1)));
 begin
  perform operacao.conceder_acesso_paciente_privado(public.assinar_anamnese_fixture(entrada,'api.conceder_acesso_paciente',ator,sessao));
  raise exception 'AUDITORIA_DUPLICADA_ACEITA';
 exception when unique_violation then null;
 end;
 if exists(select 1 from cadastro.acesso_paciente where id=acesso)
  or exists(select 1 from operacao.requisicao where chave_idempotencia='acesso-reservado-fixture')
  or not exists(select 1 from operacao.reserva_concessao_acesso_profissional where id=reserva and estado='aberta') then raise exception 'ROLLBACK_INCOMPLETO'; end if;
 entrada:=jsonb_set(entrada,'{auditoria_id}',to_jsonb(gen_random_uuid()));
 r:=operacao.conceder_acesso_paciente_privado(public.assinar_anamnese_fixture(entrada,'api.conceder_acesso_paciente',ator,sessao));
 if r->>'ok' is distinct from 'true' or not exists(select 1 from cadastro.acesso_paciente where id=acesso)
  or not exists(select 1 from operacao.reserva_concessao_acesso_profissional where id=reserva and estado='confirmada' and acesso_resultado_id=acesso) then raise exception 'CONFIRMACAO_INCOMPLETA: %',r; end if;
 r:=operacao.conceder_acesso_paciente_privado(public.assinar_anamnese_fixture(entrada,'api.conceder_acesso_paciente',ator,sessao));
 if r->>'ok' is distinct from 'true' or (select count(*) from cadastro.acesso_paciente where id=acesso)<>1 then raise exception 'REPLAY_FALHOU'; end if;
 comando:=gen_random_uuid();
 if operacao.encerrar_concessao_acesso_profissional_privado(ator,3,reserva,comando)<>'confirmada' then raise exception 'ENCERRAMENTO_CONFIRMACAO'; end if;
 if operacao.reconhecer_barreira_concessao_acesso_profissional_privado(comando,gen_random_uuid())<>'reconhecido' then raise exception 'RECONHECIMENTO'; end if;
 reserva:=gen_random_uuid(); comando:=gen_random_uuid();
 if operacao.reservar_concessao_acesso_profissional_privado(ator,4,reserva,paciente)<>'aberta' then raise exception 'RESERVA_TARDIA'; end if;
 if operacao.encerrar_concessao_acesso_profissional_privado(ator,4,reserva,comando)<>'cancelada' then raise exception 'CANCELAMENTO'; end if;
 entrada:=entrada || jsonb_build_object('request_id',gen_random_uuid(),'auditoria_id',gen_random_uuid(),'acesso_id',tardio,'reserva_id',reserva,'geracao_reserva',4,'chave_idempotencia','tardio-fixture');
 r:=operacao.conceder_acesso_paciente_privado(public.assinar_anamnese_fixture(entrada,'api.conceder_acesso_paciente',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'conflito' or exists(select 1 from cadastro.acesso_paciente where id=tardio) then raise exception 'TARDIO_ACEITO: %',r; end if;
end $$;
