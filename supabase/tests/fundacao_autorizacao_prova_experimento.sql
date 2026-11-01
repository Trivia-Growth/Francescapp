-- Fixture local; claims simulados NÃO representam gateway JWT seguro.
\set ON_ERROR_STOP on
\set ffcm_concorrente true
\ir fundacao_cadastro_transacao_experimento.sql
create table identidade.prova_fixture(session_id uuid primary key, usuario_id uuid not null, geracao bigint not null, verificador bytea not null);
insert into identidade.prova_fixture values ('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',1,extensions.digest(repeat('x',32)::bytea,'sha256'));
grant select,update on identidade.prova_fixture to ffcm_teste_owner;
set role ffcm_teste_owner;
\ir ../drafts/20261101190000_autorizacao_prova_experimento.sql
grant execute on function experimento_atestado.sessao_com_prova_fixture(bigint,bytea) to ffcm_teste_runtime;
reset role;
set role ffcm_teste_runtime;
select set_config('ffcm_teste.usuario','10000000-0000-4000-8000-000000000001',false);
select set_config('ffcm_teste.sessao','10000000-0000-4000-8000-000000000002',false);
select set_config('ffcm_teste.ativa','sim',false);
do $$ begin
 if experimento_atestado.sessao_com_prova_fixture(1,repeat('x',32)::bytea) is distinct from true
    or experimento_atestado.sessao_com_prova_fixture(1,repeat('y',32)::bytea) is distinct from false
    or experimento_atestado.sessao_com_prova_fixture(2,repeat('x',32)::bytea) is distinct from false
    or experimento_atestado.sessao_com_prova_fixture(1,null) is distinct from false then raise exception 'prova não vinculada'; end if;
 begin perform * from identidade.prova_fixture; raise exception 'leitura direta aceita'; exception when insufficient_privilege then null; end;
 perform set_config('ffcm_teste.usuario','10000000-0000-4000-8000-000000000099',true);
 if experimento_atestado.sessao_com_prova_fixture(1,repeat('x',32)::bytea) is distinct from false then raise exception 'outro usuário aceito'; end if;
end $$;
reset role;
update identidade.sessao set revogada_em=clock_timestamp() where session_id='10000000-0000-4000-8000-000000000002';
set role ffcm_teste_runtime;
do $$ begin
 if experimento_atestado.sessao_com_prova_fixture(1,repeat('x',32)::bytea) is distinct from false then raise exception 'JWT antigo após revogação aceito'; end if;
end $$;
reset role;
