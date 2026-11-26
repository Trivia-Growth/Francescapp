-- Jornada familiar (FR-051 a FR-054) sobre as migrations, sem drafts.
-- Prova admissão/consulta de sessão familiar pelo papel `authenticated`, carteira e
-- paciente individual, e os caminhos negativos: paciente de outro caso, vínculo
-- revogado, sessão encerrada, perfil não familiar, auditoria suprimida e acesso direto
-- às tabelas. A ativação por convite não é coberta aqui (ver tasks.md).
\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
\ir ../migrations/20261111160000_admissao_familiar_privada.sql
\ir ../migrations/20261112030000_listar_pacientes_familiar_privado.sql
\ir ../migrations/20261112040000_consultar_paciente_familiar_privado.sql
\ir ../migrations/20261119200000_auditoria_obrigatoria_carteira_familiar.sql
\ir ../migrations/20261119210000_auditoria_obrigatoria_consulta_paciente_familiar.sql
\ir ../migrations/20261119220000_auditoria_obrigatoria_sessao_familiar.sql
\ir ../migrations/20261119230000_owner_sessao_familiar.sql
\ir ../migrations/20261119240000_grant_familiar_teste.sql

-- Familiar fictício: usuário 2 passa a perfil família, com sessão familiar e vínculo
-- apenas com o paciente 1. O paciente 2 existe e permanece sem vínculo.
update public.usuario set perfil = 'familia', ativo = true
  where id = '10000000-0000-4000-8000-000000000002';
update identidade.sessao set metodo = 'familia', concessao_id = null,
    concessao_versao_admissao = null, revogada_em = null, encerrada_em = null
  where session_id = '20000000-0000-4000-8000-000000000002';
insert into cadastro.acesso_paciente(id, paciente_id, usuario_id, concedido_por_usuario_id, motivo_concessao_cifrado)
  values ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
    '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
create function auditoria.suprimir_familiar_jornada_fixture() returns trigger language plpgsql as $$
begin return null; end $$;

-- O papel dono não pode entrar nem ignorar RLS, e a aplicação não recebeu as tabelas.
do $$
begin
  if exists (select 1 from pg_roles r where r.rolname = 'ffcmapp_sessao_familiar_owner'
    and (r.rolcanlogin or r.rolsuper or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb)) then
    raise exception 'OWNER_COM_PRIVILEGIO_EXCESSIVO';
  end if;
  if exists (select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid
    where r.rolname = 'ffcmapp_sessao_familiar_owner') then
    raise exception 'OWNER_COM_MEMBRO_RESIDUAL';
  end if;
  if has_table_privilege('authenticated', 'identidade.sessao', 'select')
    or has_table_privilege('authenticated', 'cadastro.acesso_paciente', 'select')
    or has_table_privilege('authenticated', 'cadastro.paciente', 'select') then
    raise exception 'APLICACAO_COM_TABELA_DIRETA';
  end if;
  if has_function_privilege('anon', 'api.admitir_sessao_familiar_nativa(uuid)', 'execute')
    or has_function_privilege('service_role', 'api.admitir_sessao_familiar_nativa(uuid)', 'execute')
    or has_function_privilege('authenticated', 'identidade.sessao_familiar_privada(uuid, boolean)', 'execute') then
    raise exception 'EXECUTE_ALEM_DO_PREVISTO';
  end if;
end $$;

do $$
declare
  familiar constant uuid := '10000000-0000-4000-8000-000000000002';
  sessao_id constant text := '20000000-0000-4000-8000-000000000002';
  paciente constant uuid := '40000000-0000-4000-8000-000000000001';
  outro constant uuid := '40000000-0000-4000-8000-000000000002';
  claims constant text := format('{"sub":"%s","session_id":"%s","amr":[{"method":"password"}]}', familiar::text, sessao_id);
  req uuid;
  r jsonb;
