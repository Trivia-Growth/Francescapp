-- Apenas clone dedicado; sessão, envelope e credenciais são fictícios.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database()<>'ffcm_credencial_xmin_fixture' or inet_server_addr() is not null
  or current_setting('unix_socket_directories') !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$'
  or current_setting('data_directory')<>current_setting('unix_socket_directories')||'/data' then raise exception 'clone isolado obrigatório'; end if;
 if not exists(select 1 from identidade.credencial_sessao where session_id='63000000-0000-4000-8000-000000000001') then raise exception 'controle de sessão anterior ausente'; end if;
end $$;
\ir ../drafts/20261104220000_credencial_xmin_experimento.sql
do $$ begin
 if has_column_privilege('ffcm_cred_chamador_fixture','identidade.credencial_sessao','envelope','select')
 or has_table_privilege('ffcm_cred_chamador_fixture','identidade.credencial_sessao','select,insert,update,delete')
 or pg_has_role('ffcm_cred_chamador_fixture','ffcm_cred_owner_fixture','member')
 or has_function_privilege('anon','identidade.inserir_credencial_xmin_fixture(uuid,jsonb)','execute')
 or has_function_privilege('authenticated','identidade.inserir_credencial_xmin_fixture(uuid,jsonb)','execute') then raise exception 'privilégio indevido'; end if;
end $$;
set local role ffcm_cred_owner_fixture;
do $$ begin
 if exists(select 1 from identidade.credencial_sessao where session_id='63000000-0000-4000-8000-000000000001') then raise exception 'owner leu envelope de transação anterior'; end if;
end $$;
reset role;
-- CONTRAEXEMPLO: xmin marca a última escrita. Um UPDATE sem alteração de
-- conteúdo torna sessão antiga visível ao owner, mesmo não tendo sido criada aqui.
update identidade.sessao set concessao_versao_admissao=concessao_versao_admissao where session_id='63000000-0000-4000-8000-000000000001';
set local role ffcm_cred_owner_fixture;
do $$ begin
 if not exists(select 1 from identidade.credencial_sessao where session_id='63000000-0000-4000-8000-000000000001') then raise exception 'contraexemplo xmin mudou'; end if;
end $$;
reset role;
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
 select 'd4000000-0000-4000-8000-000000000071',usuario_id,concessao_id,concessao_versao_admissao,metodo from identidade.sessao where session_id='63000000-0000-4000-8000-000000000001';
set local role ffcm_cred_chamador_fixture;
do $$ begin
 begin perform envelope from identidade.credencial_sessao; raise exception 'chamador leu envelope'; exception when insufficient_privilege then null; end;
 perform identidade.inserir_credencial_xmin_fixture('d4000000-0000-4000-8000-000000000071','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
end $$;
reset role;
do $$ begin
 if not exists(select 1 from identidade.credencial_sessao where session_id='d4000000-0000-4000-8000-000000000071' and geracao=1 and envelope->>'ciphertext'='c') then raise exception 'credencial válida não registrada'; end if;
end $$;
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
 select 'd4000000-0000-4000-8000-000000000072',usuario_id,concessao_id,concessao_versao_admissao,metodo from identidade.sessao where session_id='63000000-0000-4000-8000-000000000001';
create function pg_temp.adulterar_xmin_fixture() returns trigger language plpgsql as $$ begin
 new.envelope:=jsonb_set(new.envelope,'{ciphertext}','"alterado"'); return new;
end $$;
create trigger adulterar_xmin_fixture before insert on identidade.credencial_sessao for each row execute function pg_temp.adulterar_xmin_fixture();
set local role ffcm_cred_chamador_fixture;
do $$ begin
 begin
  perform identidade.inserir_credencial_xmin_fixture('d4000000-0000-4000-8000-000000000072','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
  raise exception 'adulteração aceita';
 exception when sqlstate 'P0002' then if sqlerrm<>'CREDENCIAL_INCONSISTENTE' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from identidade.credencial_sessao where session_id='d4000000-0000-4000-8000-000000000072') then raise exception 'adulteração não revertida'; end if;
end $$;
rollback;
