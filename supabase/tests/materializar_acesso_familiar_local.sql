-- Materialização automática na primeira entrada (decisão de 12/11/2026).
-- Prova: materializa cada pré-autorização vigente e nada além delas; perfil e acesso
-- nascem só aqui; idempotente na segunda entrada; não reabre acesso revogado depois;
-- pré-autorização revogada não materializa e, se revogada DEPOIS, fecha o acesso já
-- materializado na mesma transação; conta sem pré-autorização é negada e auditada.
\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
create or replace function identidade.verificar_assinatura_atestado(
  p_entrada_canonica text, p_dados_canonicos text, p_entrada_usada jsonb, p_dados_usados jsonb, p_mac text
) returns boolean language sql security definer set search_path = '' as $$ select p_mac = 'valido' $$;
\ir ../migrations/20261119250000_convite_familiar.sql
\ir ../migrations/20261119260000_ativar_convite_familiar.sql
\ir ../migrations/20261119270000_grant_convite_familiar_teste.sql
\ir ../migrations/20261120400000_materializar_acesso_familiar.sql
\ir ../migrations/20261120410000_grant_materializar_familiar_teste.sql
\ir ../migrations/20261120420000_cancelar_preautorizacao_revoga_acesso.sql

-- Familiar com conta Auth e e-mail já confirmado, sem perfil e sem acesso. Dois casos
-- pré-autorizados e ativados; um terceiro caso com pré-autorização revogada.
insert into auth.users(id) values
  ('10000000-0000-4000-8000-00000000000f'), ('10000000-0000-4000-8000-00000000000e');
insert into auth.sessions(id, user_id, not_after) values
  ('20000000-0000-4000-8000-00000000000f', '10000000-0000-4000-8000-00000000000f', null),
  ('20000000-0000-4000-8000-00000000000e', '10000000-0000-4000-8000-00000000000e', null);
insert into cadastro.paciente(id, nome_cifrado, criado_por_usuario_id)
  values ('40000000-0000-4000-8000-000000000003',
    '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',
    '10000000-0000-4000-8000-000000000001');
insert into identidade.convite_familiar(id, paciente_id, email_hmac, digest_entrada, email_cifrado,
    motivo_cifrado, criado_por_usuario_id, estado, usuario_id, ativado_em,
    acesso_preautorizado_id, acesso_autorizado_por, acesso_autorizado_em, motivo_acesso_cifrado,
    digest_autorizacao, acesso_revogado_em, acesso_revogado_por, criado_em, atualizado_em)
  values
    -- Caso 1 e caso 2: pré-autorização vigente, convite ativado por esta conta.
    ('60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
      'hmac-a', 'd1', '{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}',
      '{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}',
      '10000000-0000-4000-8000-000000000001', 'ativado', '10000000-0000-4000-8000-00000000000f', clock_timestamp(),
      '50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', clock_timestamp(),
      '{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}', 'da1', null, null, clock_timestamp() - interval '1 hour', clock_timestamp() - interval '1 hour'),
    ('60000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002',
      'hmac-a', 'd2', '{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}',
      '{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}',
      '10000000-0000-4000-8000-000000000001', 'ativado', '10000000-0000-4000-8000-00000000000f', clock_timestamp(),
      '50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', clock_timestamp(),
      '{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}', 'da2', null, null, clock_timestamp() - interval '1 hour', clock_timestamp() - interval '1 hour'),
    -- Caso 3: pré-autorização revogada antes da entrada. Não pode materializar nada.
    ('60000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003',
      'hmac-a', 'd3', '{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}',
      '{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}',
      '10000000-0000-4000-8000-000000000001', 'ativado', '10000000-0000-4000-8000-00000000000f', clock_timestamp(),
      '50000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', clock_timestamp(),
      '{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}', 'da3', clock_timestamp(),
      '10000000-0000-4000-8000-000000000001', clock_timestamp() - interval '1 hour', clock_timestamp() - interval '1 hour'),
    -- Caso 4: pré-autorização vigente, mas de OUTRA conta.
    ('60000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000003',
      'hmac-outro', 'd4', '{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}',
      '{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}',
      '10000000-0000-4000-8000-000000000001', 'ativado', '10000000-0000-4000-8000-00000000000e', clock_timestamp(),
      '50000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', clock_timestamp(),
      '{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}', 'da4', null, null, clock_timestamp() - interval '1 hour', clock_timestamp() - interval '1 hour');

