-- PostgreSQL descartável; sem gateway, Vault, Auth ou runtime real.
\set ON_ERROR_STOP on
do $$ begin
 if current_database() <> 'ffcm_saida_teste_local' or inet_server_addr() is not null
   or current_setting('unix_socket_directories') not like '%/ffcm-saida.%' then raise exception 'Cluster local descartável obrigatório'; end if;
end $$;
\ir ../drafts/20261102140000_renovacao_prova_integrada_experimento.sql
-- Etapas em conexões/transações distintas; confirmação não presume commit em trânsito.
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
 values ('30000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'google_workspace');
insert into identidade.prova_saida_fixture values ('30000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'));
insert into identidade.credencial_sessao(session_id,estado,geracao,envelope)
 values ('30000000-0000-4000-8000-000000000007','disponivel',1,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
select dblink_connect('renovar_a',format('dbname=%L host=%L port=%s',current_database(),current_setting('unix_socket_directories'),current_setting('port')));
select dblink_connect('renovar_b',format('dbname=%L host=%L port=%s',current_database(),current_setting('unix_socket_directories'),current_setting('port')));
select dblink_exec('renovar_a','set statement_timeout = ''10s''');
select dblink_exec('renovar_b','set statement_timeout = ''10s''');
do $$
declare pida int; pidb int; confirmado boolean; liberado boolean; bloqueado boolean := false;
 inicio text := $q$select identidade.iniciar_prova_experimento('30000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'),'40000000-0000-4000-8000-000000000002')$q$;
 persistencia text := $q$select identidade.persistir_prova_experimento('30000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'),'40000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"novo","ciphertext":"c","tag":"t"}',decode(repeat('02',32),'hex'))$q$;
 liberar text := replace(persistencia,'persistir_prova_experimento','liberar_prova_experimento');
 confirmar text := replace(persistencia,'persistir_prova_experimento','confirmar_prova_experimento');
begin
 select pid into pida from dblink('renovar_a','select pg_backend_pid()') as x(pid int);
 select pid into pidb from dblink('renovar_b','select pg_backend_pid()') as x(pid int);
 perform dblink_exec('renovar_a','begin');
 perform * from dblink('renovar_a',inicio) as x(e jsonb);
 perform dblink_send_query('renovar_b',$q$select identidade.confirmar_inicio_prova_experimento('30000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'),'40000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}')$q$);
 for i in 1..100 loop
   perform pg_stat_clear_snapshot();
   if exists(select 1 from pg_stat_activity where pid=pidb and wait_event_type='Lock' and pida=any(pg_blocking_pids(pidb))) then bloqueado:=true; exit; end if;
   perform pg_sleep(0.02);
 end loop;
 if not bloqueado then raise exception 'confirmação não aguardou início'; end if;
 perform dblink_exec('renovar_a','rollback');
 select v into confirmado from dblink_get_result('renovar_b') as x(v boolean);
 if confirmado is distinct from false then raise exception 'início revertido confirmado'; end if;
 perform * from dblink_get_result('renovar_b') as x(v boolean);
 bloqueado:=false;
 perform * from dblink('renovar_a',inicio) as x(e jsonb);
 select v into confirmado from dblink('renovar_b',$q$select identidade.confirmar_inicio_prova_experimento('30000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'),'40000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}')$q$) as x(v boolean);
 if confirmado is distinct from true then raise exception 'início confirmado não reconhecido'; end if;
 select v into liberado from dblink('renovar_a',persistencia) as x(v boolean);
 if liberado is distinct from true then raise exception 'persistência não confirmada'; end if;
 select v into confirmado from dblink('renovar_b',replace(persistencia,'persistir_prova_experimento','confirmar_persistencia_prova_experimento')) as x(v boolean);
 if confirmado is distinct from true then raise exception 'persistência confirmada não reconhecida'; end if;
 perform dblink_exec('renovar_a','begin');
 select v into liberado from dblink('renovar_a',liberar) as x(v boolean);
 if liberado is distinct from true then raise exception 'liberação não iniciada'; end if;
 perform dblink_send_query('renovar_b',confirmar);
 for i in 1..100 loop
   perform pg_stat_clear_snapshot();
   if exists(select 1 from pg_stat_activity where pid=pidb and wait_event_type='Lock' and pida=any(pg_blocking_pids(pidb))) then bloqueado:=true; exit; end if;
   perform pg_sleep(0.02);
 end loop;
 if not bloqueado then raise exception 'confirmação não esperou commit'; end if;
 perform dblink_exec('renovar_a','commit');
 select v into confirmado from dblink_get_result('renovar_b') as x(v boolean);
 if confirmado is distinct from true then raise exception 'commit não confirmado'; end if;
 perform * from dblink_get_result('renovar_b') as x(v boolean);
