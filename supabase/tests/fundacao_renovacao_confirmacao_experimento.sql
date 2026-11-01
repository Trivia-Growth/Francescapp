-- Experimento local: tabelas simuladas, não usar Supabase ou dados reais.
\set ON_ERROR_STOP on
do $$ begin
 if current_database() <> 'ffcm_renovacao_teste_local' or inet_server_addr() is not null
    or current_setting('unix_socket_directories') not like '/tmp/ffcm-renovacao.%' then
   raise exception 'Cluster local descartável obrigatório';
 end if;
end $$;
create schema experimento_renovacao;
create table experimento_renovacao.sessao (id uuid primary key, usuario_id uuid not null, ativa boolean not null);
create table experimento_renovacao.credencial (sessao_id uuid primary key references experimento_renovacao.sessao,
 geracao bigint not null, tentativa uuid, estado text not null, envelope jsonb not null);
\ir ../drafts/20261101150000_renovacao_confirmacao_experimento.sql
create extension dblink;
insert into experimento_renovacao.sessao values ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',true);
insert into experimento_renovacao.credencial values ('20000000-0000-4000-8000-000000000001',0,null,'disponivel','{"ciphertext":"ficticio"}');
do $$
declare
 conn text:=format('host=%s port=%s dbname=%s',current_setting('unix_socket_directories'),current_setting('port'),current_database());
 a integer; b integer; bloqueado boolean; estado text; liberado boolean;
 s text:='20000000-0000-4000-8000-000000000001'; u text:='20000000-0000-4000-8000-000000000002'; t text:='20000000-0000-4000-8000-000000000003';
begin
 perform dblink_connect('ra',conn); perform dblink_connect('rb',conn);
 select pid into a from dblink('ra','select pg_backend_pid()') as x(pid integer);
 select pid into b from dblink('rb','select pg_backend_pid()') as x(pid integer);
 perform * from dblink('ra',format('select experimento_renovacao.iniciar(%L,%L,%L)',s,u,t)) as x(g bigint);
 perform dblink_exec('ra','begin');
 select v into liberado from dblink('ra',format('select experimento_renovacao.persistir(%L,%L,%L,1,%L::jsonb)',s,u,t,'{"ciphertext":"novo"}')) as x(v boolean);
 if liberado is distinct from true then raise exception 'persistência concorrente falhou'; end if;
 perform dblink_send_query('rb',format('select experimento_renovacao.confirmar(%L,%L,%L,1,%L::jsonb)',s,u,t,'{"ciphertext":"novo"}'));
 bloqueado:=false;
 for i in 1..100 loop select a=any(pg_blocking_pids(b)) into bloqueado; exit when bloqueado; perform pg_sleep(0.02); end loop;
 if not bloqueado then raise exception 'consulta não aguardou transação'; end if;
 perform dblink_exec('ra','commit');
 select v into estado from dblink_get_result('rb') as x(v text);
 if estado is distinct from 'persistida' then raise exception 'commit não comprovado'; end if;
 perform * from dblink_get_result('rb') as x(v text);
 perform dblink_exec('ra','begin');
 perform dblink_exec('ra',format('update experimento_renovacao.sessao set ativa=false where id=%L',s));
 perform dblink_send_query('rb',format('select experimento_renovacao.liberar(%L,%L,%L,1,%L::jsonb)',s,u,t,'{"ciphertext":"novo"}'));
 bloqueado:=false;
 for i in 1..100 loop select a=any(pg_blocking_pids(b)) into bloqueado; exit when bloqueado; perform pg_sleep(0.02); end loop;
 if not bloqueado then raise exception 'liberação não aguardou revogação'; end if;
 perform dblink_exec('ra','commit');
 select v into liberado from dblink_get_result('rb') as x(v boolean);
 if liberado is distinct from false then raise exception 'revogação concorrente ignorada'; end if;
 perform dblink_disconnect('ra'); perform dblink_disconnect('rb');
end $$;
insert into experimento_renovacao.sessao values ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',true);
insert into experimento_renovacao.credencial values ('10000000-0000-4000-8000-000000000001',0,null,'disponivel','{"ciphertext":"ficticio"}');
do $$
declare s uuid:='10000000-0000-4000-8000-000000000001'; u uuid:='10000000-0000-4000-8000-000000000002'; t uuid:='10000000-0000-4000-8000-000000000003'; g bigint;
begin
 g:=experimento_renovacao.iniciar(s,u,t);
 if g is distinct from 1 then raise exception 'início recusado'; end if;
 if experimento_renovacao.iniciar(s,u,'10000000-0000-4000-8000-000000000004') is not null then raise exception 'troca concorrente aceita'; end if;
 if experimento_renovacao.confirmar(s,u,t,g,'{"ciphertext":"novo"}') is distinct from 'indeterminada' then raise exception 'resultado incerto aceito'; end if;
 if experimento_renovacao.persistir(s,u,t,g,'{"ciphertext":"novo"}') is distinct from true then raise exception 'persistência recusada'; end if;
 -- Simula resposta de commit perdida: consulta ao primário prova a transição.
 if experimento_renovacao.confirmar(s,u,t,g,'{"ciphertext":"novo"}') is distinct from 'persistida' then raise exception 'persistência não confirmada'; end if;
 if experimento_renovacao.persistir(s,u,t,g,'{"ciphertext":"novo"}') is distinct from true then raise exception 'persistência idempotente falhou'; end if;
 if experimento_renovacao.persistir(s,u,t,g,'{"ciphertext":"outro"}') is distinct from false then raise exception 'envelope divergente aceito'; end if;
 if experimento_renovacao.liberar(s,u,t,g,'{"ciphertext":"outro"}') is distinct from false then raise exception 'liberação de envelope divergente aceita'; end if;
 if experimento_renovacao.liberar(s,u,t,g,'{"ciphertext":"novo"}') is distinct from true then raise exception 'liberação recusada'; end if;
 -- Simula perda da resposta da própria liberação.
 if experimento_renovacao.confirmar(s,u,t,g,'{"ciphertext":"novo"}') is distinct from 'liberada'
    or experimento_renovacao.liberar(s,u,t,g,'{"ciphertext":"novo"}') is distinct from true then raise exception 'liberação não confirmada'; end if;
 if experimento_renovacao.iniciar(s,u,'10000000-0000-4000-8000-000000000004') is distinct from 2 then raise exception 'nova geração recusada'; end if;
 if experimento_renovacao.confirmar(s,u,t,g,'{"ciphertext":"novo"}') is distinct from 'indeterminada'
    or experimento_renovacao.liberar(s,u,t,g,'{"ciphertext":"novo"}') is distinct from false then raise exception 'geração antiga confirmou após nova troca'; end if;
 update experimento_renovacao.sessao set ativa=false where id=s;
 if experimento_renovacao.confirmar(s,u,t,g,'{"ciphertext":"novo"}') is distinct from 'indeterminada'
    or experimento_renovacao.liberar(s,u,t,g,'{"ciphertext":"novo"}') is distinct from false then raise exception 'sessão revogada liberada'; end if;
end $$;
