\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
\ir ../migrations/20261109100000_editar_paciente_privado.sql
\ir ../migrations/20261111100000_criar_contato_privado.sql
\ir ../migrations/20261111110000_contato_wrapper_privado.sql
\ir ../migrations/20261111120000_contato_owner_privado.sql
\ir ../migrations/20261111200000_barreira_criacao_contato_privada.sql
\ir ../migrations/20261111210000_barreira_contato_composicao_privada.sql
\ir ../migrations/20261111230000_contato_barreira_owner_privado.sql
do $$
#variable_conflict use_variable
declare
 ator uuid:='10000000-0000-4000-8000-000000000001';
 sessao uuid:='20000000-0000-4000-8000-000000000001';
 paciente uuid:='40000000-0000-4000-8000-000000000001';
 reserva uuid:=gen_random_uuid(); contato uuid:=gen_random_uuid(); e jsonb; r jsonb;
begin
 if has_function_privilege('authenticated','api.criar_contato_paciente(jsonb)','execute')
  or has_table_privilege('authenticated','cadastro.contato_paciente','select')
  or has_table_privilege('authenticated','cadastro.contato_paciente','insert') then
  raise exception 'ACESSO_DIRETO_INDEVIDO';
 end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 if operacao.reservar_criacao_contato_privado(ator,1,reserva,paciente)<>'aberta' then raise exception 'RESERVA'; end if;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'contato_id',contato,'reserva_id',reserva,'geracao_reserva',1,'auditoria_id',gen_random_uuid(),
 'chave_idempotencia','contato-fixture','digest_idempotencia',repeat('a',43),'tipo','email',
 'valor',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
 'aad',jsonb_build_object('tabela','cadastro.contato_paciente','registro_id',contato::text,'campo','valor','formato',1));
 r:=api.criar_contato_paciente(public.assinar_anamnese_fixture(e,'api.criar_contato_paciente',ator,sessao));
 if r->>'ok' is distinct from 'true' then raise exception 'ADMIN_NEGADO: %',r; end if;
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 r:=api.criar_contato_paciente(public.assinar_anamnese_fixture(e,'api.criar_contato_paciente',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SESSAO_ACEITA'; end if;
 update identidade.sessao set encerrada_em=null where session_id=sessao;
 update public.usuario set perfil='profissional' where id=ator;
 r:=api.criar_contato_paciente(public.assinar_anamnese_fixture(e,'api.criar_contato_paciente',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'PERFIL_ACEITO'; end if;
 update public.usuario set perfil='administrador' where id=ator;
 e:=jsonb_set(e,'{paciente_id}',to_jsonb('40000000-0000-4000-8000-000000000002'::text));
 r:=api.criar_contato_paciente(public.assinar_anamnese_fixture(e,'api.criar_contato_paciente',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'PACIENTE_DIFERENTE_ACEITO: %',r; end if;
end $$;
