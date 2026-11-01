-- Somente fixture PostgreSQL descartável; todas as alterações serão revertidas.
-- SET SESSION AUTHORIZATION simula identidade, não prova conexão real/pooler.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database()<>'postgres' or inet_server_addr() is not null
   or current_setting('unix_socket_directories') !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$'
   or current_setting('data_directory') <> current_setting('unix_socket_directories') || '/data' then
   raise exception 'cluster local descartável obrigatório';
 end if;
end $$;
\ir ../drafts/20261102190000_operador_auditoria_experimento.sql
create role ffcm_operador_audit_fixture login nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role ffcm_outro_audit_fixture login nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant usage on schema auditoria to ffcm_operador_audit_fixture;
grant insert(id,operador_restrito,acao,tipo_objeto,resultado,request_id) on auditoria.evento to ffcm_operador_audit_fixture;
grant usage on schema auditoria to ffcm_outro_audit_fixture;
grant insert(id,operador_restrito,acao,tipo_objeto,resultado,request_id) on auditoria.evento to ffcm_outro_audit_fixture;
insert into auditoria.operador_fixture(codigo,papel_oid,ativo)
values('operador_fixture','ffcm_operador_audit_fixture'::regrole::oid,true);
set local session authorization ffcm_operador_audit_fixture;
insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,resultado,request_id)
values('91000000-0000-4000-8000-000000000001','operador_fixture','teste','fixture','permitido','92000000-0000-4000-8000-000000000001');
do $$ begin
 begin
   insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,resultado,request_id)
   values('91000000-0000-4000-8000-000000000002','texto_livre','teste','fixture','permitido','92000000-0000-4000-8000-000000000002');
   raise exception 'texto livre admitido';
 exception when insufficient_privilege then if sqlerrm<>'OPERADOR_NAO_AUTORIZADO' then raise; end if; end;
 begin perform * from auditoria.operador_fixture; raise exception 'cadastro exposto ao operador';
 exception when insufficient_privilege then null; end;
 begin
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,resultado,request_id)
   values('91000000-0000-4000-8000-000000000005','61000000-0000-4000-8000-000000000001','teste','fixture','permitido','92000000-0000-4000-8000-000000000005');
   raise exception 'operador falsificou ator individual';
 exception when insufficient_privilege then null; end;
end $$;
reset session authorization;
set local session authorization ffcm_outro_audit_fixture;
do $$ begin
 begin
   insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,resultado,request_id)
   values('91000000-0000-4000-8000-000000000003','operador_fixture','teste','fixture','permitido','92000000-0000-4000-8000-000000000003');
   raise exception 'outro login se passou por operador';
 exception when insufficient_privilege then if sqlerrm<>'OPERADOR_NAO_AUTORIZADO' then raise; end if; end;
end $$;
reset session authorization;
update auditoria.operador_fixture set ativo=false where codigo='operador_fixture';
set local session authorization ffcm_operador_audit_fixture;
do $$ begin
 begin
   insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,resultado,request_id)
   values('91000000-0000-4000-8000-000000000004','operador_fixture','teste','fixture','permitido','92000000-0000-4000-8000-000000000004');
   raise exception 'operador inativo admitido';
 exception when insufficient_privilege then if sqlerrm<>'OPERADOR_NAO_AUTORIZADO' then raise; end if; end;
end $$;
reset session authorization;
do $$ begin
 if not exists(select 1 from auditoria.evento where id='91000000-0000-4000-8000-000000000001' and operador_restrito='operador_fixture') then raise exception 'operador cadastrado recusado'; end if;
 if has_table_privilege('anon','auditoria.operador_fixture','select,insert,update,delete')
   or has_table_privilege('authenticated','auditoria.operador_fixture','select,insert,update,delete')
   or has_function_privilege('anon','auditoria.verificar_operador_fixture()','execute')
   or has_function_privilege('authenticated','auditoria.verificar_operador_fixture()','execute') then raise exception 'cadastro ou função expostos'; end if;
end $$;
-- Testa append-only sem instalar trigger no ambiente persistente.
create function pg_temp.negar_mutacao_evento() returns trigger language plpgsql as $$ begin raise exception using errcode='55000',message='AUDITORIA_APPEND_ONLY'; end $$;
create trigger append_only_fixture before update or delete on auditoria.evento for each row execute function pg_temp.negar_mutacao_evento();
do $$ begin
 begin update auditoria.evento set acao='forjada' where id='91000000-0000-4000-8000-000000000001'; raise exception 'evento editado';
 exception when object_not_in_prerequisite_state then if sqlerrm<>'AUDITORIA_APPEND_ONLY' then raise; end if; end;
 begin delete from auditoria.evento where id='91000000-0000-4000-8000-000000000001'; raise exception 'evento removido';
 exception when object_not_in_prerequisite_state then if sqlerrm<>'AUDITORIA_APPEND_ONLY' then raise; end if; end;
end $$;
rollback;
