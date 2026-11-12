\set ON_ERROR_STOP on
-- Somente banco descartável local; não prova autorização integrada nem cifra/AAD.
do $$ begin
  if current_database() <> 'ffcm_saude_local' or inet_server_addr() is not null then
    raise exception 'ALVO_LOCAL_DESCARTAVEL_OBRIGATORIO';
  end if;
end $$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key);
\ir ../migrations/20261017113000_fundacao_identidade_cadastro.sql
\ir ../migrations/20261117200000_saude_versoes_privadas.sql

insert into auth.users values ('00000000-0000-0000-0000-000000000001');
insert into public.usuario (id, perfil) values ('00000000-0000-0000-0000-000000000001', 'profissional');
insert into cadastro.paciente (id, nome_cifrado, criado_por_usuario_id) values (
  '00000000-0000-0000-0000-000000000002',
  '{"formato":1,"key_id":"k","nonce":"n","ciphertext":"c","tag":"t"}',
  '00000000-0000-0000-0000-000000000001'
);
insert into cadastro.saude_versao (id, paciente_id, versao, conteudo_cifrado, criado_por_usuario_id) values (
  '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 1,
  '{"formato":1,"key_id":"k","nonce":"n","ciphertext":"c","tag":"t"}', '00000000-0000-0000-0000-000000000001'
);
insert into cadastro.saude_versao
  select '00000000-0000-0000-0000-000000000004', paciente_id, 2, 1, conteudo_cifrado, criado_por_usuario_id, now()
  from cadastro.saude_versao where versao = 1;

do $$
declare papel text; permissao text;
begin
  if not (select relrowsecurity from pg_class where oid = 'cadastro.saude_versao'::regclass) then
    raise exception 'RLS_AUSENTE';
  end if;
  foreach papel in array array['anon', 'authenticated', 'service_role'] loop
    foreach permissao in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege(papel, 'cadastro.saude_versao', permissao) then
        raise exception 'PRIVILEGIO_INDEVIDO: %, %', papel, permissao;
      end if;
    end loop;
  end loop;
  begin
    update cadastro.saude_versao set versao = 3 where versao = 2;
    raise exception 'UPDATE_ACEITO';
  exception when raise_exception then
    if sqlerrm = 'UPDATE_ACEITO' then raise; end if;
  end;
  begin
    delete from cadastro.saude_versao where versao = 2;
    raise exception 'DELETE_ACEITO';
  exception when raise_exception then
    if sqlerrm = 'DELETE_ACEITO' then raise; end if;
  end;
  begin
    insert into cadastro.saude_versao
      select '00000000-0000-0000-0000-000000000005', paciente_id, 2, 1, conteudo_cifrado, criado_por_usuario_id, now()
      from cadastro.saude_versao where versao = 1;
    raise exception 'CONFLITO_ACEITO';
  exception when unique_violation then null;
  end;
  begin
    insert into cadastro.saude_versao
      select '00000000-0000-0000-0000-000000000006', paciente_id, 3, null, conteudo_cifrado, criado_por_usuario_id, now()
      from cadastro.saude_versao where versao = 1;
    raise exception 'SEQUENCIA_INVALIDA_ACEITA';
  exception when check_violation then null;
  end;
  begin
    insert into cadastro.saude_versao
      select '00000000-0000-0000-0000-000000000007', paciente_id, 4, 3, conteudo_cifrado, criado_por_usuario_id, now()
      from cadastro.saude_versao where versao = 1;
    raise exception 'PREDECESSOR_AUSENTE_ACEITO';
  exception when foreign_key_violation then null;
  end;
  -- O envelope precisa recusar conteúdo legível: nenhum campo clínico em coluna clara.
  begin
    insert into cadastro.saude_versao (id, paciente_id, versao, versao_esperada, conteudo_cifrado, criado_por_usuario_id)
      values ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000002', 3, 2,
        '{"formato":1,"key_id":"k","nonce":"n","ciphertext":"c","tag":"t","descricao":"hipertensão"}',
        '00000000-0000-0000-0000-000000000001');
    raise exception 'ENVELOPE_COM_CAMPO_EXTRA_ACEITO';
  exception when check_violation then null;
  end;
end $$;
-- A imutabilidade impede limpeza seletiva. Definir mecanismo controlado e sua
-- prova antes de dados reais ou uso de lotes de teste persistentes; não conceder exclusão aqui.
