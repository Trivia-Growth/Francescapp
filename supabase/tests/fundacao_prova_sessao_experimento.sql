-- Somente banco e provas fictícias em cluster local descartável.
\set ON_ERROR_STOP on
do $$ begin
 if current_database() <> 'ffcm_prova_teste_local' or inet_server_addr() is not null
    or current_setting('unix_socket_directories') not like '/tmp/ffcm-prova.%' then
   raise exception 'Cluster local descartável obrigatório';
 end if;
end $$;
create schema experimento_prova;
create schema extensions;
create extension pgcrypto with schema extensions;
create table experimento_prova.sessao(id uuid primary key, usuario uuid not null, ativa boolean not null,
 geracao bigint not null, prova_hash bytea not null, tentativa uuid, estado text not null, envelope jsonb not null default '{}'::jsonb);
create table experimento_prova.tentativa(sessao uuid not null, id uuid not null, geracao bigint not null, estado text not null, primary key(sessao,id));
create function experimento_prova.suprimir_fixture() returns trigger language plpgsql as $$
begin if current_setting('ffcm_teste.falha',true)='sim' then return null; end if; return new; end $$;
create trigger impedir_update_fixture before update on experimento_prova.tentativa for each row execute function experimento_prova.suprimir_fixture();
\ir ../drafts/20261101160000_prova_sessao_experimento.sql
create extension dblink;
insert into experimento_prova.sessao (id,usuario,ativa,geracao,prova_hash,tentativa,estado) values ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',true,1,extensions.digest(repeat('a',32)::bytea,'sha256'),null,'disponivel');
insert into experimento_prova.sessao (id,usuario,ativa,geracao,prova_hash,tentativa,estado) values ('30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',true,1,extensions.digest(repeat('a',32)::bytea,'sha256'),null,'disponivel');
insert into experimento_prova.sessao (id,usuario,ativa,geracao,prova_hash,tentativa,estado) values ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',true,1,extensions.digest(repeat('c',32)::bytea,'sha256'),null,'disponivel');
do $$
declare c text:=format('host=%s port=%s dbname=%s',current_setting('unix_socket_directories'),current_setting('port'),current_database());
 a integer; b integer; bloqueado boolean; ok boolean;
begin
 perform dblink_connect('pa',c); perform dblink_connect('pb',c);
 select pid into a from dblink('pa','select pg_backend_pid()') as t(pid integer);
 select pid into b from dblink('pb','select pg_backend_pid()') as t(pid integer);
 perform dblink_exec('pa','begin');
 select v into ok from dblink('pa',$q$select experimento_prova.iniciar('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',1,repeat('a',32)::bytea,'20000000-0000-4000-8000-000000000003')$q$) as t(v boolean);
 if ok is distinct from true then raise exception 'início concorrente recusado'; end if;
 select v into ok from dblink('pa',$q$select experimento_prova.liberar('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',1,repeat('a',32)::bytea,'20000000-0000-4000-8000-000000000003',extensions.digest(repeat('b',32)::bytea,'sha256'),'{}'::jsonb)$q$) as t(v boolean);
 if ok is distinct from true then raise exception 'liberação inicial falhou'; end if;
 perform dblink_send_query('pb',$q$select experimento_prova.iniciar('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',1,repeat('a',32)::bytea,'20000000-0000-4000-8000-000000000004')$q$);
 bloqueado:=false;
 for i in 1..100 loop select a=any(pg_blocking_pids(b)) into bloqueado; exit when bloqueado; perform pg_sleep(0.02); end loop;
 if not bloqueado then raise exception 'segunda instância não esperou transação'; end if;
 perform dblink_exec('pa','commit');
 select v into ok from dblink_get_result('pb') as t(v boolean);
 if ok is distinct from false then raise exception 'prova anterior renovou depois do commit'; end if;
 perform * from dblink_get_result('pb') as t(v boolean);
 select v into ok from dblink('pa',$q$select experimento_prova.iniciar('30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',1,repeat('a',32)::bytea,'30000000-0000-4000-8000-000000000003')$q$) as t(v boolean);
 if ok is distinct from true then raise exception 'troca para revogação não iniciou'; end if;
 perform dblink_exec('pa','begin');
 perform dblink_exec('pa',$q$update experimento_prova.sessao set ativa=false where id='30000000-0000-4000-8000-000000000001'$q$);
 perform dblink_send_query('pb',$q$select experimento_prova.liberar('30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',1,repeat('a',32)::bytea,'30000000-0000-4000-8000-000000000003',extensions.digest(repeat('b',32)::bytea,'sha256'),'{}'::jsonb)$q$);
 bloqueado:=false;
 for i in 1..100 loop select a=any(pg_blocking_pids(b)) into bloqueado; exit when bloqueado; perform pg_sleep(0.02); end loop;
 if not bloqueado then raise exception 'liberação não aguardou revogação'; end if;
 perform dblink_exec('pa','commit');
 select v into ok from dblink_get_result('pb') as t(v boolean);
 if ok is distinct from false then raise exception 'liberação após revogação aceita'; end if;
 perform dblink_disconnect('pa'); perform dblink_disconnect('pb');
