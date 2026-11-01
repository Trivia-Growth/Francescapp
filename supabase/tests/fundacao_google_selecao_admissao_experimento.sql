\set ON_ERROR_STOP on
do $$ declare s text:=current_setting('unix_socket_directories'); begin
 if current_database()<>'ffcm_admissao_teste_local' or inet_server_addr() is not null or s !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$' or current_setting('data_directory')<>s||'/data' then raise exception 'cluster descartável obrigatório'; end if;
end $$;
begin;
\ir ../drafts/20261104180000_google_primeiro_vinculo_experimento.sql
\ir ../drafts/20261104210000_google_admissao_prova_experimento.sql
\ir ../drafts/20261104220000_google_primeiro_com_prova_experimento.sql
\ir ../drafts/20261104230000_google_selecao_admissao_experimento.sql
insert into auth.users values ('41000000-0000-4000-8000-000000000010');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,motivo_cifrado) values ('42000000-0000-4000-8000-000000000010','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','email_fixture_10','profissional','google_workspace','pendente','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
insert into identidade.desafio_login(id,nonce_hash,criado_em,expira_em,consumido_em) values
('45000000-0000-4000-8000-000000000010',repeat('a',64),clock_timestamp()-interval '1 second',clock_timestamp()+interval '5 minutes',clock_timestamp()),
('45000000-0000-4000-8000-000000000011',repeat('b',64),clock_timestamp()-interval '1 second',clock_timestamp()+interval '5 minutes',clock_timestamp());
do $$ declare e jsonb:='{"identidade":{"usuario_id":"41000000-0000-4000-8000-000000000010","session_id":"43000000-0000-4000-8000-000000000061","metodo":"google_workspace","subject_google":"subject-10","email_hmac":"email_fixture_10","desafio_id":"45000000-0000-4000-8000-000000000010","nonce_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"request_id":"44000000-0000-4000-8000-000000000061","credencial_refresh":{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}}'; n jsonb; begin
 if identidade.google_selecionar_admissao_fixture(e,decode(repeat('ab',32),'hex'))->>'ok' is distinct from 'true' then raise exception 'pendente negada'; end if;
 insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,motivo_cifrado) values ('42000000-0000-4000-8000-000000000012','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','email_novo_fixture','profissional','google_workspace','pendente','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
 if identidade.google_selecionar_admissao_fixture(e,decode(repeat('ab',32),'hex'))->>'ok' is distinct from 'false' then raise exception 'replay aceito'; end if;
 n:=jsonb_set(jsonb_set(jsonb_set(e,'{identidade,desafio_id}','"45000000-0000-4000-8000-000000000011"'),'{identidade,nonce_hash}',to_jsonb(repeat('b',64))),'{identidade,session_id}','"43000000-0000-4000-8000-000000000062"');
 if identidade.google_selecionar_admissao_fixture(jsonb_set(n,'{identidade,usuario_id}','"41000000-0000-4000-8000-000000000099"'),decode(repeat('ab',32),'hex'))->>'ok' is distinct from 'false' then raise exception 'usuário divergente'; end if;
 if identidade.google_selecionar_admissao_fixture(jsonb_set(n,'{identidade,subject_google}','"outro-subject"'),decode(repeat('ab',32),'hex'))->>'ok' is distinct from 'false' then raise exception 'subject divergente'; end if;
 if identidade.google_selecionar_admissao_fixture(jsonb_set(n,'{identidade,email_hmac}','"email_novo_fixture"'),decode(repeat('ab',32),'hex'))->>'ok' is distinct from 'true' then raise exception 'vinculada com email alterado negada'; end if;
 if not exists(select 1 from identidade.concessao_equipe where id='42000000-0000-4000-8000-000000000012' and estado='pendente' and usuario_id is null) or not exists(select 1 from identidade.sessao where session_id='43000000-0000-4000-8000-000000000062' and concessao_id='42000000-0000-4000-8000-000000000010') then raise exception 'dupla concessão ou seleção incorreta'; end if;
end $$;
rollback;