do $$
declare
  familiar constant uuid := '10000000-0000-4000-8000-00000000000f';
  admin constant uuid := '10000000-0000-4000-8000-000000000001';
  caso1 constant uuid := '40000000-0000-4000-8000-000000000001';
  caso2 constant uuid := '40000000-0000-4000-8000-000000000002';
  caso3 constant uuid := '40000000-0000-4000-8000-000000000003';
  senha constant text := format('{"sub":"%s","session_id":"%s","amr":[{"method":"password"}]}',
    familiar, '20000000-0000-4000-8000-00000000000f');
  req uuid;
  r jsonb;
begin
  perform set_config('request.jwt.claims', senha, true);
  if exists (select 1 from public.usuario u where u.id = familiar)
    or exists (select 1 from cadastro.acesso_paciente a where a.usuario_id = familiar) then
    raise exception 'ESTADO_INICIAL_JA_PROVISIONADO';
  end if;

  -- 1. Primeira entrada: materializa exatamente as duas pré-autorizações vigentes.
  req := gen_random_uuid();
  execute 'set local role authenticated';
  r := api.materializar_acesso_familiar_nativa(req);
  execute 'reset role';
  if r ->> 'ok' is distinct from 'true' or r ->> 'materializados' is distinct from '2' then
    raise exception 'MATERIALIZACAO_NEGADA %', r;
  end if;
  if not exists (select 1 from public.usuario u where u.id = familiar and u.perfil = 'familia' and u.ativo) then
    raise exception 'PERFIL_NAO_MATERIALIZADO';
  end if;
  -- Nem um caso a mais: o revogado e o de outra conta ficam de fora.
  if (select array_agg(a.paciente_id order by a.paciente_id) from cadastro.acesso_paciente a
    where a.usuario_id = familiar) is distinct from array[caso1, caso2] then
    raise exception 'MATERIALIZOU_ALEM_DA_PREAUTORIZACAO %',
      (select array_agg(a.paciente_id) from cadastro.acesso_paciente a where a.usuario_id = familiar);
  end if;
  -- O id do acesso é o que a pré-autorização determinou, não um novo.
  if not exists (select 1 from cadastro.acesso_paciente a
    where a.id = '50000000-0000-4000-8000-000000000001' and a.paciente_id = caso1
      and a.concedido_por_usuario_id = admin) then
    raise exception 'ACESSO_DIVERGENTE_DA_PREAUTORIZACAO';
  end if;
  if (select count(*) from auditoria.evento e where e.request_id = req
    and e.acao = 'materializar_acesso_familiar' and e.resultado = 'permitido') <> 2 then
    raise exception 'AUDITORIA_PERMITIDA_INCOMPLETA';
  end if;

  -- 2. Segunda entrada: idempotente, nada duplicado.
  execute 'set local role authenticated';
  r := api.materializar_acesso_familiar_nativa(gen_random_uuid());
  execute 'reset role';
  if r ->> 'ok' is distinct from 'true' or r ->> 'materializados' is distinct from '0' then
    raise exception 'SEGUNDA_ENTRADA_NAO_IDEMPOTENTE %', r;
  end if;
  if (select count(*) from cadastro.acesso_paciente a where a.usuario_id = familiar) <> 2
    or (select count(*) from public.usuario u where u.id = familiar) <> 1 then
    raise exception 'ENTRADA_DUPLICOU_REGISTRO';
  end if;

  -- 3. Acesso revogado depois da primeira entrada não é reaberto por nova entrada.
  update cadastro.acesso_paciente set revogada_em = clock_timestamp(), revogado_por_usuario_id = admin,
      motivo_revogacao_cifrado = '{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}'
    where id = '50000000-0000-4000-8000-000000000002';
  execute 'set local role authenticated';
  r := api.materializar_acesso_familiar_nativa(gen_random_uuid());
  execute 'reset role';
  if r ->> 'materializados' is distinct from '0' then
    raise exception 'ENTRADA_REABRIU_ACESSO_REVOGADO %', r;
  end if;
  if exists (select 1 from cadastro.acesso_paciente a
    where a.usuario_id = familiar and a.paciente_id = caso2 and a.revogada_em is null) then
    raise exception 'ACESSO_REVOGADO_VOLTOU';
  end if;

  -- 4. Revogar a pré-autorização DEPOIS da materialização fecha o acesso na hora.
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","session_id":"%s","amr":[{"method":"oauth"}]}',
      admin, '20000000-0000-4000-8000-000000000001'), true);
  r := identidade.cancelar_preautorizacao_familiar_privado('60000000-0000-4000-8000-000000000001',
    gen_random_uuid(), '{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}');
  if r ->> 'ok' is distinct from 'true' or r ->> 'acessos_fechados' is distinct from '1' then
    raise exception 'CANCELAMENTO_NAO_FECHOU_ACESSO %', r;
  end if;
  if exists (select 1 from cadastro.acesso_paciente a
    where a.id = '50000000-0000-4000-8000-000000000001' and a.revogada_em is null) then
    raise exception 'ACESSO_SEGUIU_ABERTO_APOS_CANCELAMENTO';
  end if;
  -- Repetir o cancelamento não mexe no que já está revogado.
  r := identidade.cancelar_preautorizacao_familiar_privado('60000000-0000-4000-8000-000000000001',
    gen_random_uuid(), '{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}');
  if r ->> 'acessos_fechados' is distinct from '0' then
    raise exception 'CANCELAMENTO_REPETIDO_ALTEROU %', r;
  end if;
  -- E uma nova entrada não ressuscita nada.
  perform set_config('request.jwt.claims', senha, true);
  execute 'set local role authenticated';
  r := api.materializar_acesso_familiar_nativa(gen_random_uuid());
  execute 'reset role';
  if exists (select 1 from cadastro.acesso_paciente a where a.usuario_id = familiar and a.revogada_em is null) then
    raise exception 'ENTRADA_RESSUSCITOU_ACESSO %', r;
  end if;

  -- 5. Sem prova de senha no token, a materialização não é alcançável.
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","session_id":"%s","amr":[{"method":"oauth"}]}',
      familiar, '20000000-0000-4000-8000-00000000000f'), true);
  begin
    execute 'set local role authenticated';
    perform api.materializar_acesso_familiar_nativa(gen_random_uuid());
    raise exception 'SEM_SENHA_MATERIALIZOU';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end $$;

