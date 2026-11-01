-- Clone exclusivo com COMMITs fictícios. Revogação é simulação SQL, NÃO RPC real.
\set ON_ERROR_STOP on
do $$ begin
 if current_database()<>'ffcm_google_revogacao_fixture' or inet_server_addr() is not null
  or current_setting('unix_socket_directories') !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$'
  or current_setting('data_directory')<>current_setting('unix_socket_directories')||'/data' then raise exception 'clone isolado obrigatório'; end if;
end $$;
\ir ../drafts/20261104170000_google_vinculo_experimento.sql
\ir ../drafts/20261104180000_google_primeiro_vinculo_experimento.sql
\ir ../drafts/20261104210000_google_admissao_prova_experimento.sql
\ir ../drafts/20261104220000_google_primeiro_com_prova_experimento.sql
\ir ../drafts/20261104230000_google_selecao_admissao_experimento.sql
create extension dblink;
insert into auth.users(id) values('e1000000-0000-4000-8000-000000000001'),('e1000000-0000-4000-8000-000000000002');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,motivo_cifrado) values
 ('e2000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}','hmac_1','profissional','google_workspace','pendente','{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}'),
 ('e2000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}','hmac_2','profissional','google_workspace','pendente','{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}');
insert into identidade.desafio_login(id,nonce_hash,criado_em,expira_em,consumido_em) values
 ('e3000000-0000-4000-8000-000000000001',repeat('a',64),clock_timestamp()-interval '1 second',clock_timestamp()+interval '5 minutes',clock_timestamp()),
 ('e3000000-0000-4000-8000-000000000002',repeat('b',64),clock_timestamp()-interval '1 second',clock_timestamp()+interval '5 minutes',clock_timestamp());
create function identidade.revogar_simulada_teste(c uuid,u uuid) returns boolean language plpgsql as $$ begin
 perform 1 from identidade.concessao_equipe where id=c for update;
 if not found then return false; end if;
 update identidade.sessao set revogada_em=clock_timestamp(),revogada_por_usuario_id='61000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado='{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}' where concessao_id=c and revogada_em is null;
 update public.usuario set ativo=false where id=u;
 update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),revogada_por_usuario_id='61000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado='{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}' where id=c;
 return true;
end $$;
create function pg_temp.esperar_lock(p_pid integer) returns void language plpgsql as $$ declare prazo timestamptz:=clock_timestamp()+interval '3 seconds'; begin loop
 perform pg_stat_clear_snapshot();
 if exists(select 1 from pg_stat_activity where pid=p_pid and wait_event_type='Lock' and pg_backend_pid()=any(pg_blocking_pids(pid))) then return; end if;
 if clock_timestamp()>=prazo then raise exception 'bloqueio não observado'; end if;
 perform pg_sleep(0.02);
end loop; end $$;
select dblink_connect('outra',format('dbname=%L host=%L port=%s',current_database(),current_setting('unix_socket_directories'),current_setting('port')));
select pid as backend from dblink('outra','select pg_backend_pid()') as x(pid integer) \gset
select dblink_exec('outra','set statement_timeout=30000');
select dblink_exec('outra','set lock_timeout=10000');
-- Revogação simulada vence: seleção deve aguardar e negar.
begin;
select identidade.revogar_simulada_teste('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001');
select dblink_send_query('outra',$$select identidade.google_selecionar_admissao_fixture('{"identidade":{"usuario_id":"e1000000-0000-4000-8000-000000000001","session_id":"e4000000-0000-4000-8000-000000000001","metodo":"google_workspace","subject_google":"subject-1","email_hmac":"hmac_1","desafio_id":"e3000000-0000-4000-8000-000000000001","nonce_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"request_id":"e5000000-0000-4000-8000-000000000001","credencial_refresh":{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}}'::jsonb,decode(repeat('01',32),'hex'))$$);
select pg_temp.esperar_lock(:backend);
commit;
do $$ declare r jsonb; begin select resultado into r from dblink_get_result('outra') as x(resultado jsonb);
 if r->>'ok' is distinct from 'false' or exists(select 1 from identidade.sessao where session_id='e4000000-0000-4000-8000-000000000001') then raise exception 'seleção após revogação aceita'; end if;
