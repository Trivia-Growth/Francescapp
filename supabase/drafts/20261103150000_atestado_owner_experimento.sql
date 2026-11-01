-- FIXTURE somente: a função de leitura é um segredo fictício, não Vault real.
-- Sem concessão a runtime e sem comprovar canal ou produção.
create role ffcm_atestado_chave_owner_local nologin nosuperuser nobypassrls;
revoke all on function experimento_atestado.ler_chave_interna(text) from public,anon,authenticated;
revoke all on function experimento_atestado.assinar_fixture(jsonb) from public,anon,authenticated;
grant usage on schema experimento_atestado,extensions to ffcm_atestado_chave_owner_local;
grant execute on function experimento_atestado.ler_chave_interna(text),
 experimento_atestado.verificar(text,text,jsonb,jsonb,text,bytea) to ffcm_atestado_chave_owner_local;
grant create on schema experimento_atestado to ffcm_atestado_chave_owner_local;
alter function experimento_atestado.verificar_com_chave_interna(text,text,jsonb,jsonb,text) owner to ffcm_atestado_chave_owner_local;
revoke create on schema experimento_atestado from ffcm_atestado_chave_owner_local;
