-- Somente catálogo PostgreSQL. Não consulta pessoas, casos, dados clínicos ou Vault.
-- ACL/RLS estrutural não comprova autorização funcional ou revogação.
WITH wrappers(assinatura,owner_esperado,rls_esperado) AS (VALUES
 ('api.listar_pacientes(jsonb)','ffcmapp_api_carteira_owner',true),
 ('api.cadastro_composicao(jsonb)','ffcmapp_api_cadastro_owner',true),
 ('api.edicao_paciente_composicao_privada(jsonb)','ffcmapp_edicao_paciente_owner',true),
 ('api.editar_paciente_privado(jsonb)','ffcmapp_edicao_paciente_owner',true),
 ('api.consultar_paciente_edicao_privado(jsonb)','ffcmapp_edicao_paciente_owner',true),
 ('api.contexto_cuidado_privado(jsonb)','ffcmapp_contexto_cuidado_owner',true),
 ('api.rede_cuidado_privado(jsonb)','ffcmapp_rede_cuidado_owner',true),
 ('api.diario_privado(jsonb)','ffcmapp_diario_owner',true),
 ('api.saude_operacao_privada(jsonb)','ffcmapp_saude_owner',true),
 ('api.plano_crise_operacao_privada(jsonb)','ffcmapp_plano_crise_owner',true),
 ('api.habilitacao_plano_crise_privado(jsonb)','ffcmapp_habilitacao_crise_owner',true),
 ('api.configuracao_sistema_privado(jsonb)','ffcmapp_configuracao_sistema_owner',true),
 ('api.anamnese_privada(jsonb)','ffcmapp_anamnese_owner',true),
 ('api.historico_anamnese_privada(jsonb)','ffcmapp_anamnese_owner',true),
 ('api.segredos_integracoes_privado(jsonb)','ffcmapp_segredos_integracoes_owner',true),
 ('identidade.agenda_google_operacao_privada(jsonb,text)','ffcmapp_agenda_google_owner',false)
), checagem_wrappers AS (
 SELECT w.assinatura,p.oid,
  array_remove(ARRAY[
   CASE WHEN p.oid IS NULL THEN 'ausente' END,
   CASE WHEN r.rolname IS DISTINCT FROM w.owner_esperado THEN 'owner_divergente' END,
   CASE WHEN r.rolcanlogin OR r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb THEN 'owner_privilegiado' END,
   CASE WHEN p.prosecdef IS DISTINCT FROM true THEN 'nao_security_definer' END,
   CASE WHEN NOT coalesce('search_path=""'=ANY(p.proconfig),false) THEN 'search_path_divergente' END,
   CASE WHEN w.rls_esperado AND NOT coalesce('row_security=on'=ANY(p.proconfig),false) THEN 'row_security_setting_ausente' END,
   CASE WHEN has_function_privilege('anon',p.oid,'EXECUTE') THEN 'anon_execute' END,
   CASE WHEN has_function_privilege('service_role',p.oid,'EXECUTE') THEN 'service_role_execute' END
  ],NULL) AS motivos
 FROM wrappers w LEFT JOIN pg_proc p ON p.oid=to_regprocedure(w.assinatura)
 LEFT JOIN pg_roles r ON r.oid=p.proowner
), tabelas(nome,controle_esperado,force_esperado) AS (VALUES
 ('cadastro.paciente','rls',false), ('cadastro.contato_paciente','rls',false),
 ('cadastro.acesso_paciente','rls',false),
 ('cadastro.contexto_cuidado_versao','rls',false), ('cadastro.rede_cuidado_versao','rls',false),
 ('cadastro.diario_registro','rls',false), ('cadastro.diario_registro_versao','rls',false),
 ('cadastro.diario_consulta','rls',false), ('cadastro.diario_rascunho_textual','rls',true),
 ('cadastro.saude_versao','rls',false), ('cadastro.plano_crise_versao','rls',false),
 ('cadastro.plano_crise_aprovacao','rls',false), ('cadastro.anamnese_versao','rls',false),
 ('identidade.configuracao_sistema','rls',false),
 ('identidade.segredos_integracoes','rls',false), ('identidade.segredo_integracao_versao','rls',false),
 ('identidade.agenda_google_desconexao_recibo','acl_privada',false),
 ('identidade.agenda_google_vinculo_paciente','acl_privada',false),
 ('identidade.agenda_google_escrita','acl_privada',false),
 ('identidade.agenda_google_requisicao','acl_privada',false),
 ('identidade.agenda_google_geracao','acl_privada',false),
 ('identidade.agenda_google_state','acl_privada',false),
 ('identidade.agenda_google_credencial','acl_privada',false),
 ('identidade.agenda_google_vault_vinculo','acl_privada',false),
 ('identidade.agenda_google_vault_requisicao','acl_privada',false),
 ('identidade.agenda_google_vault_desconexao','acl_privada',false)
), checagem_tabelas AS (
 SELECT t.*,c.oid,c.relrowsecurity,c.relforcerowsecurity,
  array_remove(ARRAY[
   CASE WHEN c.oid IS NULL THEN 'ausente' END,
   CASE WHEN t.controle_esperado='rls' AND c.relrowsecurity IS DISTINCT FROM true THEN 'rls_desligada' END,
   CASE WHEN t.force_esperado AND c.relforcerowsecurity IS DISTINCT FROM true THEN 'force_rls_desligada' END
  ],NULL) AS motivos,
  coalesce((SELECT jsonb_agg(jsonb_build_object('papel',papel,'privilegio_direto',true) ORDER BY papel)
   FROM unnest(ARRAY['anon','authenticated','service_role','ffcmapp_vault_login']) papel
   WHERE c.oid IS NOT NULL AND (
    has_table_privilege(papel,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_any_column_privilege(papel,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
   )), '[]'::jsonb) AS acessos_diretos
 FROM tabelas t LEFT JOIN pg_class c ON c.oid=to_regclass(t.nome)
)
SELECT jsonb_build_object(
 'escopo','Somente prova estrutural ACL/RLS; não funcional',
 'wrappers_esperados',(SELECT count(*) FROM wrappers),
 'wrappers_encontrados',(SELECT count(oid) FROM checagem_wrappers),
 'divergencias_wrappers',coalesce((SELECT jsonb_agg(jsonb_build_object('assinatura',assinatura,'motivos',motivos) ORDER BY assinatura) FROM checagem_wrappers WHERE cardinality(motivos)>0),'[]'::jsonb),
 'tabelas_esperadas',(SELECT count(*) FROM tabelas),
 'tabelas_encontradas',(SELECT count(oid) FROM checagem_tabelas),
 'divergencias_tabelas',coalesce((SELECT jsonb_agg(jsonb_build_object('tabela',nome,'motivos',motivos,'acessos_diretos',acessos_diretos) ORDER BY nome) FROM checagem_tabelas WHERE cardinality(motivos)>0 OR acessos_diretos<>'[]'::jsonb),'[]'::jsonb),
 'rls_force_metadados',(SELECT jsonb_agg(jsonb_build_object('tabela',nome,'controle',controle_esperado,'rls',relrowsecurity,'force',relforcerowsecurity) ORDER BY nome) FROM checagem_tabelas)
);