begin
  perform set_config('request.jwt.claims', claims, true);

  -- Admissão e consulta de sessão familiar pelo papel da aplicação.
  req := gen_random_uuid();
  execute 'set local role authenticated';
  r := api.admitir_sessao_familiar_nativa(req);
  execute 'reset role';
  if r is null or r #>> '{usuario,perfil}' is distinct from 'familia'
    or r ->> 'session_id' is distinct from sessao_id then
    raise exception 'ADMISSAO_FAMILIAR_NEGADA %', r;
  end if;
  if not exists (select 1 from auditoria.evento e where e.request_id = req
    and e.acao = 'admitir_sessao_nativa' and e.resultado = 'permitido') then
    raise exception 'AUDITORIA_ADMISSAO_AUSENTE';
  end if;
  execute 'set local role authenticated';
  r := api.consultar_sessao_familiar_nativa(gen_random_uuid());
  execute 'reset role';
  if r is null then raise exception 'CONSULTA_SESSAO_FAMILIAR_NEGADA'; end if;

  -- Carteira e paciente individual dentro do vínculo.
  execute 'set local role authenticated';
  r := api.listar_pacientes_familiar_privado(gen_random_uuid(), 10, null);
  execute 'reset role';
  if r ->> 'ok' is distinct from 'true' or jsonb_array_length(r #> '{dados,itens}') <> 1
    or (r #> '{dados,itens,0}') ->> 'paciente_id' is distinct from paciente::text then
    raise exception 'CARTEIRA_FAMILIAR_NEGADA %', r;
  end if;
  execute 'set local role authenticated';
  r := api.consultar_paciente_familiar_privado(gen_random_uuid(), paciente);
  execute 'reset role';
  if r ->> 'ok' is distinct from 'true' then raise exception 'PACIENTE_FAMILIAR_NEGADO %', r; end if;
  -- Audiência é controle separado da identidade: o DTO da família é só identificação
  -- básica. Nenhum contato de terceiro, anamnese, plano ou diário pode aparecer aqui.
  if (select array_agg(chave order by chave) from jsonb_object_keys(r -> 'dados') as chave)
    is distinct from array['nome', 'nome_preferencia', 'paciente_id', 'versao'] then
    raise exception 'DTO_FAMILIAR_ALEM_DA_IDENTIFICACAO %', r -> 'dados';
  end if;

  -- Negativo: paciente de outro caso, sem vínculo, nem dado nem metadado.
  req := gen_random_uuid();
  execute 'set local role authenticated';
  r := api.consultar_paciente_familiar_privado(req, outro);
  execute 'reset role';
  if r #>> '{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then
    raise exception 'PACIENTE_DE_OUTRO_CASO_ACEITO %', r;
  end if;
  if not exists (select 1 from auditoria.evento e where e.request_id = req and e.resultado = 'negado') then
    raise exception 'AUDITORIA_NEGATIVA_AUSENTE';
  end if;
  -- Cursor apontando para paciente sem vínculo também não pagina.
  execute 'set local role authenticated';
  r := api.listar_pacientes_familiar_privado(gen_random_uuid(), 10, outro);
  execute 'reset role';
  if r #>> '{erro,codigo}' is distinct from 'sem_permissao' then
    raise exception 'CURSOR_FORA_DO_VINCULO_ACEITO %', r;
  end if;

  -- Negativo: auditoria suprimida não pode devolver dado.
  create trigger suprimir_familiar_jornada before insert on auditoria.evento
    for each row execute function auditoria.suprimir_familiar_jornada_fixture();
  begin
    execute 'set local role authenticated';
    perform api.listar_pacientes_familiar_privado(gen_random_uuid(), 10, null);
    raise exception 'CARTEIRA_SEM_AUDITORIA';
  exception when no_data_found then
    if sqlerrm <> 'AUDITORIA_NAO_INSERIDA' then raise; end if;
  end;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform api.consultar_sessao_familiar_nativa(gen_random_uuid());
    raise exception 'SESSAO_SEM_AUDITORIA';
  exception when no_data_found then
    if sqlerrm <> 'AUDITORIA_NAO_INSERIDA' then raise; end if;
  end;
  execute 'reset role';
  drop trigger suprimir_familiar_jornada on auditoria.evento;

  -- Negativo: vínculo revogado fecha carteira, paciente e sessão na mesma hora.
  update cadastro.acesso_paciente set revogada_em = clock_timestamp(),
      revogado_por_usuario_id = '10000000-0000-4000-8000-000000000001',
      motivo_revogacao_cifrado = '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'
    where id = '50000000-0000-4000-8000-000000000001';
  execute 'set local role authenticated';
  r := api.consultar_paciente_familiar_privado(gen_random_uuid(), paciente);
  execute 'reset role';
  if r #>> '{erro,codigo}' is distinct from 'sem_permissao' then
    raise exception 'VINCULO_REVOGADO_ACEITO_NO_PACIENTE %', r;
  end if;
  execute 'set local role authenticated';
  r := api.listar_pacientes_familiar_privado(gen_random_uuid(), 10, null);
  execute 'reset role';
  if r #>> '{erro,codigo}' is distinct from 'sem_permissao' then
    raise exception 'VINCULO_REVOGADO_ACEITO_NA_CARTEIRA %', r;
  end if;
  execute 'set local role authenticated';
  r := api.consultar_sessao_familiar_nativa(gen_random_uuid());
  execute 'reset role';
  if r is not null then raise exception 'VINCULO_REVOGADO_ACEITO_NA_SESSAO %', r; end if;
  -- FR-054: reentrar não restaura vínculo revogado.
  execute 'set local role authenticated';
  r := api.admitir_sessao_familiar_nativa(gen_random_uuid());
  execute 'reset role';
  if r is not null then raise exception 'REENTRADA_RESTAUROU_VINCULO %', r; end if;
  update cadastro.acesso_paciente set revogada_em = null, revogado_por_usuario_id = null,
      motivo_revogacao_cifrado = null
    where id = '50000000-0000-4000-8000-000000000001';

  -- Negativo: sessão encerrada não serve a nenhuma das consultas.
  update identidade.sessao set encerrada_em = clock_timestamp() where session_id = sessao_id::uuid;
  execute 'set local role authenticated';
  r := api.listar_pacientes_familiar_privado(gen_random_uuid(), 10, null);
  execute 'reset role';
  if r #>> '{erro,codigo}' is distinct from 'sem_permissao' then
    raise exception 'SESSAO_ENCERRADA_ACEITA %', r;
  end if;
  execute 'set local role authenticated';
  if api.consultar_sessao_familiar_nativa(gen_random_uuid()) is not null then
    execute 'reset role';
    raise exception 'SESSAO_ENCERRADA_ACEITA_NA_SESSAO';
  end if;
  execute 'reset role';
  update identidade.sessao set encerrada_em = null where session_id = sessao_id::uuid;

  -- Negativo: perfil não familiar não entra pela porta da família.
  update public.usuario set perfil = 'profissional' where id = familiar;
  execute 'set local role authenticated';
  r := api.admitir_sessao_familiar_nativa(gen_random_uuid());
  execute 'reset role';
  if r is not null then raise exception 'PERFIL_NAO_FAMILIAR_ADMITIDO %', r; end if;
  execute 'set local role authenticated';
  r := api.listar_pacientes_familiar_privado(gen_random_uuid(), 10, null);
  execute 'reset role';
  if r #>> '{erro,codigo}' is distinct from 'sem_permissao' then
    raise exception 'PERFIL_NAO_FAMILIAR_NA_CARTEIRA %', r;
  end if;
  update public.usuario set perfil = 'familia' where id = familiar;

  -- Negativo: sem prova de senha no token, nada é liberado.
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","session_id":"%s","amr":[{"method":"oauth"}]}', familiar::text, sessao_id), true);
  execute 'set local role authenticated';
  r := api.admitir_sessao_familiar_nativa(gen_random_uuid());
  execute 'reset role';
  if r is not null then raise exception 'SEM_SENHA_ADMITIDO %', r; end if;
  perform set_config('request.jwt.claims', claims, true);
end $$;

-- Negativo: a aplicação não alcança as tabelas por fora dos wrappers.
do $$
begin
  execute 'set local role authenticated';
  begin
    perform 1 from cadastro.paciente limit 1;
    execute 'reset role';
    raise exception 'LEITURA_DIRETA_DE_PACIENTE_PERMITIDA';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end $$;