end $$;
select * from dblink_get_result('outra') as x(resultado jsonb);
-- Seleção vence: revogação aguarda e deve alcançar a sessão criada.
begin;
do $$ declare r jsonb; e jsonb:='{"identidade":{"usuario_id":"e1000000-0000-4000-8000-000000000002","session_id":"e4000000-0000-4000-8000-000000000002","metodo":"google_workspace","subject_google":"subject-2","email_hmac":"hmac_2","desafio_id":"e3000000-0000-4000-8000-000000000002","nonce_hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"request_id":"e5000000-0000-4000-8000-000000000002","credencial_refresh":{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}}'; begin
 r:=identidade.google_selecionar_admissao_fixture(e,decode(repeat('02',32),'hex'));
 if r->>'ok' is distinct from 'true' then raise exception 'seleção inicialmente negada'; end if;
 insert into identidade.desafio_login(id,nonce_hash,criado_em,expira_em,consumido_em) values
  ('e3000000-0000-4000-8000-000000000003',repeat('c',64),clock_timestamp()-interval '1 second',clock_timestamp()+interval '5 minutes',clock_timestamp());
 e:=jsonb_set(jsonb_set(jsonb_set(e,'{identidade,desafio_id}','"e3000000-0000-4000-8000-000000000003"'),'{identidade,nonce_hash}',to_jsonb(repeat('c',64))),'{identidade,session_id}','"e4000000-0000-4000-8000-000000000003"');
 r:=identidade.google_selecionar_admissao_fixture(jsonb_set(e,'{identidade,subject_google}','"outro-subject"'),decode(repeat('02',32),'hex'));
 if r->>'ok' is distinct from 'false' or exists(select 1 from identidade.sessao where session_id='e4000000-0000-4000-8000-000000000003') then raise exception 'subject divergente aceito'; end if;
 r:=identidade.google_selecionar_admissao_fixture(e,decode(repeat('02',32),'hex'));
 if r->>'ok' is distinct from 'true' then raise exception 'controle de subject válido falhou'; end if;
 perform set_config('ffcm_fixture.usuario','e1000000-0000-4000-8000-000000000002',true);
 perform set_config('ffcm_fixture.sessao','e4000000-0000-4000-8000-000000000002',true);
 perform set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
 perform set_config('request.jwt.claims','{"session_id":"e4000000-0000-4000-8000-000000000002"}',true);
 if identidade.sessao_atual_valida() is distinct from true then raise exception 'controle positivo da sessão falhou'; end if;
end $$;
select dblink_send_query('outra',$$select identidade.revogar_simulada_teste('e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000002')$$);
select pg_temp.esperar_lock(:backend);
commit;
do $$ declare r boolean; begin select resultado into r from dblink_get_result('outra') as x(resultado boolean);
 if r is not true or not exists(select 1 from identidade.sessao where session_id='e4000000-0000-4000-8000-000000000002' and revogada_em is not null)
 or not exists(select 1 from identidade.sessao where session_id='e4000000-0000-4000-8000-000000000003' and revogada_em is not null)
 or not exists(select 1 from identidade.concessao_equipe where id='e2000000-0000-4000-8000-000000000002' and estado='revogada')
 or not exists(select 1 from public.usuario where id='e1000000-0000-4000-8000-000000000002' and not ativo) then raise exception 'revogação não alcançou sessão'; end if;
end $$;
select * from dblink_get_result('outra') as x(resultado boolean);
-- Claims são simulados: só comprovam que o helper de sessão consulta revogação,
-- não que JWT tenha sido assinado/verificado ou invalidado pelo Auth real.
select set_config('ffcm_fixture.usuario','e1000000-0000-4000-8000-000000000002',false);
select set_config('ffcm_fixture.sessao','e4000000-0000-4000-8000-000000000002',false);
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',false);
select set_config('request.jwt.claims','{"session_id":"e4000000-0000-4000-8000-000000000002"}',false);
do $$ begin
 if identidade.sessao_atual_valida() is distinct from false then raise exception 'claims antigos aceitos após revogação'; end if;
end $$;
select dblink_disconnect('outra');