end $$;
insert into experimento_prova.sessao (id,usuario,ativa,geracao,prova_hash,tentativa,estado) values ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',true,1,extensions.digest(repeat('a',32)::bytea,'sha256'),null,'disponivel');
do $$
declare s uuid:='10000000-0000-4000-8000-000000000001'; u uuid:='10000000-0000-4000-8000-000000000002';
 t uuid:='10000000-0000-4000-8000-000000000003'; antiga bytea:=repeat('a',32)::bytea; nova bytea:=repeat('b',32)::bytea;
begin
 if experimento_prova.autorizar(s,u,1,antiga) is distinct from true then raise exception 'prova válida recusada'; end if;
 if experimento_prova.autorizar(s,u,1,nova) is distinct from false
    or experimento_prova.autorizar(s,u,1,null) is distinct from false
    or experimento_prova.autorizar(s,'10000000-0000-4000-8000-000000000099',1,antiga) is distinct from false then raise exception 'prova inválida aceita'; end if;
 if experimento_prova.autorizar('40000000-0000-4000-8000-000000000001',u,1,antiga) is distinct from false
    or experimento_prova.autorizar(s,u,1,repeat('c',32)::bytea) is distinct from false
    or experimento_prova.autorizar('40000000-0000-4000-8000-000000000001',u,1,repeat('c',32)::bytea) is distinct from true then
   raise exception 'prova cruzada entre sessões aceita';
 end if;
 if experimento_prova.iniciar(s,u,1,antiga,t) is distinct from true then raise exception 'início recusado'; end if;
 if experimento_prova.iniciar(s,u,1,antiga,'10000000-0000-4000-8000-000000000004') is distinct from false then raise exception 'duas trocas aceitas'; end if;
 perform set_config('ffcm_teste.falha','sim',true);
 begin
   perform experimento_prova.liberar(s,u,1,antiga,t,extensions.digest(nova,'sha256'),'{"ciphertext":"fake"}');
   raise exception 'atualização parcial aceita';
 exception when sqlstate 'P0002' then
   if sqlerrm <> 'TENTATIVA_NAO_CONCLUIDA' then raise; end if;
 end;
 if not exists (select 1 from experimento_prova.sessao where id=s and geracao=1 and estado='em_troca'
   and prova_hash=extensions.digest(antiga,'sha256') and envelope='{}'::jsonb) then raise exception 'atualização parcial não revertida'; end if;
 perform set_config('ffcm_teste.falha','não',true);
 if experimento_prova.liberar(s,u,1,antiga,t,extensions.digest(nova,'sha256'),'{"ciphertext":"fake"}') is distinct from true then raise exception 'liberação recusada'; end if;
 if not exists (select 1 from experimento_prova.sessao where id=s and geracao=2 and prova_hash=extensions.digest(nova,'sha256') and envelope='{"ciphertext":"fake"}'::jsonb)
    or not exists (select 1 from experimento_prova.tentativa where sessao=s and id=t and geracao=1 and estado='concluida') then
   raise exception 'geração, envelope e tentativa não foram persistidos juntos';
 end if;
 -- Com resposta perdida a aba só tem prova antiga; nenhuma prova nova é persistida em claro.
 if experimento_prova.autorizar(s,u,1,antiga) is distinct from false
    or experimento_prova.iniciar(s,u,1,antiga,'10000000-0000-4000-8000-000000000004') is distinct from false
    or experimento_prova.autorizar(s,u,2,nova) is distinct from true then raise exception 'geração não isolada'; end if;
 update experimento_prova.sessao set ativa=false where id=s;
 if experimento_prova.autorizar(s,u,2,nova) is distinct from false
    or experimento_prova.iniciar(s,u,2,nova,'10000000-0000-4000-8000-000000000005') is distinct from false then raise exception 'revogação ignorada'; end if;
end $$;
