\set ON_ERROR_STOP on
\ir plano_composicao_local.sql
\ir ../migrations/20261111140000_tarefa_cuidado_versoes_privadas.sql
\ir ../migrations/20261111150000_tarefa_cuidado_operacoes_privadas.sql
insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado) values ('91000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',jsonb_build_object('formato',1,'key_id','v1','nonce','n','ciphertext','c','tag','t'));
insert into cadastro.tarefa_cuidado(id,paciente_id) values ('90000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001'), ('90000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","amr":[{"method":"oauth"}]}',false);
set role ffcmapp_tarefa_owner;
do $$ begin if (select count(*) from cadastro.tarefa_cuidado) <> 1 or not exists(select 1 from cadastro.tarefa_cuidado where id='90000000-0000-4000-8000-000000000001') then raise exception 'ISOLAMENTO_FALHOU'; end if; begin insert into cadastro.tarefa_cuidado values ('90000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000002'); raise exception 'INSERCAO_INDEVIDA'; exception when insufficient_privilege then null; end; end $$;
insert into cadastro.tarefa_cuidado values ('90000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001');
reset role;
update cadastro.acesso_paciente set revogada_em=clock_timestamp(), revogado_por_usuario_id='10000000-0000-4000-8000-000000000001', motivo_revogacao_cifrado=motivo_concessao_cifrado where id='91000000-0000-4000-8000-000000000001';
set role ffcmapp_tarefa_owner;
do $$ begin if exists(select 1 from cadastro.tarefa_cuidado) then raise exception 'VINCULO_REVOGADO_FALHOU'; end if; end $$;
reset role;
update cadastro.acesso_paciente set revogada_em=null, revogado_por_usuario_id=null, motivo_revogacao_cifrado=null where id='91000000-0000-4000-8000-000000000001';
update identidade.sessao set encerrada_em=clock_timestamp() where session_id='20000000-0000-4000-8000-000000000002';
set role ffcmapp_tarefa_owner;
do $$ begin if exists(select 1 from cadastro.tarefa_cuidado) then raise exception 'REVOGACAO_FALHOU'; end if; end $$;
reset role;
update identidade.sessao set encerrada_em=null where session_id='20000000-0000-4000-8000-000000000002';
update public.usuario set perfil='familia' where id='10000000-0000-4000-8000-000000000002';
set role ffcmapp_tarefa_owner;
do $$ begin if exists(select 1 from cadastro.tarefa_cuidado) then raise exception 'PERFIL_FALHOU'; end if; end $$;
reset role;
update public.usuario set perfil='profissional' where id='10000000-0000-4000-8000-000000000002';
\ir ../migrations/20261111190000_tarefa_cuidado_idempotencia_privada.sql
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; tarefa uuid:=gen_random_uuid(); registro uuid; entrada jsonb; resposta jsonb; versao integer;
begin
 for versao in 0..2 loop
  registro:=gen_random_uuid();
  entrada:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'tarefa_id',tarefa,'registro_id',registro,
   'versao_esperada',versao,'chave_idempotencia','tarefa-fixture-'||versao,'digest_idempotencia',repeat('a',43),
   'conteudo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
   'aad',jsonb_build_object('tabela','cadastro.tarefa_cuidado_versao','paciente_id',paciente,'tarefa_id',tarefa,'registro_id',registro,'versao',versao+1,'campo','conteudo','formato',1));
  resposta:=api.tarefa_cuidado_privado(public.assinar_anamnese_fixture(entrada,'api.gravar_tarefa_cuidado',ator,sessao));
  if resposta->>'ok' is distinct from 'true' or (resposta#>>'{dados,versao}')::integer <> versao+1 then raise exception 'GRAVACAO_TAREFA_FALHOU: %',resposta; end if;
 end loop;
 if (select count(*) from cadastro.tarefa_cuidado_versao where tarefa_id=tarefa) <> 3 then raise exception 'VERSOES_AUSENTES'; end if;
end $$;