end $$;
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
 values ('30000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'google_workspace');
insert into identidade.prova_saida_fixture values ('30000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'));
insert into identidade.credencial_sessao(session_id,estado,geracao,envelope)
 values ('30000000-0000-4000-8000-000000000008','disponivel',1,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
do $$
declare pida int; pidb int; resultado boolean; bloqueado boolean := false;
 inicio text := $q$select identidade.iniciar_prova_experimento('30000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'),'40000000-0000-4000-8000-000000000003')$q$;
 persistencia text := $q$select identidade.persistir_prova_experimento('30000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'),'40000000-0000-4000-8000-000000000003','{"formato":1,"key_id":"teste","nonce":"novo","ciphertext":"c","tag":"t"}',decode(repeat('02',32),'hex'))$q$;
 liberar text := replace(persistencia,'persistir_prova_experimento','liberar_prova_experimento');
 confirmar text := replace(persistencia,'persistir_prova_experimento','confirmar_prova_experimento');
begin
 select pid into pida from dblink('renovar_a','select pg_backend_pid()') as x(pid int);
 select pid into pidb from dblink('renovar_b','select pg_backend_pid()') as x(pid int);
 perform * from dblink('renovar_a',inicio) as x(e jsonb);
 perform dblink_exec('renovar_a','begin');
 select v into resultado from dblink('renovar_a',persistencia) as x(v boolean);
 if resultado is distinct from true then raise exception 'persistência em trânsito negada'; end if;
 perform dblink_send_query('renovar_b',replace(persistencia,'persistir_prova_experimento','confirmar_persistencia_prova_experimento'));
 for i in 1..100 loop
   perform pg_stat_clear_snapshot();
   if exists(select 1 from pg_stat_activity where pid=pidb and wait_event_type='Lock' and pida=any(pg_blocking_pids(pidb))) then bloqueado:=true; exit; end if;
   perform pg_sleep(0.02);
 end loop;
 if not bloqueado then raise exception 'confirmação não aguardou persistência'; end if;
 perform dblink_exec('renovar_a','rollback');
 select v into resultado from dblink_get_result('renovar_b') as x(v boolean);
 if resultado is distinct from false then raise exception 'persistência revertida confirmada'; end if;
 perform * from dblink_get_result('renovar_b') as x(v boolean);
 bloqueado:=false;
 select v into resultado from dblink('renovar_a',persistencia) as x(v boolean);
 if resultado is distinct from true then raise exception 'persistência não confirmada'; end if;
 perform dblink_exec('renovar_a','begin');
 select v into resultado from dblink('renovar_a',liberar) as x(v boolean);
 if resultado is distinct from true then raise exception 'liberação não iniciada'; end if;
 perform dblink_send_query('renovar_b',confirmar);
 for i in 1..100 loop
   perform pg_stat_clear_snapshot();
   if exists(select 1 from pg_stat_activity where pid=pidb and wait_event_type='Lock' and pida=any(pg_blocking_pids(pidb))) then bloqueado:=true; exit; end if;
   perform pg_sleep(0.02);
 end loop;
 if not bloqueado then raise exception 'confirmação não esperou rollback'; end if;
 perform dblink_exec('renovar_a','rollback');
 select v into resultado from dblink_get_result('renovar_b') as x(v boolean);
 if resultado is distinct from false then raise exception 'rollback confirmado indevidamente'; end if;
 perform * from dblink_get_result('renovar_b') as x(v boolean);
 if (select estado from identidade.credencial_sessao where session_id='30000000-0000-4000-8000-000000000008') is distinct from 'em_troca' then raise exception 'rollback liberou credencial'; end if;
