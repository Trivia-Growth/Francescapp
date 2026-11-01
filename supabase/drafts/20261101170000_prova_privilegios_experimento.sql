-- EXPERIMENTO EM CLUSTER DESCARTÁVEL. NÃO executar em Supabase.
-- Não resolve logs de parâmetros, Auth, Vault, RLS ou privilégio real.
create role ffcm_prova_owner_fixture nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role ffcm_prova_runtime_fixture nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
revoke all on schema experimento_prova from public;
revoke all on all tables in schema experimento_prova from public, ffcm_prova_runtime_fixture;
revoke all on all functions in schema experimento_prova from public, ffcm_prova_runtime_fixture;
grant usage, create on schema experimento_prova to ffcm_prova_owner_fixture;
grant usage on schema experimento_prova to ffcm_prova_runtime_fixture;
grant usage on schema extensions to ffcm_prova_owner_fixture;
grant execute on function extensions.digest(bytea,text) to ffcm_prova_owner_fixture;
grant select,update on experimento_prova.sessao to ffcm_prova_owner_fixture;
grant select,insert,update on experimento_prova.tentativa to ffcm_prova_owner_fixture;
alter function experimento_prova.autorizar(uuid,uuid,bigint,bytea) owner to ffcm_prova_owner_fixture;
alter function experimento_prova.iniciar(uuid,uuid,bigint,bytea,uuid) owner to ffcm_prova_owner_fixture;
alter function experimento_prova.liberar(uuid,uuid,bigint,bytea,uuid,bytea,jsonb) owner to ffcm_prova_owner_fixture;
alter function experimento_prova.autorizar(uuid,uuid,bigint,bytea) security definer;
alter function experimento_prova.iniciar(uuid,uuid,bigint,bytea,uuid) security definer;
alter function experimento_prova.liberar(uuid,uuid,bigint,bytea,uuid,bytea,jsonb) security definer;
revoke create on schema experimento_prova from ffcm_prova_owner_fixture;
grant execute on function experimento_prova.autorizar(uuid,uuid,bigint,bytea),
 experimento_prova.iniciar(uuid,uuid,bigint,bytea,uuid),
 experimento_prova.liberar(uuid,uuid,bigint,bytea,uuid,bytea,jsonb) to ffcm_prova_runtime_fixture;
