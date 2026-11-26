\set ON_ERROR_STOP on
\ir auditoria_criar_equipe_auth_local.sql
-- Simula migrador dono dos objetos afetados, sem superusuário nem BYPASSRLS.
create role barreira_equipe_migrador nologin nosuperuser nocreatedb createrole noinherit nobypassrls;
grant barreira_equipe_migrador to current_user with inherit false, set true;
grant ffcmapp_atestado_verificador_owner to barreira_equipe_migrador with admin true, inherit false, set false;
grant usage,create on schema operacao,api to barreira_equipe_migrador with grant option;
grant usage on schema public,identidade,auditoria,auth_privado,bloqueios_auth to barreira_equipe_migrador with grant option;
grant execute on function auth_privado.uid(),auth_privado.jwt(),auth_privado.identidades(),auth_privado.sessoes(),bloqueios_auth.travar(uuid,uuid) to barreira_equipe_migrador with grant option;
alter table public.usuario owner to barreira_equipe_migrador;
alter table identidade.configuracao_auth_nativo owner to barreira_equipe_migrador;
alter table identidade.concessao_equipe owner to barreira_equipe_migrador;
alter table identidade.sessao owner to barreira_equipe_migrador;
alter table identidade.excecao_tecnica owner to barreira_equipe_migrador;
alter table auditoria.evento owner to barreira_equipe_migrador;
alter function operacao.criar_concessao_equipe_privado(jsonb) owner to barreira_equipe_migrador;
set role barreira_equipe_migrador;
\ir ../migrations/20261112350000_barreira_concessao_equipe_privada.sql
do $$ begin
 if current_user<>'barreira_equipe_migrador' or pg_has_role(current_user,'ffcmapp_equipe_barreira_owner','SET') or pg_has_role(current_user,'ffcmapp_atestado_verificador_owner','SET') then raise exception 'MIGRADOR_OU_MEMBERSHIP_INCORRETO'; end if;
 if has_function_privilege('authenticated','api.equipe_barreira_composicao(jsonb)','EXECUTE') or has_function_privilege('anon','api.equipe_barreira_composicao(jsonb)','EXECUTE') or has_function_privilege('service_role','api.equipe_barreira_composicao(jsonb)','EXECUTE') then raise exception 'WRAPPER_EXPOSTO'; end if;
end $$;
reset role;