end $$;
select dblink_disconnect('renovar_a');
select dblink_disconnect('renovar_b');
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
 values ('30000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'google_workspace');
insert into identidade.prova_saida_fixture values ('30000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001',1,decode(repeat('01',32),'hex'));
insert into identidade.credencial_sessao(session_id,estado,geracao,envelope)
 values ('30000000-0000-4000-8000-000000000006','disponivel',1,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
do $$
declare s uuid := '30000000-0000-4000-8000-000000000006'; u uuid := '10000000-0000-4000-8000-000000000001';
 t uuid := '40000000-0000-4000-8000-000000000001'; velha bytea := decode(repeat('01',32),'hex'); nova bytea := decode(repeat('02',32),'hex');
 e jsonb := '{"formato":1,"key_id":"teste","nonce":"novo","ciphertext":"c","tag":"t"}';
begin
 if identidade.iniciar_prova_experimento(s,u,1,decode(repeat('03',32),'hex'),t) is not null then raise exception 'prova incorreta iniciou'; end if;
 if identidade.iniciar_prova_experimento(s,u,1,velha,t) is null then raise exception 'início válido negado'; end if;
 if identidade.confirmar_inicio_prova_experimento(s,u,1,velha,t,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}') is distinct from false then raise exception 'transação confirmou seu próprio início'; end if;
 if identidade.iniciar_prova_experimento(s,u,1,velha,gen_random_uuid()) is not null then raise exception 'troca concorrente aceita'; end if;
 if identidade.persistir_prova_experimento(s,u,1,velha,t,e,nova) is distinct from true then raise exception 'persistência negada'; end if;
 if identidade.confirmar_persistencia_prova_experimento(s,u,1,velha,t,e,nova) is distinct from false then raise exception 'transação confirmou sua própria persistência'; end if;
 if identidade.persistir_prova_experimento(s,u,1,velha,t,e,nova) is distinct from true then raise exception 'persistência idêntica não repetível'; end if;
 if identidade.persistir_prova_experimento(s,u,1,velha,t,e,decode(repeat('03',32),'hex')) is distinct from false
   or identidade.liberar_prova_experimento(s,u,1,velha,gen_random_uuid(),e,nova) is distinct from false then raise exception 'transição divergente aceita'; end if;
 if identidade.confirmar_prova_experimento(s,u,1,velha,t,e,nova) is distinct from false then raise exception 'liberação presumida'; end if;
 if identidade.liberar_prova_experimento(s,u,1,velha,t,e,nova) is distinct from true then raise exception 'liberação negada'; end if;
 if identidade.confirmar_prova_experimento(s,u,1,velha,t,e,nova) is distinct from false then raise exception 'transação confirmou seu próprio commit'; end if;
 if identidade.iniciar_prova_experimento(s,u,1,velha,gen_random_uuid()) is not null then raise exception 'prova antiga aceita'; end if;
 if identidade.iniciar_prova_experimento(s,u,2,nova,gen_random_uuid()) is null then raise exception 'nova prova recusada'; end if;
end $$;
do $$
declare s uuid := '30000000-0000-4000-8000-000000000007'; u uuid := '10000000-0000-4000-8000-000000000001';
 t uuid := '40000000-0000-4000-8000-000000000002'; velha bytea := decode(repeat('01',32),'hex'); nova bytea := decode(repeat('02',32),'hex');
 e jsonb := '{"formato":1,"key_id":"teste","nonce":"novo","ciphertext":"c","tag":"t"}';
begin
 if saida_fixture.revogar(s,u,2,nova,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',gen_random_uuid()) is distinct from true then raise exception 'revogação negada'; end if;
 if identidade.confirmar_prova_experimento(s,u,1,velha,t,e,nova) is distinct from false then raise exception 'confirmação após revogação aceita'; end if;
end $$;
