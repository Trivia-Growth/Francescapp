-- Cancelamento de pré-autorização familiar pela aplicação (FR-051/FR-054).
-- Prova: administrador cancela e o acesso materializado fecha na mesma transação;
-- não-administrador recusado e auditado; repetição idempotente sem alterar o já
-- revogado; pré-autorização de outro caso não é alcançada pelo convite informado;
-- atestado inválido recusado antes de ler a pré-autorização.
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
\ir ../migrations/20261120430000_cancelar_preautorizacao_wrapper.sql
\ir ../migrations/20261120440000_listar_preautorizacoes_familiares.sql
\ir ../migrations/20261120450000_grant_cancelar_preautorizacao_teste.sql

insert into auth.users(id) values ('10000000-0000-4000-8000-00000000000f');
insert into auth.sessions(id, user_id, not_after)
  values ('20000000-0000-4000-8000-00000000000f', '10000000-0000-4000-8000-00000000000f', null);
-- Dois casos pré-autorizados e ativados para a mesma conta familiar.
insert into identidade.convite_familiar(id, paciente_id, email_hmac, digest_entrada, email_cifrado,
    motivo_cifrado, criado_por_usuario_id, estado, usuario_id, ativado_em,
    acesso_preautorizado_id, acesso_autorizado_por, acesso_autorizado_em, motivo_acesso_cifrado,
    digest_autorizacao, criado_em, atualizado_em)
  values
    ('60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
      'hmac-a', 'd1', '{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}',
      '{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}',
      '10000000-0000-4000-8000-000000000001', 'ativado', '10000000-0000-4000-8000-00000000000f', clock_timestamp(),
      '50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', clock_timestamp(),
      '{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}', 'da1',
      clock_timestamp() - interval '1 hour', clock_timestamp() - interval '1 hour'),
    ('60000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002',
      'hmac-a', 'd2', '{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}',
      '{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}',
      '10000000-0000-4000-8000-000000000001', 'ativado', '10000000-0000-4000-8000-00000000000f', clock_timestamp(),
      '50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', clock_timestamp(),
      '{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}', 'da2',
      clock_timestamp() - interval '1 hour', clock_timestamp() - interval '1 hour');

create function public.transporte_cancelar(p_convite uuid, p_chave text, p_digest text,
  p_mac text default 'valido', p_operacao text default 'api.cancelar_preautorizacao_familiar')
returns jsonb language sql as $$
  select jsonb_build_object('entrada', jsonb_build_object(
    'request_id', r, 'convite_id', p_convite,
    'motivo_cifrado', '{"formato":1,"key_id":"t","nonce":"n","ciphertext":"c","tag":"t"}'::jsonb,
    'chave_idempotencia', p_chave, 'digest_idempotencia', p_digest,
    'atestado', jsonb_build_object(
      'usuario_id', auth_privado.uid(), 'session_id', auth_privado.jwt() ->> 'session_id',
      'request_id', r, 'operacao', p_operacao,
      'emitido_em', clock_timestamp() - interval '1 second',
      'expira_em', clock_timestamp() + interval '20 seconds', 'mac', p_mac)))
  from (select gen_random_uuid() as r) as g;
$$;

-- A conta familiar entra e materializa os dois casos.
do $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","session_id":"%s","amr":[{"method":"password"}]}',
      '10000000-0000-4000-8000-00000000000f', '20000000-0000-4000-8000-00000000000f'), true);
  execute 'set local role authenticated';
  r := api.materializar_acesso_familiar_nativa(gen_random_uuid());
  execute 'reset role';
  if r ->> 'materializados' is distinct from '2' then raise exception 'PRE_CONDICAO_FALHOU %', r; end if;
end $$;

do $$
declare
  admin constant uuid := '10000000-0000-4000-8000-000000000001';
  profissional constant uuid := '10000000-0000-4000-8000-000000000002';
  convite1 constant uuid := '60000000-0000-4000-8000-000000000001';
  convite2 constant uuid := '60000000-0000-4000-8000-000000000002';
  t jsonb;
  r jsonb;
