-- Clone dedicado e dados fictícios; não demonstra JWT/Vault/identidade real.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database()<>'ffcm_sesscred_fixture' or inet_server_addr() is not null
  or current_setting('unix_socket_directories') !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$'
  or current_setting('data_directory')<>current_setting('unix_socket_directories')||'/data' then raise exception 'clone isolado obrigatório'; end if;
end $$;
\ir ../drafts/20261104230000_sessao_credencial_helper_experimento.sql
do $$ begin
 if has_column_privilege('ffcm_sesscred_caller_fixture','identidade.credencial_sessao','envelope','select')
 or has_table_privilege('ffcm_sesscred_caller_fixture','identidade.prova_saida_fixture','select,insert,update')
 or pg_has_role('ffcm_sesscred_caller_fixture','ffcm_sesscred_owner_fixture','member')
 or has_function_privilege('anon','identidade.criar_sesscred_fixture(uuid,uuid,uuid,integer,text,jsonb,bytea,uuid)','execute')
 or has_function_privilege('authenticated','identidade.criar_sesscred_fixture(uuid,uuid,uuid,integer,text,jsonb,bytea,uuid)','execute') then raise exception 'acesso direto indevido'; end if;
end $$;
create function pg_temp.adulterar_sesscred() returns trigger language plpgsql as $$ begin
 if current_setting('ffcm_fixture.sesscred_falha',true)='credencial' then new.envelope:=jsonb_set(new.envelope,'{ciphertext}','"outro"'); end if; return new;
end $$;
create function pg_temp.suprimir_sesscred_audit() returns trigger language plpgsql as $$ begin
 if current_setting('ffcm_fixture.sesscred_falha',true)='auditoria' then return null; end if; return new;
end $$;
create trigger adulterar_sesscred before insert on identidade.credencial_sessao for each row execute function pg_temp.adulterar_sesscred();
create trigger suprimir_sesscred_audit before insert on auditoria.evento for each row execute function pg_temp.suprimir_sesscred_audit();
set local role ffcm_sesscred_caller_fixture;
do $$
declare u uuid:='61000000-0000-4000-8000-000000000001'; c uuid:='62000000-0000-4000-8000-000000000001';
 e jsonb:='{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'; p bytea:=decode(repeat('01',32),'hex'); tipo text; esperado text;
begin
 begin perform envelope from identidade.credencial_sessao; raise exception 'leitura direta aceita'; exception when insufficient_privilege then null; end;
 foreach tipo in array array['credencial','auditoria'] loop
  esperado:=case tipo when 'credencial' then 'ADMISSAO_INCONSISTENTE' else 'AUDITORIA_NAO_REGISTRADA' end;
  perform set_config('ffcm_fixture.sesscred_falha',tipo,true);
  begin
   perform identidade.criar_sesscred_fixture('d4000000-0000-4000-8000-000000000081',u,c,1,'tecnica',e,p,'d5000000-0000-4000-8000-000000000081');
   raise exception 'falha ignorada';
  exception when sqlstate 'P0002' then if sqlerrm<>esperado then raise; end if; end;
 end loop;
 perform set_config('ffcm_fixture.sesscred_falha','nao',true);
 perform identidade.criar_sesscred_fixture('d4000000-0000-4000-8000-000000000082',u,c,1,'tecnica',e,p,'d5000000-0000-4000-8000-000000000082');
end $$;
reset role;
do $$ begin
 if exists(select 1 from identidade.sessao where session_id='d4000000-0000-4000-8000-000000000081')
 or exists(select 1 from identidade.credencial_sessao where session_id='d4000000-0000-4000-8000-000000000081')
 or exists(select 1 from identidade.prova_saida_fixture where session_id='d4000000-0000-4000-8000-000000000081')
 or exists(select 1 from auditoria.evento where request_id='d5000000-0000-4000-8000-000000000081') then raise exception 'rollback incompleto'; end if;
 if not exists(select 1 from identidade.sessao s join identidade.credencial_sessao c using(session_id) join identidade.prova_saida_fixture p using(session_id)
  where s.session_id='d4000000-0000-4000-8000-000000000082' and c.geracao=1 and p.geracao=1)
 or not exists(select 1 from auditoria.evento where request_id='d5000000-0000-4000-8000-000000000082' and resultado='permitido') then raise exception 'admissão incompleta'; end if;
end $$;
rollback;
