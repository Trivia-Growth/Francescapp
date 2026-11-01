-- Clone descartável. Credencial/identidade são fictícias; não prova Google ou Vault.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database()<>'ffcm_google_prova_fixture' or inet_server_addr() is not null
  or current_setting('unix_socket_directories') !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$'
  or current_setting('data_directory')<>current_setting('unix_socket_directories')||'/data' then raise exception 'clone isolado obrigatório'; end if;
end $$;
\ir ../drafts/20261104170000_google_vinculo_experimento.sql
\ir ../drafts/20261104210000_google_admissao_prova_experimento.sql
insert into auth.users(id) values('d1000000-0000-4000-8000-000000000001');
insert into public.usuario(id,perfil) values('d1000000-0000-4000-8000-000000000001','profissional');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,vinculada_em)
values('d2000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','google-ficticio','profissional','google_workspace','vinculada','d1000000-0000-4000-8000-000000000001','subject-ficticio','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',clock_timestamp());
insert into identidade.desafio_login(id,nonce_hash,criado_em,expira_em,consumido_em) values
 ('d3000000-0000-4000-8000-000000000001',repeat('a',64),clock_timestamp()-interval '1 second',clock_timestamp()+interval '5 minutes',clock_timestamp()),
 ('d3000000-0000-4000-8000-000000000002',repeat('b',64),clock_timestamp()-interval '1 second',clock_timestamp()+interval '5 minutes',clock_timestamp());
create function pg_temp.suprimir_prova_google() returns trigger language plpgsql as $$ begin
 if current_setting('ffcm_fixture.suprimir_prova_google',true)='sim' then return null; end if; return new;
end $$;
create trigger suprimir_prova_google before insert on identidade.prova_saida_fixture for each row execute function pg_temp.suprimir_prova_google();
create function pg_temp.suprimir_credencial_google() returns trigger language plpgsql as $$ begin
 if current_setting('ffcm_fixture.suprimir_credencial_google',true)='sim' then return null; end if; return new;
end $$;
create trigger suprimir_credencial_google before insert on identidade.credencial_sessao for each row execute function pg_temp.suprimir_credencial_google();
create function pg_temp.adulterar_credencial_google() returns trigger language plpgsql as $$ begin
 if current_setting('ffcm_fixture.adulterar_google',true)='credencial' then new.envelope:=jsonb_set(new.envelope,'{ciphertext}','"outro"'); end if; return new;
end $$;
create function pg_temp.adulterar_prova_google() returns trigger language plpgsql as $$ begin
 if current_setting('ffcm_fixture.adulterar_google',true)='prova' then new.verificador:=decode(repeat('02',32),'hex'); end if; return new;
end $$;
create trigger adulterar_credencial_google before insert on identidade.credencial_sessao for each row execute function pg_temp.adulterar_credencial_google();
create trigger adulterar_prova_google before insert on identidade.prova_saida_fixture for each row execute function pg_temp.adulterar_prova_google();
create function pg_temp.atrasar_prova_google() returns trigger language plpgsql as $$ begin
 if current_setting('ffcm_fixture.atrasar_prova_google',true)='sim' then perform pg_sleep(1.5); end if; return new;
end $$;
create trigger atrasar_prova_google before insert on identidade.prova_saida_fixture for each row execute function pg_temp.atrasar_prova_google();
do $$
declare e jsonb:='{"identidade":{"usuario_id":"d1000000-0000-4000-8000-000000000001","session_id":"d4000000-0000-4000-8000-000000000001","metodo":"google_workspace","subject_google":"subject-ficticio","email_hmac":"ficticio","desafio_id":"d3000000-0000-4000-8000-000000000001","nonce_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"credencial_refresh":{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"},"request_id":"d5000000-0000-4000-8000-000000000001"}';
 prova bytea:=decode(repeat('01',32),'hex'); r jsonb; tipo text;
