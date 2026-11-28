-- Registra no histórico as duas migrations renumeradas, SEM executá-las.
--
-- `20261125030001_grant_barreira_equipe` e `20261125040001_grant_criar_concessao_equipe` nasceram
-- com o número de outra migration (`20261125030000_audio_expurgo_privado` e
-- `20261125040000_plano_crise_case_manager_atual`) e foram aplicadas à mão em produção em
-- 24-25/11/2026, sem linha no histórico. Reexecutá-las aborta pela própria guarda
-- (`ACL_INICIAL_INESPERADA`), porque o grant já existe. Este bloco só confere que o efeito está
-- no banco e grava as duas versões. Um único comando: atômico por si.
--
-- Executar como `postgres`, somente com autorização explícita para o ambiente.
-- Reversão: delete from supabase_migrations.schema_migrations where version in ('20261125030001','20261125040001');
do $$
begin
 if current_user <> 'postgres' then raise exception 'PAPEL_INESPERADO: %', current_user; end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version in ('20261125030001','20261125040001')) then
  raise exception 'VERSAO_JA_REGISTRADA';
 end if;
 -- O efeito das duas: EXECUTE de authenticated concedido pelo owner dedicado, e nada além.
 if not exists(select 1 from pg_proc p, aclexplode(p.proacl) x
   where p.oid='api.equipe_barreira_composicao(jsonb)'::regprocedure and x.grantee='authenticated'::regrole
     and x.grantor=p.proowner and p.proowner='ffcmapp_equipe_barreira_owner'::regrole and x.privilege_type='EXECUTE')
  or not exists(select 1 from pg_proc p, aclexplode(p.proacl) x
   where p.oid='api.criar_concessao_equipe_privado(jsonb)'::regprocedure and x.grantee='authenticated'::regrole
     and x.grantor=p.proowner and p.proowner='ffcmapp_criar_equipe_owner'::regrole and x.privilege_type='EXECUTE') then
  raise exception 'EFEITO_AUSENTE: aplicar a migration em vez de só registrar';
 end if;
 if has_function_privilege('anon','api.equipe_barreira_composicao(jsonb)','execute')
  or has_function_privilege('anon','api.criar_concessao_equipe_privado(jsonb)','execute')
  or has_function_privilege('service_role','api.equipe_barreira_composicao(jsonb)','execute')
  or has_function_privilege('service_role','api.criar_concessao_equipe_privado(jsonb)','execute') then
  raise exception 'ACL_MAIS_AMPLA_QUE_A_MIGRATION';
 end if;
 insert into supabase_migrations.schema_migrations(version, name) values
  ('20261125030001','grant_barreira_equipe'),
  ('20261125040001','grant_criar_concessao_equipe');
end $$;
