\set ON_ERROR_STOP on
\ir plano_cuidado_operacoes_local.sql
\ir ../migrations/20261107150000_plano_cuidado_historico_privado.sql
grant create on schema api to ffcmapp_plano_owner;
\ir ../migrations/20261107160000_plano_cuidado_reserva_privada.sql
do $$ begin
 if not has_schema_privilege('ffcmapp_plano_owner','api','create') then raise exception 'GRANT_PREEXISTENTE_REMOVIDO'; end if;
end $$;

do $$
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; paciente uuid:='40000000-0000-4000-8000-000000000001'; reserva uuid:=gen_random_uuid(); objetivo uuid:=gen_random_uuid(); registro uuid:=gen_random_uuid(); recibo uuid:=gen_random_uuid(); e jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 if operacao.reservar_plano_privado(ator,1,reserva,paciente)<>'aberta' then raise exception 'RESERVA'; end if;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'objetivo_id',objetivo,'registro_id',registro,'versao_esperada',0,'reserva_id',reserva,'geracao_reserva',1,'chave_idempotencia','reserva-plano','digest_idempotencia',repeat('a',43),
  'conteudo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
  'aad',jsonb_build_object('tabela','cadastro.objetivo_cuidado_versao','paciente_id',paciente::text,'objetivo_id',objetivo::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1));
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.gravar_objetivo_cuidado',ator,sessao));
 if r->>'ok' is distinct from 'true' then raise exception 'ESCRITA: %',r; end if;
 if operacao.encerrar_plano_privado(ator,1,reserva,recibo)<>'confirmada' then raise exception 'ENCERRAR'; end if;
 r:=operacao.consultar_barreira_plano_privado(gen_random_uuid());
 if r#>>'{resultado_pendente,objetivo_id}' is distinct from objetivo::text then raise exception 'RECONCILIACAO: %',r; end if;
 if operacao.reservar_plano_privado(ator,2,gen_random_uuid(),paciente)<>'bloqueada' then raise exception 'RESULTADO_NAO_BLOQUEOU'; end if;
 if operacao.reconhecer_barreira_plano_privado(recibo,gen_random_uuid())<>'reconhecido' then raise exception 'RECONHECIMENTO'; end if;
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.gravar_objetivo_cuidado',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'ENVIO_ATRASADO: %',r; end if;
 reserva:=gen_random_uuid();
 if operacao.reservar_plano_privado(ator,2,reserva,paciente)<>'aberta' or operacao.encerrar_plano_privado(ator,2,reserva,gen_random_uuid())<>'cancelada' then raise exception 'CANCELAMENTO'; end if;
end $$;

-- Fixture de duas conexões: cria enquanto outra tentativa espera o paciente.
update operacao.barreira_plano set resultado_pendente=null where ator_usuario_id='10000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","amr":[{"method":"oauth"}]}',false);
select operacao.reservar_plano_privado('10000000-0000-4000-8000-000000000002',3,'30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001');
create function public.criar_plano_concorrente_fixture() returns void language plpgsql as $$
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; paciente uuid:='40000000-0000-4000-8000-000000000001'; objetivo uuid:=gen_random_uuid(); registro uuid:=gen_random_uuid(); e jsonb; resultado jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'objetivo_id',objetivo,'registro_id',registro,'versao_esperada',0,'reserva_id','30000000-0000-4000-8000-000000000003','geracao_reserva',3,'chave_idempotencia','plano-concorrente','digest_idempotencia',repeat('c',43),
 'conteudo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
 'aad',jsonb_build_object('tabela','cadastro.objetivo_cuidado_versao','paciente_id',paciente::text,'objetivo_id',objetivo::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1));
 resultado:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.gravar_objetivo_cuidado',ator,sessao));
 if resultado->>'ok' is distinct from 'true' then raise exception 'CRIACAO_CONCORRENTE: %',resultado; end if;
end $$;
