\set ON_ERROR_STOP on
\ir cadeia_migrations_local.sql
-- Apenas superfície Vault de teste; este teste não comprova Vault real.
create table vault.secrets (id uuid primary key, secret text);
create or replace view vault.decrypted_secrets as select null::text as name, secret as decrypted_secret, id from vault.secrets;
create function vault.create_secret(text,text,text,uuid) returns uuid language sql as $$ select gen_random_uuid() $$;
create function vault.update_secret(uuid,text,text,text,uuid) returns void language sql as $$ select $$;
revoke execute on function vault.update_secret(uuid,text,text,text,uuid) from public;
-- Membership anterior deve sobreviver com opções e concedente intactos.
grant ffcmapp_atestado_verificador_owner to postgres with inherit false, set true;
create temporary table agenda_membership_antes as
 select m.* from pg_auth_members m join pg_roles r on r.oid=m.roleid
 join pg_roles u on u.oid=m.member where r.rolname='ffcmapp_atestado_verificador_owner' and u.rolname='postgres';
\ir ../drafts/20261115100000_agenda_google_conexao.sql
do $$ begin
 if exists ((select * from agenda_membership_antes except select m.* from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member where r.rolname='ffcmapp_atestado_verificador_owner' and u.rolname='postgres')
 union all (select m.* from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member where r.rolname='ffcmapp_atestado_verificador_owner' and u.rolname='postgres' except select * from agenda_membership_antes)) then
  raise exception 'MEMBERSHIP_VERIFICADOR_ALTERADA';
 end if;
 if has_function_privilege('ffcmapp_agenda_google_owner','vault.update_secret(uuid,text,text,text,uuid)','EXECUTE') then
  raise exception 'UPDATE_SECRET_NAO_NECESSARIO';
 end if;
end $$;
do $$
declare
 papel text; tabela text; permissao text; coluna record; funcao record;
 wrapper oid := to_regprocedure('identidade.agenda_google_operacao_privada(jsonb,text)');
begin
 if wrapper is null or not has_function_privilege('ffcmapp_agenda_google_executor',wrapper,'EXECUTE') then
  raise exception 'WRAPPER_AUSENTE_OU_SEM_EXECUCAO';
 end if;
 for papel in select unnest(array['anon','authenticated','service_role','ffcmapp_agenda_google_executor']) loop
  foreach tabela in array array['agenda_google_state','agenda_google_credencial','agenda_google_geracao','agenda_google_requisicao','agenda_google_escrita','agenda_google_vinculo_paciente','agenda_google_desconexao_recibo'] loop
   foreach permissao in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    if has_table_privilege(papel,format('identidade.%I',tabela),permissao) then
     raise exception 'ACESSO_DIRETO_INDEVIDO: % % %',papel,tabela,permissao;
    end if;
   end loop;
   for coluna in select attname from pg_attribute
    where attrelid = format('identidade.%I',tabela)::regclass and attnum > 0 and not attisdropped loop
    foreach permissao in array array['SELECT','INSERT','UPDATE','REFERENCES'] loop
     if has_column_privilege(papel,format('identidade.%I',tabela),coluna.attname,permissao) then
      raise exception 'ACESSO_COLUNA_INDEVIDO: % %.% %',papel,tabela,coluna.attname,permissao;
     end if;
    end loop;
   end loop;
  end loop;
  for funcao in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='identidade' and p.proname like 'agenda_google_%' loop
   if has_function_privilege(papel,funcao.oid,'EXECUTE') is distinct from
      (papel='ffcmapp_agenda_google_executor' and funcao.oid=wrapper) then
    raise exception 'EXECUCAO_INDEVIDA: % %',papel,funcao.proname;
   end if;
  end loop;
 end loop;
end $$;
