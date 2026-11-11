\set ON_ERROR_STOP on
-- Banco descartável local; não prova autorização integrada, cifra/AAD real nem acesso direto remoto.
do $$ begin
  if current_database() <> 'ffcm_diario_local' or inet_server_addr() is not null then
    raise exception 'ALVO_LOCAL_DESCARTAVEL_OBRIGATORIO';
  end if;
end $$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
\ir ../migrations/20261017113000_fundacao_identidade_cadastro.sql
\ir ../migrations/20261108120000_diario_rascunho_privado.sql

insert into auth.users values ('00000000-0000-0000-0000-000000000001');
insert into public.usuario (id, perfil) values ('00000000-0000-0000-0000-000000000001', 'profissional');
insert into cadastro.paciente (id, nome_cifrado, criado_por_usuario_id) values (
  '00000000-0000-0000-0000-000000000002',
  '{"formato":1,"key_id":"k","nonce":"n","ciphertext":"c","tag":"t"}',
  '00000000-0000-0000-0000-000000000001'
);
insert into cadastro.diario_rascunho_textual (id, paciente_id, autor_usuario_id, conteudo_cifrado, versao) values (
  '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  '{"formato":1,"key_id":"k","nonce":"n","ciphertext":"c","tag":"t"}', 1
);

do $$
declare papel text; permissao text;
begin
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'cadastro.diario_rascunho_textual'::regclass) then
    raise exception 'RLS_AUSENTE_OU_NAO_FORCADA';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'cadastro' and tablename = 'diario_rascunho_textual') then
    raise exception 'POLITICA_INESPERADA';
  end if;
  foreach papel in array array['anon', 'authenticated', 'service_role'] loop
    foreach permissao in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege(papel, 'cadastro.diario_rascunho_textual', permissao) then
        raise exception 'PRIVILEGIO_INDEVIDO: %, %', papel, permissao;
      end if;
    end loop;
  end loop;
end $$;

-- service_role tem bypassrls (pior caso plausível na fundação real); ainda assim,
-- a ausência de grant deve negar qualquer acesso direto à tabela.
set role service_role;
do $$ begin
  begin
    perform 1 from cadastro.diario_rascunho_textual limit 1;
    raise exception 'SELECT_ACEITO_SEM_GRANT';
  exception when insufficient_privilege then null;
  end;
  begin
    update cadastro.diario_rascunho_textual set versao = 2 where true;
    raise exception 'UPDATE_ACEITO_SEM_GRANT';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