begin
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","session_id":"%s","amr":[{"method":"oauth"}]}',
      admin, '20000000-0000-4000-8000-000000000001'), true);

  -- 1. Atestado inválido recusado antes de qualquer leitura da pré-autorização.
  t := public.transporte_cancelar(convite1, 'k-invalido', 'd-invalido', 'invalido');
  begin
    execute 'set local role authenticated';
    perform api.cancelar_preautorizacao_familiar_privado(t);
    raise exception 'ATESTADO_INVALIDO_ACEITO';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  if exists (select 1 from identidade.convite_familiar c where c.id = convite1 and c.acesso_revogado_em is not null) then
    raise exception 'ATESTADO_INVALIDO_CANCELOU';
  end if;
  -- Operação divergente no atestado também é recusada.
  t := public.transporte_cancelar(convite1, 'k-op', 'd-op', 'valido', 'api.preautorizar_acesso_familiar');
  begin
    execute 'set local role authenticated';
    perform api.cancelar_preautorizacao_familiar_privado(t);
    raise exception 'OPERACAO_DIVERGENTE_ACEITA';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  -- 2. Administrador cancela: pré-autorização e acesso materializado fecham juntos.
  t := public.transporte_cancelar(convite1, 'k1', 'd1');
  execute 'set local role authenticated';
  r := api.cancelar_preautorizacao_familiar_privado(t);
  execute 'reset role';
  if r ->> 'ok' is distinct from 'true' or r ->> 'acessos_fechados' is distinct from '1'
    or r ->> 'repeticao' is distinct from 'false' then
    raise exception 'CANCELAMENTO_NEGADO %', r;
  end if;
  if exists (select 1 from cadastro.acesso_paciente a
    where a.id = '50000000-0000-4000-8000-000000000001' and a.revogada_em is null) then
    raise exception 'ACESSO_SEGUIU_ABERTO';
  end if;
  if not exists (select 1 from auditoria.evento e
    where e.request_id = (t #>> '{entrada,request_id}')::uuid
      and e.acao = 'api.cancelar_preautorizacao_familiar' and e.resultado = 'permitido') then
    raise exception 'AUDITORIA_PERMITIDA_AUSENTE';
  end if;
  -- O outro caso continua intacto: cancelar um convite não alcança o outro.
  if exists (select 1 from cadastro.acesso_paciente a
    where a.id = '50000000-0000-4000-8000-000000000002' and a.revogada_em is not null)
    or exists (select 1 from identidade.convite_familiar c where c.id = convite2 and c.acesso_revogado_em is not null) then
    raise exception 'CANCELAMENTO_ALCANCOU_OUTRO_CASO';
  end if;

  -- 3. Repetir a MESMA chave com a mesma entrada é idempotente e não altera nada.
  t := public.transporte_cancelar(convite1, 'k1', 'd1');
  execute 'set local role authenticated';
  r := api.cancelar_preautorizacao_familiar_privado(t);
  execute 'reset role';
  if r ->> 'ok' is distinct from 'true' or r ->> 'repeticao' is distinct from 'true' then
    raise exception 'REPETICAO_NAO_IDEMPOTENTE %', r;
  end if;
  if (select count(*) from cadastro.acesso_paciente a
    where a.id = '50000000-0000-4000-8000-000000000001' and a.revogada_em is not null) <> 1 then
    raise exception 'REPETICAO_ALTEROU_REVOGACAO';
  end if;
  -- Mesma chave com entrada diferente é conflito, não repetição.
  t := public.transporte_cancelar(convite2, 'k1', 'd-outro');
  execute 'set local role authenticated';
  r := api.cancelar_preautorizacao_familiar_privado(t);
  execute 'reset role';
  if r #>> '{erro,codigo}' is distinct from 'conflito_idempotencia' then
    raise exception 'CONFLITO_DE_CHAVE_ACEITO %', r;
  end if;
  if exists (select 1 from identidade.convite_familiar c where c.id = convite2 and c.acesso_revogado_em is not null) then
    raise exception 'CONFLITO_CANCELOU_MESMO_ASSIM';
  end if;

  -- 4. Listagem do caso traz a pré-autorização e seu estado.
  execute 'set local role authenticated';
  r := api.listar_preautorizacoes_familiares_privado(gen_random_uuid(), '40000000-0000-4000-8000-000000000001');
  execute 'reset role';
  if r ->> 'ok' is distinct from 'true' or jsonb_array_length(r #> '{dados,itens}') <> 1
    or (r #> '{dados,itens,0}') ->> 'convite_id' is distinct from convite1::text
    or (r #> '{dados,itens,0}') ->> 'acesso_revogado_em' is null then
    raise exception 'LISTAGEM_INCORRETA %', r;
  end if;

  -- 5. Não-administrador é recusado e auditado, nas duas operações.
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","session_id":"%s","amr":[{"method":"oauth"}]}',
      profissional, '20000000-0000-4000-8000-000000000002'), true);
  t := public.transporte_cancelar(convite2, 'k-prof', 'd-prof');
  execute 'set local role authenticated';
  r := api.cancelar_preautorizacao_familiar_privado(t);
  execute 'reset role';
  if r ->> 'ok' is distinct from 'false' then raise exception 'NAO_ADMIN_CANCELOU %', r; end if;
  if not exists (select 1 from auditoria.evento e
    where e.request_id = (t #>> '{entrada,request_id}')::uuid
      and e.acao = 'api.cancelar_preautorizacao_familiar' and e.resultado = 'negado'
      and e.ator_usuario_id = profissional) then
    raise exception 'AUDITORIA_NEGADA_AUSENTE';
  end if;
  if exists (select 1 from identidade.convite_familiar c where c.id = convite2 and c.acesso_revogado_em is not null) then
    raise exception 'NAO_ADMIN_FECHOU_ACESSO';
  end if;
  -- A chave recusada não fica consumida: a equipe certa pode usar a mesma depois.
  if exists (select 1 from operacao.requisicao q where q.chave_idempotencia = 'k-prof') then
    raise exception 'CHAVE_CONSUMIDA_EM_RECUSA';
  end if;
  execute 'set local role authenticated';
  r := api.listar_preautorizacoes_familiares_privado(gen_random_uuid(), '40000000-0000-4000-8000-000000000001');
  execute 'reset role';
  if r #>> '{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then
    raise exception 'NAO_ADMIN_LISTOU %', r;
  end if;
end $$;

-- 6. Limites de privilégio do papel do cancelamento.
do $$
begin
  if has_any_column_privilege('ffcmapp_cancelar_preautorizacao_owner', 'cadastro.acesso_paciente', 'insert')
    or has_any_column_privilege('ffcmapp_cancelar_preautorizacao_owner', 'public.usuario', 'insert')
    or has_any_column_privilege('ffcmapp_cancelar_preautorizacao_owner', 'identidade.convite_familiar', 'insert') then
    raise exception 'CANCELAMENTO_COM_PROVISIONAMENTO';
  end if;
  if exists (select 1 from pg_roles r where r.rolname = 'ffcmapp_cancelar_preautorizacao_owner'
    and (r.rolcanlogin or r.rolsuper or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb)) then
    raise exception 'OWNER_COM_PRIVILEGIO_EXCESSIVO';
  end if;
  if has_function_privilege('anon', 'api.cancelar_preautorizacao_familiar_privado(jsonb)', 'execute')
    or has_function_privilege('service_role', 'api.cancelar_preautorizacao_familiar_privado(jsonb)', 'execute') then
    raise exception 'EXECUTE_ALEM_DO_PREVISTO';
  end if;
end $$;
