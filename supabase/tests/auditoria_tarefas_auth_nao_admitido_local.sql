\set ON_ERROR_STOP on
\ir leitura_tarefas_wrapper_local.sql
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
create temp table tarefa_acl_antes as select oid,proacl,proowner from pg_proc where oid in ('api.tarefa_cuidado_privado(jsonb)'::regprocedure,'api.tarefa_cuidado_operacao_privada(jsonb)'::regprocedure,'api.ler_tarefas_cuidado_privado(jsonb)'::regprocedure);
\ir ../migrations/20261112270000_auditoria_tarefas_auth_nao_admitido.sql
do $$ begin if exists(select 1 from tarefa_acl_antes a join pg_proc p on p.oid=a.oid where p.proacl is distinct from a.proacl or p.proowner is distinct from a.proowner) then raise exception 'ACL_ALTERADA'; end if; end $$;
insert into auth.users values ('10000000-0000-4000-8000-000000000099');
insert into auth.sessions values ('20000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000099',null);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000099","session_id":"20000000-0000-4000-8000-000000000099","amr":[{"method":"password"}]}',false);
create function auditoria.falhar_tarefa_auth_fixture() returns trigger language plpgsql as $$ begin raise exception 'AUDITORIA_FIXTURE'; end $$;
do $$ declare req uuid:=gen_random_uuid(); t jsonb; r jsonb; begin
 t:=public.assinar_anamnese_fixture(jsonb_build_object('request_id',req,'paciente_id',gen_random_uuid()),'api.ler_tarefas_cuidado',auth.uid(),(auth.jwt()->>'session_id')::uuid);
 execute 'set local role authenticated'; r:=api.ler_tarefas_cuidado_privado(t); execute 'reset role';
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' or not exists(select 1 from auditoria.evento where request_id=req and ator_auth_id=auth.uid() and ator_usuario_id is null and resultado='negado' and acao='api.ler_tarefas_cuidado') then raise exception 'AUDITORIA_INVALIDA'; end if;
 begin execute 'set local role ffcmapp_tarefa_owner'; insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,resultado,request_id) values(gen_random_uuid(),'10000000-0000-4000-8000-000000000098','api.ler_tarefas_cuidado','paciente','negado',gen_random_uuid()); raise exception 'IDENTIDADE_FORJADA_ACEITA'; exception when insufficient_privilege then null; end;
 execute 'reset role'; create trigger falha_tarefa before insert on auditoria.evento for each row execute function auditoria.falhar_tarefa_auth_fixture();
 begin execute 'set local role authenticated'; perform api.ler_tarefas_cuidado_privado(t); raise exception 'FALHA_AUDITORIA_IGNORADA'; exception when raise_exception then if sqlerrm<>'AUDITORIA_FIXTURE' then raise; end if; end;
 execute 'reset role'; drop trigger falha_tarefa on auditoria.evento;
end $$;

-- A mesma política cobre gravação e preserva ator de perfil existente.
do $$ declare req uuid; t jsonb; r jsonb; ator uuid:='10000000-0000-4000-8000-000000000099'; sessao uuid:='20000000-0000-4000-8000-000000000099'; begin
 req:=gen_random_uuid(); t:=public.assinar_anamnese_fixture(jsonb_build_object('request_id',req,'paciente_id',gen_random_uuid(),'tarefa_id',gen_random_uuid(),'registro_id',gen_random_uuid(),'versao_esperada',0),'api.gravar_tarefa_cuidado',ator,sessao);
 execute 'set local role ffcmapp_tarefa_owner'; r:=api.tarefa_cuidado_privado(t); execute 'reset role';
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or not exists(select 1 from auditoria.evento where request_id=req and ator_auth_id=ator and ator_usuario_id is null and acao='api.gravar_tarefa_cuidado') then raise exception 'GRAVACAO_AUDITORIA_INVALIDA'; end if;
 ator:='10000000-0000-4000-8000-000000000002'; sessao:='20000000-0000-4000-8000-000000000002';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 req:=gen_random_uuid(); t:=public.assinar_anamnese_fixture(jsonb_build_object('request_id',req,'paciente_id','40000000-0000-4000-8000-000000000001'),'api.ler_tarefas_cuidado',ator,sessao);
 execute 'set local role authenticated'; r:=api.ler_tarefas_cuidado_privado(t); execute 'reset role';
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or not exists(select 1 from auditoria.evento where request_id=req and ator_usuario_id=ator and ator_auth_id is null and resultado='negado') then raise exception 'PERFIL_EXISTENTE_INVALIDO'; end if;
end $$;
