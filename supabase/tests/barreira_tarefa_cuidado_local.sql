\set ON_ERROR_STOP on
\ir tarefa_rls_local.sql
\ir ../drafts/barreira_tarefa_cuidado_incompleta.sql
create function public.suprimir_auditoria_tarefa_fixture() returns trigger language plpgsql as $$ begin
 if current_setting('fixture.tarefa_suprimir',true)='sim' then return null; end if; return new; end $$;
create trigger tarefa_auditoria_suprimida before insert on auditoria.evento for each row execute function public.suprimir_auditoria_tarefa_fixture();
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; paciente uuid:='40000000-0000-4000-8000-000000000001'; tarefa uuid:=gen_random_uuid(); reserva uuid:=gen_random_uuid(); registro uuid:=gen_random_uuid(); entrada jsonb; resposta jsonb; v integer;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 for v in 0..1 loop
  reserva:=gen_random_uuid(); registro:=gen_random_uuid();
  if operacao.reservar_tarefa_cuidado_privado(ator,v+1,reserva,paciente,tarefa,v)<>'aberta' then raise exception 'RESERVA_FALHOU'; end if;
  entrada:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'tarefa_id',tarefa,'registro_id',registro,'versao_esperada',v,'reserva_id',reserva,'geracao_reserva',v+1,'chave_idempotencia','barreira-tarefa-'||v,'digest_idempotencia',repeat('a',43),'conteudo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),'aad',jsonb_build_object('tabela','cadastro.tarefa_cuidado_versao','paciente_id',paciente,'tarefa_id',tarefa,'registro_id',registro,'versao',v+1,'campo','conteudo','formato',1));
  perform set_config('fixture.tarefa_suprimir','sim',true);
  begin
   perform api.tarefa_cuidado_privado(public.assinar_anamnese_fixture(entrada,'api.gravar_tarefa_cuidado',ator,sessao));
   raise exception 'AUDITORIA_SUPRIMIDA_ACEITA';
  exception when no_data_found then if sqlerrm <> 'AUDITORIA_NAO_INSERIDA' then raise; end if; end;
  if exists(select 1 from cadastro.tarefa_cuidado_versao where id=registro) or (select estado from operacao.reserva_tarefa_cuidado where id=reserva)<>'aberta' then raise exception 'ROLLBACK_FALHOU'; end if;
  perform set_config('fixture.tarefa_suprimir','nao',true);
  resposta:=api.tarefa_cuidado_privado(public.assinar_anamnese_fixture(entrada,'api.gravar_tarefa_cuidado',ator,sessao));
  if resposta->>'ok'<>'true' or (resposta#>>'{dados,versao}')::integer<>v+1 then raise exception 'ESCRITA_FALHOU'; end if;
  if operacao.encerrar_tarefa_cuidado_privado(ator,v+1,reserva,gen_random_uuid())<>'confirmada' then raise exception 'ENCERRAMENTO_FALHOU'; end if;
  begin
   perform api.tarefa_cuidado_privado(public.assinar_anamnese_fixture(entrada,'api.gravar_tarefa_cuidado',ator,sessao));
   raise exception 'TARDIA_ACEITA';
  exception when insufficient_privilege then if sqlerrm<>'RESERVA_INVALIDA' then raise; end if; end;
  update operacao.barreira_tarefa_cuidado set resultado_pendente=null where ator_usuario_id=ator;
 end loop;
 reserva:=gen_random_uuid(); registro:=gen_random_uuid();
 if operacao.reservar_tarefa_cuidado_privado(ator,3,reserva,paciente,tarefa,2)<>'aberta' then raise exception 'RESERVA_TARDIA_FALHOU'; end if;
 entrada:=entrada || jsonb_build_object('request_id',gen_random_uuid(),'registro_id',registro,'versao_esperada',2,'reserva_id',reserva,'geracao_reserva',3,'chave_idempotencia','barreira-tarefa-tardia','aad',jsonb_build_object('tabela','cadastro.tarefa_cuidado_versao','paciente_id',paciente,'tarefa_id',tarefa,'registro_id',registro,'versao',3,'campo','conteudo','formato',1));
 if operacao.encerrar_tarefa_cuidado_privado(ator,3,reserva,gen_random_uuid())<>'cancelada' then raise exception 'CANCELAMENTO_FALHOU'; end if;
 begin
  perform api.tarefa_cuidado_privado(public.assinar_anamnese_fixture(entrada,'api.gravar_tarefa_cuidado',ator,sessao));
  raise exception 'ESCRITA_APOS_CANCELAMENTO_ACEITA';
 exception when insufficient_privilege then if sqlerrm<>'RESERVA_INVALIDA' then raise; end if; end;
 if exists(select 1 from cadastro.tarefa_cuidado_versao where id=registro) then raise exception 'VERSAO_TARDIA_EXISTE'; end if;
end $$;
