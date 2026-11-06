\set ON_ERROR_STOP on
-- Fixture descartável não comprova autorização integrada nem cifra autenticada.
do $$ begin
  if current_database() <> 'ffcm_plano_local' or inet_server_addr() is not null then
    raise exception 'ALVO_LOCAL_DESCARTAVEL_OBRIGATORIO';
  end if;
end $$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key);
\ir ../migrations/20261017113000_fundacao_identidade_cadastro.sql
\ir ../migrations/20261107120000_plano_cuidado_versoes_privadas.sql

insert into auth.users values ('00000000-0000-0000-0000-000000000001');
insert into public.usuario (id, perfil) values ('00000000-0000-0000-0000-000000000001', 'profissional');
insert into cadastro.paciente (id, nome_cifrado, criado_por_usuario_id) values
 ('00000000-0000-0000-0000-000000000002', '{"formato":1,"key_id":"k","nonce":"n","ciphertext":"c","tag":"t"}', '00000000-0000-0000-0000-000000000001');
insert into cadastro.objetivo_cuidado values
 ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002');
insert into cadastro.objetivo_cuidado_versao (id, objetivo_id, versao, conteudo_cifrado, criado_por_usuario_id) values
 ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000003', 1, '{"formato":1,"key_id":"k","nonce":"n","ciphertext":"c","tag":"t"}', '00000000-0000-0000-0000-000000000001');
insert into cadastro.objetivo_cuidado_versao
 select '00000000-0000-0000-0000-000000000006', objetivo_id, 2, 1, conteudo_cifrado, criado_por_usuario_id, now()
 from cadastro.objetivo_cuidado_versao where versao = 1;

do $$
declare papel text; permissao text; tabela text;
begin
  foreach tabela in array array['cadastro.objetivo_cuidado', 'cadastro.objetivo_cuidado_versao'] loop
    if not (select relrowsecurity from pg_class where oid = tabela::regclass) then raise exception 'RLS_AUSENTE'; end if;
    foreach papel in array array['anon', 'authenticated', 'service_role'] loop
      foreach permissao in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        if has_table_privilege(papel, tabela, permissao) then raise exception 'PRIVILEGIO_INDEVIDO'; end if;
      end loop;
    end loop;
  end loop;
  begin
    update cadastro.objetivo_cuidado set paciente_id = paciente_id;
    raise exception 'UPDATE_ACEITO';
  exception when raise_exception then if sqlerrm = 'UPDATE_ACEITO' then raise; end if; end;
  begin
    delete from cadastro.objetivo_cuidado_versao where versao = 2;
    raise exception 'DELETE_ACEITO';
  exception when raise_exception then if sqlerrm = 'DELETE_ACEITO' then raise; end if; end;
  begin
    insert into cadastro.objetivo_cuidado_versao
      select '00000000-0000-0000-0000-000000000007', objetivo_id, 2, 1, conteudo_cifrado, criado_por_usuario_id, now()
      from cadastro.objetivo_cuidado_versao where versao = 1;
    raise exception 'CONFLITO_ACEITO';
  exception when unique_violation then null; end;
  begin
    insert into cadastro.objetivo_cuidado_versao
      select '00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000004', 2, 1, conteudo_cifrado, criado_por_usuario_id, now()
      from cadastro.objetivo_cuidado_versao where versao = 1;
    raise exception 'PREDECESSOR_OUTRO_OBJETIVO_ACEITO';
  exception when foreign_key_violation then null; end;
  begin
    insert into cadastro.objetivo_cuidado_versao
      select '00000000-0000-0000-0000-000000000009', objetivo_id, 3, 2, '{"texto":"clínico"}', criado_por_usuario_id, now()
      from cadastro.objetivo_cuidado_versao where versao = 1;
    raise exception 'ENVELOPE_INVALIDO_ACEITO';
  exception when check_violation then null; end;
end $$;
