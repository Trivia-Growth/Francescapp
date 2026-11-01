\set ON_ERROR_STOP on
do $$ declare s text:=current_setting('unix_socket_directories'); begin
 if current_database()<>'ffcm_admissao_teste_local' or inet_server_addr() is not null or s !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$' or current_setting('data_directory')<>s||'/data' then raise exception 'cluster descartável obrigatório'; end if;
end $$;
begin;
\ir ../drafts/20261104180000_google_primeiro_vinculo_experimento.sql
insert into auth.users values ('41000000-0000-4000-8000-000000000010'),('41000000-0000-4000-8000-000000000011');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,motivo_cifrado) values
('42000000-0000-4000-8000-000000000010','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','email-fixture-10','profissional','google_workspace','pendente','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'),
('42000000-0000-4000-8000-000000000011','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','email-fixture-11','profissional','google_workspace','pendente','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
insert into identidade.desafio_login(id,nonce_hash,criado_em,expira_em,consumido_em) values
('45000000-0000-4000-8000-000000000010',repeat('a',64),clock_timestamp()-interval '1 second',clock_timestamp()+interval '5 minutes',clock_timestamp()),
('45000000-0000-4000-8000-000000000011',repeat('b',64),clock_timestamp()-interval '1 second',clock_timestamp()+interval '5 minutes',clock_timestamp());
create function pg_temp.falhar_auditoria_primeiro() returns trigger language plpgsql as $$ begin
 if new.request_id='44000000-0000-4000-8000-000000000062' then raise exception 'AUDITORIA_FIXTURE'; end if; return new;
end $$;
create trigger falhar_auditoria_primeiro before insert on auditoria.evento for each row execute function pg_temp.falhar_auditoria_primeiro();
create function pg_temp.adulterar_primeiro() returns trigger language plpgsql as $$ begin
 if current_setting('ffcm.fixture',true)='subject' and tg_table_name='concessao_equipe' then new.subject_google:='subject-adulterado'; end if;
 if current_setting('ffcm.fixture',true)='usuario_id' and tg_table_name='concessao_equipe' then new.usuario_id:='41000000-0000-4000-8000-000000000011'; end if;
 if current_setting('ffcm.fixture',true)='perfil_usuario' and tg_table_name='usuario' then new.perfil:='administrador'; end if;
 if current_setting('ffcm.fixture',true)='metodo_sessao' and tg_table_name='sessao' then new.metodo:='tecnica'; end if;
 if current_setting('ffcm.fixture',true)='desafio_uso' and tg_table_name='google_vinculo_fixture_uso' then new.desafio_id:='45000000-0000-4000-8000-000000000011'; end if;
 if current_setting('ffcm.fixture',true)=tg_table_name then return null; end if;
 return new;
end $$;
create trigger adulterar_primeiro before update on identidade.concessao_equipe for each row execute function pg_temp.adulterar_primeiro();
create trigger suprimir_usuario before insert on public.usuario for each row execute function pg_temp.adulterar_primeiro();
create trigger suprimir_sessao before insert on identidade.sessao for each row execute function pg_temp.adulterar_primeiro();
create trigger suprimir_uso before insert on identidade.google_vinculo_fixture_uso for each row execute function pg_temp.adulterar_primeiro();
do $$ declare d uuid:='45000000-0000-4000-8000-000000000010'; u uuid:='41000000-0000-4000-8000-000000000010'; s uuid:='43000000-0000-4000-8000-000000000061'; r uuid:='44000000-0000-4000-8000-000000000061'; v text; resultado boolean; falhas_auditadas integer:=0; begin
 foreach v in array array['subject','usuario_id','perfil_usuario','metodo_sessao','desafio_uso','usuario','sessao','google_vinculo_fixture_uso'] loop
  perform set_config('ffcm.fixture',v,true);
  begin resultado:=identidade.google_primeiro_vinculo_fixture(d,repeat('a',64),'email-fixture-10',u,'subject-10',s,r); falhas_auditadas:=falhas_auditadas+1;
  exception when raise_exception or check_violation then resultado:=false; end;
  if resultado then raise exception 'adulteração aceita: %',v; end if;
  if exists(select 1 from public.usuario where id=u) or exists(select 1 from identidade.sessao where session_id=s) or exists(select 1 from identidade.google_vinculo_fixture_uso where desafio_id=d) or not exists(select 1 from identidade.concessao_equipe where id='42000000-0000-4000-8000-000000000010' and estado='pendente') then raise exception 'adulteração deixou efeitos'; end if;
 end loop;
 perform set_config('ffcm.fixture','',true);
 if identidade.google_primeiro_vinculo_fixture(d,repeat('a',64),'errado',u,'subject-10',s,r) then raise exception 'email indevido'; end if;
 if not identidade.google_primeiro_vinculo_fixture(d,repeat('a',64),'email-fixture-10',u,'subject-10',s,r) then raise exception 'vínculo válido negado'; end if;
 if not exists(select 1 from identidade.concessao_equipe where usuario_id=u and subject_google='subject-10' and estado='vinculada' and versao=2) or not exists(select 1 from public.usuario where id=u and perfil='profissional' and ativo) or not exists(select 1 from identidade.google_vinculo_fixture_uso where desafio_id=d and session_id=s) then raise exception 'vínculo incompleto'; end if;
 if identidade.google_primeiro_vinculo_fixture(d,repeat('a',64),'email-fixture-10',u,'subject-10',gen_random_uuid(),r) then raise exception 'replay aceito'; end if;
 if identidade.google_primeiro_vinculo_fixture('45000000-0000-4000-8000-000000000011',repeat('b',64),'email-fixture-11','41000000-0000-4000-8000-000000000011','subject-11',s,r) then raise exception 'colisão aceita'; end if;
 if exists(select 1 from public.usuario where id='41000000-0000-4000-8000-000000000011') or not exists(select 1 from identidade.concessao_equipe where id='42000000-0000-4000-8000-000000000011' and estado='pendente') then raise exception 'colisão deixou efeitos'; end if;
 begin
  perform identidade.google_primeiro_vinculo_fixture('45000000-0000-4000-8000-000000000011',repeat('b',64),'email-fixture-11','41000000-0000-4000-8000-000000000011','subject-11','43000000-0000-4000-8000-000000000062','44000000-0000-4000-8000-000000000062');
  raise exception 'auditoria deveria falhar';
 exception when raise_exception then if sqlerrm<>'AUDITORIA_FIXTURE' then raise; end if; end;
 if exists(select 1 from public.usuario where id='41000000-0000-4000-8000-000000000011') or exists(select 1 from identidade.sessao where session_id='43000000-0000-4000-8000-000000000062') or exists(select 1 from identidade.google_vinculo_fixture_uso where desafio_id='45000000-0000-4000-8000-000000000011') or not exists(select 1 from identidade.concessao_equipe where id='42000000-0000-4000-8000-000000000011' and estado='pendente') then raise exception 'auditoria deixou efeitos'; end if;
 update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),revogada_por_usuario_id=u,motivo_revogacao_cifrado='{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}' where id='42000000-0000-4000-8000-000000000011';
 if identidade.google_primeiro_vinculo_fixture('45000000-0000-4000-8000-000000000011',repeat('b',64),'email-fixture-11','41000000-0000-4000-8000-000000000011','subject-11',gen_random_uuid(),r) then raise exception 'revogada aceita'; end if;
 if (select count(*) from auditoria.evento a where a.request_id=r and a.resultado='permitido')<>1 or (select count(*) from auditoria.evento a where a.request_id=r and a.resultado='negado')<>4+falhas_auditadas then raise exception 'auditoria incompleta'; end if;
end $$;
rollback;
