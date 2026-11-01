-- Apenas cluster exclusivo do runner; view Vault fictícia, sem segredos reais.
\set ON_ERROR_STOP on
do $$ begin
 if current_database() <> 'ffcm_carteira_fixture' or inet_server_addr() is not null
  or coalesce(current_setting('ffcm_fixture.token_servidor',true),'') = ''
  or current_setting('ffcm_fixture.token_servidor',true) is distinct from current_setting('ffcm_fixture.token_esperado',true)
  or current_setting('unix_socket_directories') is distinct from current_setting('ffcm_fixture.socket_esperado',true)
  or current_setting('data_directory') is distinct from current_setting('ffcm_fixture.data_esperado',true) then
  raise exception 'cluster descartável obrigatório';
 end if;
end $$;
create role postgres superuser nologin;
create schema vault;
create table vault.segredos_fixture(name text, decrypted_secret text);
create view vault.decrypted_secrets as select name,decrypted_secret from vault.segredos_fixture;
create function vault._crypto_aead_det_decrypt(bytea,bytea,bigint,bytea,bytea) returns bytea language sql as $$ select null::bytea $$;
insert into vault.segredos_fixture values ('ffcmapp.atestado.teste',encode(decode(repeat('42',32),'hex'),'base64')),
 ('ffcmapp.atestado.invalida','abc'),('ffcmapp.cifra.teste',encode(decode(repeat('24',32),'hex'),'base64')),
 ('ffcmapp.atestado.duplicada',encode(decode(repeat('42',32),'hex'),'base64')),
 ('ffcmapp.atestado.duplicada',encode(decode(repeat('42',32),'hex'),'base64')),
 ('ffcmapp.atestado.nula',null),('ffcmapp.atestado.nao-registrada',encode(decode(repeat('42',32),'hex'),'base64'));
set role postgres;
\ir ../migrations/20261104120000_vault_atestado.sql
reset role;
set role ffcmapp_atestado_vault_executor;
do $$ begin
 begin perform identidade.ler_chave_atestado_vault('ffcmapp.atestado.teste'); raise exception 'catálogo vazio autorizou chave';
 exception when sqlstate '55000' then null; end;
end $$;
reset role;
insert into identidade.referencias_atestado_vault(referencia) values
 ('ffcmapp.atestado.teste'),('ffcmapp.atestado.ausente'),('ffcmapp.atestado.invalida'),
 ('ffcmapp.atestado.duplicada'),('ffcmapp.atestado.nula');
do $$ declare papel text; coluna text; acao text; begin
 if has_schema_privilege('ffcmapp_atestado_vault_executor','vault','usage')
  or has_table_privilege('ffcmapp_atestado_vault_executor','vault.decrypted_secrets','select')
  or has_function_privilege('anon','identidade.ler_chave_atestado_vault(text)','execute')
  or has_function_privilege('authenticated','identidade.ler_chave_atestado_vault(text)','execute')
  or pg_has_role('ffcmapp_atestado_vault_executor','ffcmapp_atestado_vault_owner','member')
  or has_table_privilege('ffcmapp_atestado_vault_executor','identidade.referencias_atestado_vault','select,insert,update,delete')
  or exists(select 1 from pg_roles where rolname in ('ffcmapp_atestado_vault_owner','ffcmapp_atestado_vault_executor') and (rolcanlogin or rolsuper or rolbypassrls)) then
  raise exception 'permissão excessiva';
 end if;
 foreach papel in array array['anon','authenticated','ffcmapp_atestado_vault_executor'] loop
  foreach coluna in array array['referencia','ativa'] loop
   foreach acao in array array['SELECT','INSERT','UPDATE','REFERENCES'] loop
    if has_column_privilege(papel,'identidade.referencias_atestado_vault',coluna,acao) then
     raise exception 'acesso indireto ao catálogo permitido';
    end if;
   end loop;
  end loop;
 end loop;
end $$;
set role ffcmapp_atestado_vault_executor;
do $$ begin
 if identidade.ler_chave_atestado_vault('ffcmapp.atestado.teste') is distinct from decode(repeat('42',32),'hex') then raise exception 'chave fictícia incompatível'; end if;
 for i in 1..6 loop
  begin
   perform identidade.ler_chave_atestado_vault((array['ffcmapp.atestado.ausente','ffcmapp.atestado.invalida','ffcmapp.cifra.teste','ffcmapp.atestado.duplicada','ffcmapp.atestado.nula','ffcmapp.atestado.nao-registrada'])[i]);
   raise exception 'configuração inválida aceita';
  exception when sqlstate '55000' then null;
  end;
 end loop;
 begin perform decrypted_secret from vault.decrypted_secrets; raise exception 'acesso direto indevido';
 exception when insufficient_privilege then null; end;
 begin insert into identidade.referencias_atestado_vault(referencia) values('ffcmapp.atestado.nao-registrada'); raise exception 'cadastro de referência indevido';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
update identidade.referencias_atestado_vault set ativa=false where referencia='ffcmapp.atestado.teste';
set role ffcmapp_atestado_vault_executor;
do $$ begin
 begin perform identidade.ler_chave_atestado_vault('ffcmapp.atestado.teste'); raise exception 'referência revogada aceita';
 exception when sqlstate '55000' then null; end;
end $$;
reset role;
