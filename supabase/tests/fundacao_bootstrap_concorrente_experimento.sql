-- Somente instância descartável própria: insere fixtures e cria extensão.
\set ON_ERROR_STOP on
do $$ begin
 if current_database() <> 'ffcm_bootstrap_teste_local'
   or current_setting('unix_socket_directories') !~ '^/tmp/ffcm-bootstrap\.[A-Za-z0-9]+$'
   or inet_client_addr() is not null then raise exception 'banco isolado obrigatório'; end if;
end $$;
create extension dblink;
insert into auth.users(id) values ('51000000-0000-4000-8000-000000000001'), ('51000000-0000-4000-8000-000000000002');
create function public.teste_preservar_auth() returns trigger language plpgsql as $$
begin raise exception 'Auth não deve ser modificado'; end $$;
create trigger teste_preservar_auth before insert or update or delete on auth.users
for each row execute function public.teste_preservar_auth();
insert into identidade.bootstrap_experimento(projeto_ref) values ('projeto-ficticio');
select dblink_connect('a', format('dbname=%L host=%L port=%s',current_database(),current_setting('unix_socket_directories'),current_setting('port')));
select dblink_connect('b', format('dbname=%L host=%L port=%s',current_database(),current_setting('unix_socket_directories'),current_setting('port')));
select dblink_connect('c', format('dbname=%L host=%L port=%s',current_database(),current_setting('unix_socket_directories'),current_setting('port')));
do $$
declare pida int; pidb int; pidc int; resultado text; observou boolean := false;
 q text := $q$select identidade.bootstrap_tecnico_experimento('projeto-ficticio','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','hmac','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','operador','53000000-0000-4000-8000-000000000001')$q$;
begin
 select pid into pida from dblink('a','select pg_backend_pid()') as t(pid int);
 select pid into pidb from dblink('b','select pg_backend_pid()') as t(pid int);
 select pid into pidc from dblink('c','select pg_backend_pid()') as t(pid int);
 perform dblink_exec('a','begin');
 select v into resultado from dblink('a',q) as t(v text);
 if resultado is distinct from 'inicializado' then raise exception 'primeira chamada falhou'; end if;
 perform dblink_send_query('b',q);
 perform dblink_send_query('c',replace(q,'51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002'));
 for i in 1..100 loop
  if exists(select 1 from pg_stat_activity where pid=pidb and wait_event_type='Lock' and pida=any(pg_blocking_pids(pidb)))
    and exists(select 1 from pg_stat_activity where pid=pidc and wait_event_type='Lock'
      and (pida=any(pg_blocking_pids(pidc)) or pidb=any(pg_blocking_pids(pidc)))) then observou := true; exit; end if;
  perform pg_sleep(0.02);
 end loop;
 if not observou then raise exception 'espera em lock não observada'; end if;
 perform dblink_exec('a','commit');
 select v into resultado from dblink_get_result('b') as t(v text);
 if resultado is distinct from 'ja_inicializado' then raise exception 'repetição concorrente falhou'; end if;
 perform * from dblink_get_result('b') as t(v text);
 perform * from dblink_get_result('c',false) as t(v text);
 if dblink_error_message('c') not like '%bootstrap divergente%' then raise exception 'pedido divergente não rejeitado'; end if;
 perform * from dblink_get_result('c',false) as t(v text);
 if (select count(*) from identidade.concessao_equipe) <> 1 or (select count(*) from identidade.excecao_tecnica) <> 1 or (select count(*) from auditoria.evento where acao='bootstrap.tecnico') <> 2 then raise exception 'inconsistência concorrente'; end if;
 if (select count(*) from auth.users) <> 2 or not exists(select 1 from auth.users where id='51000000-0000-4000-8000-000000000001') then raise exception 'identidade Auth modificada'; end if;
end $$;
select dblink_disconnect('a');
select dblink_disconnect('b');
select dblink_disconnect('c');
