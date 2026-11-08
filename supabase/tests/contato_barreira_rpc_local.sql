\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
\ir ../migrations/20261109100000_editar_paciente_privado.sql
\ir ../migrations/20261111100000_criar_contato_privado.sql
\ir ../migrations/20261111110000_contato_wrapper_privado.sql
\ir ../migrations/20261111120000_contato_owner_privado.sql
\ir ../migrations/20261111200000_barreira_criacao_contato_privada.sql
\ir ../migrations/20261111210000_barreira_contato_composicao_privada.sql
\ir ../migrations/20261111230000_contato_barreira_owner_privado.sql
create temporary table privilegios_barreira_antes as
 select proowner,proacl from pg_proc where oid='operacao.contato_barreira_composicao_privada(jsonb)'::regprocedure;
\ir ../migrations/20261112120000_corrigir_reserva_barreira_contato.sql
do $$ begin
 if exists(select 1 from pg_proc p cross join privilegios_barreira_antes a where p.oid='operacao.contato_barreira_composicao_privada(jsonb)'::regprocedure and (p.proowner is distinct from a.proowner or p.proacl is distinct from a.proacl)) then raise exception 'OWNER_OU_GRANTS_ALTERADOS'; end if;
end $$;
do $$ begin
 if has_function_privilege('authenticated','api.contato_barreira_composicao(jsonb)','execute') or has_function_privilege('anon','api.contato_barreira_composicao(jsonb)','execute') then raise exception 'GRANT_INDEVIDO'; end if;
end $$;
grant execute on function api.contato_barreira_composicao(jsonb) to authenticated;
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000001'; sessao uuid:='20000000-0000-4000-8000-000000000001'; paciente uuid:='40000000-0000-4000-8000-000000000001'; entrada jsonb; t jsonb; resultado jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reservar_criacao_contato','epoca',1,'reserva_id',gen_random_uuid(),'paciente_id',paciente);
 t:=public.assinar_anamnese_fixture(entrada,'api.reservar_criacao_contato',ator,sessao);
 execute 'set local role authenticated';
 resultado:=api.contato_barreira_composicao(t);
 execute 'reset role';
 if resultado#>>'{dados,estado}' is distinct from 'aberta' then raise exception 'RESERVA_NAO_CONCLUIDA'; end if;
 if not exists(select 1 from auditoria.evento a where a.request_id=(entrada->>'request_id')::uuid and a.resultado='permitido' and a.acao='api.reservar_criacao_contato') then raise exception 'RESERVA_SEM_AUDITORIA'; end if;
 update identidade.sessao s set encerrada_em=clock_timestamp() where s.session_id=sessao;
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.consultar_barreira_criacao_contato');
 t:=public.assinar_anamnese_fixture(entrada,'api.consultar_barreira_criacao_contato',ator,sessao);
 execute 'set local role authenticated';
 resultado:=api.contato_barreira_composicao(t);
 execute 'reset role';
 if resultado#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SESSAO_REVOGADA_ACEITA'; end if;
end $$;
