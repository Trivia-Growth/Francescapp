\set ON_ERROR_STOP on
do $$ declare s text:=current_setting('unix_socket_directories'); begin
 if current_database()<>'ffcm_admissao_teste_local' or inet_server_addr() is not null or s !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$' or current_setting('data_directory')<>s||'/data' then raise exception 'cluster descartável obrigatório'; end if;
end $$;
begin;
\ir ../drafts/20261104180000_google_primeiro_vinculo_experimento.sql
\ir ../drafts/20261104220000_google_primeiro_com_prova_experimento.sql
insert into auth.users values ('41000000-0000-4000-8000-000000000010');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,motivo_cifrado) values
('42000000-0000-4000-8000-000000000010','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','email_fixture_10','profissional','google_workspace','pendente','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
insert into identidade.desafio_login(id,nonce_hash,criado_em,expira_em,consumido_em) values
('45000000-0000-4000-8000-000000000010',repeat('a',64),clock_timestamp()-interval '1 second',clock_timestamp()+interval '5 minutes',clock_timestamp());
create function pg_temp.suprimir_google_credencial() returns trigger language plpgsql as $$ begin
 if current_setting('ffcm.fixture',true)=tg_table_name then return null; end if;
 if current_setting('ffcm.fixture',true)='envelope_adulterado' and tg_table_name='credencial_sessao' then new.envelope:=jsonb_set(new.envelope,'{ciphertext}','"alterado"'); end if;
 if current_setting('ffcm.fixture',true)='prova_adulterada' and tg_table_name='prova_saida_fixture' then new.verificador:=decode(repeat('cc',32),'hex'); end if;
 if current_setting('ffcm.fixture',true)='atraso_'||tg_table_name then perform pg_sleep(0.5); end if;
 return new; end $$;
create trigger suprimir_google_credencial before insert on identidade.credencial_sessao for each row execute function pg_temp.suprimir_google_credencial();
create trigger suprimir_google_prova before insert on identidade.prova_saida_fixture for each row execute function pg_temp.suprimir_google_credencial();
do $$ declare e jsonb:='{"identidade":{"usuario_id":"41000000-0000-4000-8000-000000000010","session_id":"43000000-0000-4000-8000-000000000061","metodo":"google_workspace","subject_google":"subject-10","email_hmac":"email_fixture_10","desafio_id":"45000000-0000-4000-8000-000000000010","nonce_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"request_id":"44000000-0000-4000-8000-000000000061","credencial_refresh":{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}}'; v text; resultado jsonb; begin
 foreach v in array array['credencial_sessao','prova_saida_fixture','envelope_adulterado','prova_adulterada'] loop
  perform set_config('ffcm.fixture',v,true);
  begin perform identidade.google_primeiro_com_prova_fixture(e,decode(repeat('ab',32),'hex')); raise exception 'falha esperada';
  exception when sqlstate 'P0002' then if sqlerrm not in ('CREDENCIAL_NAO_INSERIDA','PROVA_NAO_REGISTRADA','ADMISSAO_INCOMPLETA') then raise; end if; end;
  if exists(select 1 from public.usuario where id='41000000-0000-4000-8000-000000000010') or exists(select 1 from identidade.sessao where session_id='43000000-0000-4000-8000-000000000061') or exists(select 1 from identidade.google_vinculo_fixture_uso where desafio_id='45000000-0000-4000-8000-000000000010') or exists(select 1 from auditoria.evento where request_id='44000000-0000-4000-8000-000000000061') or not exists(select 1 from identidade.concessao_equipe where id='42000000-0000-4000-8000-000000000010' and estado='pendente') then raise exception 'falha deixou efeitos'; end if;
 end loop;
 foreach v in array array['credencial_sessao','prova_saida_fixture'] loop
  update identidade.desafio_login set expira_em=clock_timestamp()+interval '250 milliseconds' where id='45000000-0000-4000-8000-000000000010';
  perform set_config('ffcm.fixture','atraso_'||v,true);
  begin perform identidade.google_primeiro_com_prova_fixture(e,decode(repeat('ab',32),'hex')); raise exception 'expiração não detectada';
  exception when sqlstate 'P0002' then if sqlerrm<>'ADMISSAO_INCOMPLETA' then raise; end if; end;
  if exists(select 1 from public.usuario where id='41000000-0000-4000-8000-000000000010') or exists(select 1 from identidade.sessao where session_id='43000000-0000-4000-8000-000000000061') or exists(select 1 from identidade.google_vinculo_fixture_uso where desafio_id='45000000-0000-4000-8000-000000000010') or exists(select 1 from identidade.credencial_sessao where session_id='43000000-0000-4000-8000-000000000061') or exists(select 1 from identidade.prova_saida_fixture where session_id='43000000-0000-4000-8000-000000000061') or exists(select 1 from auditoria.evento where request_id='44000000-0000-4000-8000-000000000061') or not exists(select 1 from identidade.concessao_equipe where id='42000000-0000-4000-8000-000000000010' and estado='pendente') then raise exception 'expiração deixou efeitos'; end if;
 end loop;
 update identidade.desafio_login set expira_em=clock_timestamp()+interval '5 minutes' where id='45000000-0000-4000-8000-000000000010';
 perform set_config('ffcm.fixture','',true);
 resultado:=identidade.google_primeiro_com_prova_fixture(e,decode(repeat('ab',32),'hex'));
 if resultado->>'ok' is distinct from 'true' or not exists(select 1 from identidade.credencial_sessao where session_id='43000000-0000-4000-8000-000000000061' and geracao=1 and envelope=e->'credencial_refresh') or not exists(select 1 from identidade.prova_saida_fixture where session_id='43000000-0000-4000-8000-000000000061' and geracao=1 and verificador=decode(repeat('ab',32),'hex')) then raise exception 'admissão incompleta'; end if;
 if identidade.google_primeiro_com_prova_fixture(e,decode(repeat('ab',32),'hex'))->>'ok' is distinct from 'false' then raise exception 'replay aceito'; end if;
end $$;
rollback;
