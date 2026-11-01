-- Conexões locais fictícias: prova de lock, não integração Auth/Vault.
\set ON_ERROR_STOP on
do $$ begin
 if current_database() <> 'ffcm_saida_teste_local' or inet_server_addr() is not null
    or current_setting('unix_socket_directories') not like '%/ffcm-saida.%' then
   raise exception 'Cluster local descartável obrigatório';
 end if;
end $$;
create extension dblink;
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
 values ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'google_workspace');
insert into identidade.prova_saida_fixture values ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'));
insert into identidade.credencial_sessao(session_id,estado,envelope)
 values ('30000000-0000-4000-8000-000000000003','disponivel','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
select dblink_connect('saida_a',format('dbname=%L host=%L port=%s',current_database(),current_setting('unix_socket_directories'),current_setting('port')));
select dblink_connect('saida_b',format('dbname=%L host=%L port=%s',current_database(),current_setting('unix_socket_directories'),current_setting('port')));
select dblink_exec('saida_a','set statement_timeout = ''10s''');
select dblink_exec('saida_b','set statement_timeout = ''10s''');
select dblink_exec('saida_b','set role ffcm_saida_runtime');
do $$
declare pida int; pidb int; geracao bigint; resultado boolean; bloqueado boolean := false;
 q text := $q$select saida_fixture.revogar('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'),'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',gen_random_uuid())$q$;
begin
 select pid into pida from dblink('saida_a','select pg_backend_pid()') as t(pid int);
 select pid into pidb from dblink('saida_b','select pg_backend_pid()') as t(pid int);
 perform dblink_exec('saida_a','begin');
 select g into geracao from dblink('saida_a',$q$select geracao from identidade.iniciar_renovacao('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001')$q$) as t(g bigint);
 if geracao is distinct from 1 then raise exception 'renovação não iniciada'; end if;
 perform dblink_send_query('saida_b',q);
 for i in 1..100 loop
   perform pg_stat_clear_snapshot();
   if exists(select 1 from pg_stat_activity where pid=pidb and wait_event_type='Lock' and pida=any(pg_blocking_pids(pidb))) then bloqueado:=true; exit; end if;
   perform pg_sleep(0.02);
 end loop;
 if not bloqueado then raise exception 'espera por renovação não observada'; end if;
 perform dblink_exec('saida_a','commit');
 select v into resultado from dblink_get_result('saida_b') as t(v boolean);
 if resultado is distinct from true then raise exception 'saída concorrente não revogou'; end if;
 perform * from dblink_get_result('saida_b') as t(v boolean);
 if identidade.finalizar_renovacao('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',1,'{"formato":1,"key_id":"teste","nonce":"novo","ciphertext":"c","tag":"t"}') is distinct from false then
   raise exception 'renovação reabriu sessão revogada';
 end if;
 if not exists (select 1 from identidade.sessao where session_id='30000000-0000-4000-8000-000000000003' and revogada_em is not null)
   or (select count(*) from auditoria.evento where objeto_id='30000000-0000-4000-8000-000000000003')<>1 then raise exception 'revogação ou auditoria ausente'; end if;
end $$;
-- Rotação simulada apenas na fixture: não é a implementação real do refresh.
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
 values ('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'google_workspace');
insert into identidade.prova_saida_fixture values ('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'));
do $$
declare pida int; pidb int; resultado boolean; bloqueado boolean := false;
 q text := $q$select saida_fixture.revogar('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'),'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',gen_random_uuid())$q$;
begin
 select pid into pida from dblink('saida_a','select pg_backend_pid()') as t(pid int);
 select pid into pidb from dblink('saida_b','select pg_backend_pid()') as t(pid int);
 perform dblink_exec('saida_a','begin');
 perform * from dblink('saida_a',$q$select id from identidade.concessao_equipe where id='20000000-0000-4000-8000-000000000001' for update$q$) as t(id uuid);
 perform * from dblink('saida_a',$q$select id from public.usuario where id='10000000-0000-4000-8000-000000000001' for update$q$) as t(id uuid);
 perform * from dblink('saida_a',$q$select session_id from identidade.sessao where session_id='30000000-0000-4000-8000-000000000004' for update$q$) as t(id uuid);
 perform dblink_exec('saida_a',$q$update identidade.prova_saida_fixture set geracao=2,verificador=decode(repeat('02',32),'hex') where session_id='30000000-0000-4000-8000-000000000004'$q$);
 perform dblink_send_query('saida_b',q);
 for i in 1..100 loop
   perform pg_stat_clear_snapshot();
   if exists(select 1 from pg_stat_activity where pid=pidb and wait_event_type='Lock' and pida=any(pg_blocking_pids(pidb))) then bloqueado:=true; exit; end if;
   perform pg_sleep(0.02);
 end loop;
 if not bloqueado then raise exception 'espera por troca de prova não observada'; end if;
 perform dblink_exec('saida_a','commit');
 select v into resultado from dblink_get_result('saida_b') as t(v boolean);
 if resultado is distinct from false then raise exception 'prova anterior aceita após rotação'; end if;
 perform * from dblink_get_result('saida_b') as t(v boolean);
 select v into resultado from dblink('saida_b',$q$select saida_fixture.revogar('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001',2,decode(repeat('02',32),'hex'),'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',gen_random_uuid())$q$) as t(v boolean);
 if resultado is distinct from true then raise exception 'prova vigente recusada'; end if;
end $$;
-- Revogação vencendo o lock deve impedir o início da renovação concorrente.
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
 values ('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'google_workspace');
insert into identidade.prova_saida_fixture values ('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'));
insert into identidade.credencial_sessao(session_id,estado,envelope)
 values ('30000000-0000-4000-8000-000000000005','disponivel','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
do $$
declare pida int; pidb int; resultado boolean; n integer; bloqueado boolean := false;
begin
 select pid into pida from dblink('saida_a','select pg_backend_pid()') as t(pid int);
 select pid into pidb from dblink('saida_b','select pg_backend_pid()') as t(pid int);
 perform dblink_exec('saida_b','begin');
 select v into resultado from dblink('saida_b',$q$select saida_fixture.revogar('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'),'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',gen_random_uuid())$q$) as t(v boolean);
 if resultado is distinct from true then raise exception 'revogação não iniciada'; end if;
 perform dblink_send_query('saida_a',$q$select geracao from identidade.iniciar_renovacao('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001')$q$);
 for i in 1..100 loop
   perform pg_stat_clear_snapshot();
   if exists(select 1 from pg_stat_activity where pid=pida and wait_event_type='Lock' and pidb=any(pg_blocking_pids(pida))) then bloqueado:=true; exit; end if;
   perform pg_sleep(0.02);
 end loop;
 if not bloqueado then raise exception 'espera por revogação não observada'; end if;
 perform dblink_exec('saida_b','commit');
 select count(*) into n from dblink_get_result('saida_a') as t(g bigint);
 if n<>0 then raise exception 'renovação iniciada após revogação'; end if;
 perform * from dblink_get_result('saida_a') as t(g bigint);
 if not exists(select 1 from identidade.sessao where session_id='30000000-0000-4000-8000-000000000005' and revogada_em is not null) then raise exception 'tombstone ausente'; end if;
end $$;
select dblink_disconnect('saida_a');
select dblink_disconnect('saida_b');
