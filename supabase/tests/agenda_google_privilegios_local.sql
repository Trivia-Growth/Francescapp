\set ON_ERROR_STOP on
\ir cadeia_migrations_local.sql
-- Apenas superfície Vault de teste; este teste não comprova Vault real.
create table vault.secrets (id uuid primary key);
create function vault.create_secret(text,text,text,uuid) returns uuid language sql as $$ select gen_random_uuid() $$;
create function vault.update_secret(uuid,text,text,text,uuid) returns void language sql as $$ select $$;
\ir ../drafts/20261115100000_agenda_google_conexao.sql
do $$
declare papel text; tabela text;
begin
 for papel in select unnest(array['anon','authenticated','service_role','ffcmapp_agenda_google_executor']) loop
  foreach tabela in array array['agenda_google_state','agenda_google_credencial','agenda_google_geracao','agenda_google_requisicao','agenda_google_escrita','agenda_google_vinculo_paciente','agenda_google_desconexao_recibo'] loop
   if has_table_privilege(papel,format('identidade.%I',tabela),'select,insert,update,delete') then
    raise exception 'ACESSO_DIRETO_INDEVIDO: % %',papel,tabela;
   end if;
  end loop;
 end loop;
 if not has_function_privilege('ffcmapp_agenda_google_executor','identidade.agenda_google_operacao_privada(jsonb,text)','execute')
  or has_function_privilege('authenticated','identidade.agenda_google_operacao_privada(jsonb,text)','execute')
  or has_function_privilege('anon','identidade.agenda_google_operacao_privada(jsonb,text)','execute')
  or has_function_privilege('service_role','identidade.agenda_google_operacao_privada(jsonb,text)','execute')
  or has_function_privilege('ffcmapp_agenda_google_executor','identidade.agenda_google_ler_credencial()','execute') then
   raise exception 'EXECUCAO_INDEVIDA';
 end if;
end $$;