-- 6. Conta sem nenhuma pré-autorização vigente: negada, auditada, nada criado.
do $$
declare
  estranho constant uuid := '10000000-0000-4000-8000-00000000000d';
  req uuid := gen_random_uuid();
  r jsonb;
begin
  insert into auth.users(id) values (estranho);
  insert into auth.sessions(id, user_id, not_after)
    values ('20000000-0000-4000-8000-00000000000d', estranho, null);
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","session_id":"%s","amr":[{"method":"password"}]}',
      estranho, '20000000-0000-4000-8000-00000000000d'), true);
  execute 'set local role authenticated';
  r := api.materializar_acesso_familiar_nativa(req);
  execute 'reset role';
  if r ->> 'ok' is distinct from 'false' then raise exception 'CONTA_SEM_PREAUTORIZACAO_ACEITA %', r; end if;
  if not exists (select 1 from auditoria.evento e where e.request_id = req
    and e.acao = 'materializar_acesso_familiar' and e.resultado = 'negado'
    and e.ator_usuario_id is null and e.operador_restrito is not null) then
    raise exception 'AUDITORIA_NEGADA_AUSENTE';
  end if;
  if exists (select 1 from public.usuario u where u.id = estranho)
    or exists (select 1 from cadastro.acesso_paciente a where a.usuario_id = estranho) then
    raise exception 'NEGADA_MAS_PROVISIONOU';
  end if;
end $$;

-- 7. A separação de papéis e os limites de privilégio continuam de pé.
do $$
begin
  if has_any_column_privilege('ffcmapp_ativar_familiar_owner', 'public.usuario', 'insert')
    or has_any_column_privilege('ffcmapp_ativar_familiar_owner', 'cadastro.acesso_paciente', 'insert') then
    raise exception 'ATIVACAO_COM_PROVISIONAMENTO';
  end if;
  if has_any_column_privilege('ffcmapp_materializar_familiar_owner', 'identidade.convite_familiar', 'insert')
    or has_table_privilege('ffcmapp_materializar_familiar_owner', 'identidade.convite_familiar', 'delete') then
    raise exception 'MATERIALIZACAO_ESCREVE_CONVITE';
  end if;
  if exists (select 1 from pg_roles r where r.rolname = 'ffcmapp_materializar_familiar_owner'
    and (r.rolcanlogin or r.rolsuper or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb)) then
    raise exception 'OWNER_COM_PRIVILEGIO_EXCESSIVO';
  end if;
  if has_any_column_privilege('authenticated', 'cadastro.acesso_paciente', 'insert')
    or has_any_column_privilege('authenticated', 'public.usuario', 'insert') then
    raise exception 'APLICACAO_PROVISIONA_DIRETO';
  end if;
end $$;
