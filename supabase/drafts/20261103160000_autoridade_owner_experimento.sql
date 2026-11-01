-- FIXTURE isolada; não habilita RPC nem valida gateway/JWT ou Vault real.
-- O owner da prova já possui exatamente os campos da consulta de sessão.
grant create on schema identidade to ffcm_prova_owner_local;
alter function identidade.sessao_atual_valida() owner to ffcm_prova_owner_local;
alter function identidade.sessao_atual_valida() set search_path=pg_catalog;
revoke create on schema identidade from ffcm_prova_owner_local;
create role ffcm_autoridade_owner_local nologin nosuperuser nobypassrls;
grant usage on schema auth,identidade,experimento_atestado to ffcm_autoridade_owner_local;
grant execute on function identidade.sessao_atual_valida(),
 experimento_atestado.verificar_com_chave_interna(text,text,jsonb,jsonb,text),
 experimento_atestado.prazo_maximo_teste() to ffcm_autoridade_owner_local;
grant create on schema experimento_atestado to ffcm_autoridade_owner_local;
alter function experimento_atestado.verificar_criar_paciente(text,text,jsonb,jsonb,text) owner to ffcm_autoridade_owner_local;
revoke create on schema experimento_atestado from ffcm_autoridade_owner_local;