begin
 if has_function_privilege('anon','identidade.google_admitir_com_prova_fixture(jsonb,bytea)','execute') or has_function_privilege('authenticated','identidade.google_admitir_com_prova_fixture(jsonb,bytea)','execute') then raise exception 'função exposta'; end if;
 r:=identidade.google_admitir_com_prova_fixture(jsonb_set(e,'{identidade,subject_google}','"outro"'),prova);
 if r->>'ok' is distinct from 'false' or exists(select 1 from identidade.sessao where session_id='d4000000-0000-4000-8000-000000000001') then raise exception 'subject divergente admitido'; end if;
 perform set_config('ffcm_fixture.suprimir_credencial_google','sim',true);
 begin
  perform identidade.google_admitir_com_prova_fixture(e,prova);
  raise exception 'credencial suprimida admitida';
 exception when sqlstate 'P0002' then if sqlerrm<>'CREDENCIAL_NAO_INSERIDA' then raise; end if; end;
 perform set_config('ffcm_fixture.suprimir_credencial_google','nao',true);
 if exists(select 1 from identidade.sessao where session_id='d4000000-0000-4000-8000-000000000001')
 or exists(select 1 from identidade.google_vinculo_fixture_uso where desafio_id='d3000000-0000-4000-8000-000000000001')
 or exists(select 1 from auditoria.evento where request_id='d5000000-0000-4000-8000-000000000001' and resultado='permitido') then raise exception 'falha de credencial não reverteu'; end if;
 perform set_config('ffcm_fixture.suprimir_prova_google','sim',true);
 begin
  perform identidade.google_admitir_com_prova_fixture(e,prova);
  raise exception 'prova suprimida admitida';
 exception when sqlstate 'P0002' then if sqlerrm<>'PROVA_NAO_REGISTRADA' then raise; end if; end;
 perform set_config('ffcm_fixture.suprimir_prova_google','nao',true);
 if exists(select 1 from identidade.sessao where session_id='d4000000-0000-4000-8000-000000000001')
 or exists(select 1 from identidade.google_vinculo_fixture_uso where desafio_id='d3000000-0000-4000-8000-000000000001')
 or exists(select 1 from auditoria.evento where request_id='d5000000-0000-4000-8000-000000000001' and resultado='permitido') then raise exception 'falha de prova não reverteu'; end if;
 foreach tipo in array array['credencial','prova'] loop
  perform set_config('ffcm_fixture.adulterar_google',tipo,true);
  begin
   perform identidade.google_admitir_com_prova_fixture(e,prova);
   raise exception 'conteúdo adulterado admitido';
  exception when sqlstate 'P0002' then if sqlerrm<>'ADMISSAO_INCOMPLETA' then raise; end if; end;
  if exists(select 1 from identidade.sessao where session_id='d4000000-0000-4000-8000-000000000001')
   or exists(select 1 from identidade.google_vinculo_fixture_uso where desafio_id='d3000000-0000-4000-8000-000000000001')
   or exists(select 1 from auditoria.evento where request_id='d5000000-0000-4000-8000-000000000001' and resultado='permitido') then raise exception 'adulteração não reverteu efeitos'; end if;
 end loop;
 perform set_config('ffcm_fixture.adulterar_google','nao',true);
 r:=identidade.google_admitir_com_prova_fixture(e,prova);
 if r->>'ok' is distinct from 'true' or r#>>'{dados,usuario_id}' is distinct from 'd1000000-0000-4000-8000-000000000001'
 or not exists(select 1 from identidade.credencial_sessao where session_id='d4000000-0000-4000-8000-000000000001' and geracao=1 and envelope=e->'credencial_refresh')
 or not exists(select 1 from identidade.prova_saida_fixture where session_id='d4000000-0000-4000-8000-000000000001' and geracao=1 and verificador=prova) then raise exception 'admissão incompleta'; end if;
 r:=identidade.google_admitir_com_prova_fixture(e,prova);
 if r->>'ok' is distinct from 'false' then raise exception 'replay aceito'; end if;
 insert into identidade.desafio_login(id,nonce_hash,criado_em,expira_em,consumido_em) values
 ('d3000000-0000-4000-8000-000000000003',repeat('c',64),clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 second',clock_timestamp());
 e:=jsonb_set(jsonb_set(jsonb_set(e,'{identidade,session_id}','"d4000000-0000-4000-8000-000000000003"'),'{identidade,desafio_id}','"d3000000-0000-4000-8000-000000000003"'),'{identidade,nonce_hash}',to_jsonb(repeat('c',64)));
 e:=jsonb_set(e,'{request_id}','"d5000000-0000-4000-8000-000000000003"');
 perform set_config('ffcm_fixture.atrasar_prova_google','sim',true);
 begin
  perform identidade.google_admitir_com_prova_fixture(e,prova);
  raise exception 'admissão após expiração aceita';
 exception when sqlstate 'P0002' then if sqlerrm<>'DESAFIO_EXPIROU' then raise; end if; end;
 if exists(select 1 from identidade.sessao where session_id='d4000000-0000-4000-8000-000000000003')
 or exists(select 1 from identidade.google_vinculo_fixture_uso where desafio_id='d3000000-0000-4000-8000-000000000003')
 or exists(select 1 from auditoria.evento where request_id='d5000000-0000-4000-8000-000000000003' and resultado='permitido') then raise exception 'expiração não reverteu efeitos'; end if;
end $$;
rollback;
