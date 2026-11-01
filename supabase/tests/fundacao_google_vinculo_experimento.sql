-- Apenas cluster dedicado; não comprova autenticação Google nem sessão funcional.
\set ON_ERROR_STOP on
do $$ declare s text:=current_setting('unix_socket_directories'); begin
 if current_database()<>'ffcm_admissao_teste_local' or inet_server_addr() is not null
 or s !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$' or current_setting('data_directory')<>s||'/data'
 then raise exception 'cluster descartável obrigatório'; end if;
end $$;
begin;
\ir ../drafts/20261104170000_google_vinculo_experimento.sql
insert into auth.users values('41000000-0000-4000-8000-000000000003');
insert into public.usuario(id,perfil) values('41000000-0000-4000-8000-000000000003','profissional');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,vinculada_em)
values('42000000-0000-4000-8000-000000000003','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','google-teste','profissional','google_workspace','vinculada','41000000-0000-4000-8000-000000000003','subject-teste','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',clock_timestamp());
insert into identidade.desafio_login(id,nonce_hash,criado_em,expira_em,consumido_em) values
 ('45000000-0000-4000-8000-000000000001',repeat('a',64),clock_timestamp()-interval '1 second',clock_timestamp()+interval '5 minutes',clock_timestamp()),
 ('45000000-0000-4000-8000-000000000002',repeat('b',64),clock_timestamp()-interval '1 second',clock_timestamp()+interval '5 minutes',clock_timestamp()),
 ('45000000-0000-4000-8000-000000000003',repeat('c',64),clock_timestamp()-interval '1 second',clock_timestamp()+interval '5 minutes',clock_timestamp()),
 ('45000000-0000-4000-8000-000000000004',repeat('d',64),clock_timestamp()-interval '1 second',clock_timestamp()+interval '5 minutes',clock_timestamp());
insert into identidade.desafio_login(id,nonce_hash,criado_em,expira_em,consumido_em) values
 ('45000000-0000-4000-8000-000000000005',repeat('f',64),clock_timestamp()-interval '3 minutes',clock_timestamp()-interval '1 minute',clock_timestamp()-interval '2 minutes');
create function pg_temp.falhar_auditoria_google() returns trigger language plpgsql as $$ begin
 if new.request_id='44000000-0000-4000-8000-000000000055' then raise exception 'AUDITORIA_FIXTURE'; end if; return new;
end $$;
create trigger falhar_auditoria_google before insert on auditoria.evento for each row execute function pg_temp.falhar_auditoria_google();
do $$
declare u uuid:='41000000-0000-4000-8000-000000000003'; c uuid:='42000000-0000-4000-8000-000000000003'; s uuid:='43000000-0000-4000-8000-000000000051'; r uuid:='44000000-0000-4000-8000-000000000051';
begin
 if not identidade.google_vinculo_fixture('45000000-0000-4000-8000-000000000001',repeat('a',64),u,'subject-teste',s,r) then raise exception 'controle positivo falhou'; end if;
 if identidade.google_vinculo_fixture('45000000-0000-4000-8000-000000000001',repeat('a',64),u,'subject-teste','43000000-0000-4000-8000-000000000052',r) then raise exception 'replay admitido'; end if;
 if identidade.google_vinculo_fixture('45000000-0000-4000-8000-000000000002',repeat('b',64),u,'subject-divergente','43000000-0000-4000-8000-000000000053',r) then raise exception 'subject divergente'; end if;
 if identidade.google_vinculo_fixture('45000000-0000-4000-8000-000000000002',repeat('b',64),'41000000-0000-4000-8000-000000000099','subject-teste','43000000-0000-4000-8000-000000000053',r) then raise exception 'UUID divergente'; end if;
 if identidade.google_vinculo_fixture('45000000-0000-4000-8000-000000000002',repeat('e',64),u,'subject-teste','43000000-0000-4000-8000-000000000053',r) then raise exception 'hash divergente'; end if;
 if identidade.google_vinculo_fixture('45000000-0000-4000-8000-000000000005',repeat('f',64),u,'subject-teste','43000000-0000-4000-8000-000000000056',r) then raise exception 'desafio expirado admitido'; end if;
 if identidade.google_vinculo_fixture('45000000-0000-4000-8000-000000000002',repeat('b',64),u,'subject-teste',s,r) then raise exception 'colisão de sessão'; end if;
 begin
  perform identidade.google_vinculo_fixture('45000000-0000-4000-8000-000000000004',repeat('d',64),u,'subject-teste','43000000-0000-4000-8000-000000000055','44000000-0000-4000-8000-000000000055');
  raise exception 'auditoria deveria falhar';
 exception when raise_exception then if sqlerrm<>'AUDITORIA_FIXTURE' then raise; end if; end;
 if exists(select 1 from identidade.sessao where session_id='43000000-0000-4000-8000-000000000055') or exists(select 1 from identidade.google_vinculo_fixture_uso where desafio_id='45000000-0000-4000-8000-000000000004') then raise exception 'falha de auditoria deixou efeitos'; end if;
 update identidade.sessao set revogada_em=clock_timestamp(),revogada_por_usuario_id=u,motivo_revogacao_cifrado='{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}' where session_id=s;
 update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),revogada_por_usuario_id=u,motivo_revogacao_cifrado='{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}' where id=c;
 if identidade.google_vinculo_fixture('45000000-0000-4000-8000-000000000003',repeat('c',64),u,'subject-teste','43000000-0000-4000-8000-000000000054',r) then raise exception 'concessão revogada admitida'; end if;
 if (select count(*) from identidade.google_vinculo_fixture_uso)<>1 then raise exception 'uso inválido persistido'; end if;
 if (select count(*) from auditoria.evento where request_id=r and resultado='permitido')<>1 or (select count(*) from auditoria.evento where request_id=r and resultado='negado')<>7 then raise exception 'auditoria incompleta'; end if;
end $$;
rollback;
