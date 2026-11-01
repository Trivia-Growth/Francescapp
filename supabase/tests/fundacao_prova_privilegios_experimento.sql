-- Cluster local descartável, sem dados reais nem integração de runtime.
\set ON_ERROR_STOP on
\ir fundacao_prova_sessao_experimento.sql
\ir ../drafts/20261101170000_prova_privilegios_experimento.sql
insert into experimento_prova.sessao (id,usuario,ativa,geracao,prova_hash,estado)
values ('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',true,1,extensions.digest(repeat('x',32)::bytea,'sha256'),'disponivel');
do $$ begin
 if (select rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolbypassrls from pg_roles where rolname='ffcm_prova_owner_fixture') is distinct from false
    or has_table_privilege('ffcm_prova_runtime_fixture','experimento_prova.sessao','select,insert,update,delete')
    or has_table_privilege('ffcm_prova_runtime_fixture','experimento_prova.tentativa','select,insert,update,delete')
    or has_function_privilege('public','experimento_prova.autorizar(uuid,uuid,bigint,bytea)','execute') then
   raise exception 'privilégio inadequado';
 end if;
end $$;
set role ffcm_prova_runtime_fixture;
do $$ begin
 if experimento_prova.autorizar('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',1,repeat('x',32)::bytea) is distinct from true
    or experimento_prova.autorizar('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',1,repeat('z',32)::bytea) is distinct from false then
   raise exception 'autorização do runtime incorreta';
 end if;
 begin perform * from experimento_prova.sessao; raise exception 'acesso direto aceito';
 exception when insufficient_privilege then null; end;
 begin update experimento_prova.sessao set ativa=true; raise exception 'escrita direta aceita';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
update experimento_prova.sessao set ativa=false where id='50000000-0000-4000-8000-000000000001';
set role ffcm_prova_runtime_fixture;
do $$ begin
 if experimento_prova.autorizar('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',1,repeat('x',32)::bytea) is distinct from false then
   raise exception 'revogação ignorada';
 end if;
end $$;
reset role;
