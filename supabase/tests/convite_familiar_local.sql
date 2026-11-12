-- Convite familiar (FR-051 a FR-054) com a semântica decidida em 12/11/2026:
-- a ativação SOMENTE estabelece identidade e nunca provisiona perfil ou acesso.
-- Prova: ativação sem pré-autorização negada e auditada; link antigo reusado depois de
-- revogada a pré-autorização não concede nada; convite de outro caso não é alcançado;
-- reenvio idempotente; revogação durante o fluxo fecha na hora.
\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
-- Verificador de atestado substituído por dublê: a assinatura real é provada em
-- fundacao_verificador_atestado_local.sql; aqui o alvo é a autorização.
create or replace function identidade.verificar_assinatura_atestado(
  p_entrada_canonica text, p_dados_canonicos text, p_entrada_usada jsonb, p_dados_usados jsonb, p_mac text
) returns boolean language sql security definer set search_path = '' as $$ select p_mac = 'valido' $$;
\ir ../migrations/20261119250000_convite_familiar.sql
\ir ../migrations/20261119260000_ativar_convite_familiar.sql
\ir ../migrations/20261119270000_grant_convite_familiar_teste.sql

-- Dois casos e um familiar fictício. O familiar tem conta Auth e sessão, mas nenhum
-- perfil de aplicação e nenhum acesso: é exatamente o estado de quem acabou de clicar
-- no link do convite.
insert into auth.users(id) values ('10000000-0000-4000-8000-00000000000f');
insert into auth.sessions(id, user_id, not_after)
  values ('20000000-0000-4000-8000-00000000000f', '10000000-0000-4000-8000-00000000000f', null);
insert into identidade.convite_familiar(id, paciente_id, email_hmac, digest_entrada, email_cifrado,
    motivo_cifrado, criado_por_usuario_id)
  values
    ('60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
      'hmac-familiar-a', 'digest-a',
      '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',
      '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',
      '10000000-0000-4000-8000-000000000001'),
    ('60000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002',
      'hmac-familiar-a', 'digest-b',
      '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',
      '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',
      '10000000-0000-4000-8000-000000000001');

create function public.transporte_ativacao_fixture(p_convite uuid, p_hmac text, p_mac text default 'valido')
returns jsonb language sql as $$
  select jsonb_build_object('entrada', jsonb_build_object(
    'request_id', gen_random_uuid(), 'convite_id', p_convite, 'email_hmac', p_hmac, 'tipo', 'invite',
    'atestado', jsonb_build_object(
      'usuario_id', auth_privado.uid(), 'session_id', auth_privado.jwt() ->> 'session_id',
      'request_id', gen_random_uuid(), 'operacao', 'api.ativar_convite_familiar',
      'emitido_em', clock_timestamp() - interval '1 second',
      'expira_em', clock_timestamp() + interval '20 seconds', 'mac', p_mac)));
$$;
-- O request_id do atestado precisa casar com o da entrada; o helper acima gera dois,
-- então o chamador normaliza antes de usar.
create function public.transporte_ativacao(p_convite uuid, p_hmac text, p_mac text default 'valido')
returns jsonb language sql as $$
  select jsonb_set(t, '{entrada,atestado,request_id}', t #> '{entrada,request_id}')
  from public.transporte_ativacao_fixture(p_convite, p_hmac, p_mac) as t;
$$;

do $$
declare
  familiar constant uuid := '10000000-0000-4000-8000-00000000000f';
  admin constant uuid := '10000000-0000-4000-8000-000000000001';
  convite_a constant uuid := '60000000-0000-4000-8000-000000000001';
  convite_b constant uuid := '60000000-0000-4000-8000-000000000002';
  acesso_a constant uuid := '50000000-0000-4000-8000-00000000000a';
  claims constant text := format('{"sub":"%s","session_id":"%s","amr":[{"method":"password"}]}',
    familiar, '20000000-0000-4000-8000-00000000000f');
  t jsonb;
  r jsonb;
begin
  perform set_config('request.jwt.claims', claims, true);

  -- 1. Sem pré-autorização vigente: entrada negada, auditada, nada provisionado.
  t := public.transporte_ativacao(convite_a, 'hmac-familiar-a');
  execute 'set local role authenticated';
  r := api.ativar_convite_familiar_privado(t);
  execute 'reset role';
  if r ->> 'ok' is distinct from 'false' then raise exception 'SEM_PREAUTORIZACAO_ACEITA %', r; end if;
  if not exists (select 1 from auditoria.evento e
    where e.request_id = (t #>> '{entrada,request_id}')::uuid
      and e.acao = 'ativar_convite_familiar' and e.resultado = 'negado') then
    raise exception 'AUDITORIA_NEGATIVA_AUSENTE';
  end if;
  if exists (select 1 from public.usuario u where u.id = familiar)
    or exists (select 1 from cadastro.acesso_paciente a where a.usuario_id = familiar) then
    raise exception 'ATIVACAO_PROVISIONOU_SEM_PREAUTORIZACAO';
  end if;
  if exists (select 1 from identidade.convite_familiar c where c.id = convite_a and c.estado <> 'pendente') then
    raise exception 'CONVITE_AVANCOU_SEM_PREAUTORIZACAO';
  end if;

  -- A equipe pré-autoriza o e-mail neste caso, antes do convite valer.
  update identidade.convite_familiar set acesso_preautorizado_id = acesso_a,
      acesso_autorizado_por = admin, acesso_autorizado_em = clock_timestamp(),
      motivo_acesso_cifrado = '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',
      digest_autorizacao = 'digest-autorizacao-a', atualizado_em = clock_timestamp()
    where id = convite_a;

  -- 2. Com pré-autorização vigente: identidade estabelecida, e só isso.
  t := public.transporte_ativacao(convite_a, 'hmac-familiar-a');
  execute 'set local role authenticated';
  r := api.ativar_convite_familiar_privado(t);
  execute 'reset role';
  if r ->> 'ok' is distinct from 'true' or r ->> 'usuario_id' is distinct from familiar::text then
    raise exception 'ATIVACAO_LEGITIMA_NEGADA %', r;
  end if;
  if not exists (select 1 from identidade.convite_familiar c
    where c.id = convite_a and c.estado = 'ativado' and c.usuario_id = familiar and c.ativado_em is not null) then
    raise exception 'IDENTIDADE_NAO_ESTABELECIDA';
  end if;
  -- O ponto da decisão de 12/11/2026: nenhuma autoridade nasce aqui.
  if exists (select 1 from public.usuario u where u.id = familiar) then
    raise exception 'ATIVACAO_CRIOU_PERFIL';
  end if;
  if exists (select 1 from cadastro.acesso_paciente a where a.usuario_id = familiar) then
    raise exception 'ATIVACAO_CRIOU_ACESSO';
  end if;

  -- 3. Repetir o mesmo link é idempotente e não muda o titular.
  t := public.transporte_ativacao(convite_a, 'hmac-familiar-a');
  execute 'set local role authenticated';
  r := api.ativar_convite_familiar_privado(t);
  execute 'reset role';
  if r ->> 'ok' is distinct from 'true' then raise exception 'REATIVACAO_NEGADA %', r; end if;
  if (select count(*) from identidade.convite_familiar c where c.id = convite_a and c.usuario_id = familiar) <> 1 then
    raise exception 'REATIVACAO_DUPLICOU';
  end if;

  -- 4. Convite do mesmo e-mail em OUTRO caso não é alcançado por este fluxo: continua
  -- sem pré-autorização e segue negado, sem tocar o caso já ativado.
  t := public.transporte_ativacao(convite_b, 'hmac-familiar-a');
  execute 'set local role authenticated';
  r := api.ativar_convite_familiar_privado(t);
  execute 'reset role';
  if r ->> 'ok' is distinct from 'false' then raise exception 'OUTRO_CASO_ALCANCADO %', r; end if;
  if exists (select 1 from identidade.convite_familiar c where c.id = convite_b and c.estado <> 'pendente') then
    raise exception 'OUTRO_CASO_AVANCOU';
  end if;

  -- 5. Convite de outro e-mail não casa com este registro.
  t := public.transporte_ativacao(convite_a, 'hmac-de-outra-pessoa');
  execute 'set local role authenticated';
  r := api.ativar_convite_familiar_privado(t);
  execute 'reset role';
  if r ->> 'ok' is distinct from 'false' then raise exception 'EMAIL_DIVERGENTE_ACEITO %', r; end if;

  -- 6. Revogada a pré-autorização, o link antigo que continua válido no Auth não
  -- concede nada: fecha na hora, inclusive para quem já havia ativado.
  update identidade.convite_familiar set acesso_revogado_em = clock_timestamp(),
      acesso_revogado_por = admin, atualizado_em = clock_timestamp()
    where id = convite_a;
  t := public.transporte_ativacao(convite_a, 'hmac-familiar-a');
  execute 'set local role authenticated';
  r := api.ativar_convite_familiar_privado(t);
  execute 'reset role';
  if r ->> 'ok' is distinct from 'false' then raise exception 'LINK_ANTIGO_APOS_REVOGACAO_ACEITO %', r; end if;
  if exists (select 1 from cadastro.acesso_paciente a where a.usuario_id = familiar) then
    raise exception 'REVOGACAO_REABERTA_POR_LINK_ANTIGO';
  end if;

  -- 7. Atestado inválido é recusado antes de qualquer leitura de convite.
  update identidade.convite_familiar set acesso_revogado_em = null, acesso_revogado_por = null
    where id = convite_a;
  t := public.transporte_ativacao(convite_a, 'hmac-familiar-a', 'invalido');
  begin
    execute 'set local role authenticated';
    perform api.ativar_convite_familiar_privado(t);
    raise exception 'ATESTADO_INVALIDO_ACEITO';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end $$;

-- Reenvio (FR-051): reserva e conclusão em transações distintas, idempotentes pela
-- tentativa. O alvo aqui é a lógica de reserva; a checagem de sessão administrativa dos
-- wrappers segue o padrão já provado nas demais fatias.
do $$
declare
  admin constant uuid := '10000000-0000-4000-8000-000000000001';
  convite_b constant uuid := '60000000-0000-4000-8000-000000000002';
  tentativa constant uuid := '70000000-0000-4000-8000-000000000001';
  outra constant uuid := '70000000-0000-4000-8000-000000000002';
  r jsonb;
begin
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","session_id":"%s","amr":[{"method":"oauth"}]}',
      admin, '20000000-0000-4000-8000-000000000001'), true);

  r := identidade.reservar_reenvio_familiar_privado(convite_b, tentativa, gen_random_uuid());
  if r ->> 'ok' is distinct from 'true' or r ->> 'repeticao' is distinct from 'false' then
    raise exception 'RESERVA_NEGADA %', r;
  end if;
  -- Repetir a MESMA tentativa não dispara novo envio: devolve a reserva existente.
  r := identidade.reservar_reenvio_familiar_privado(convite_b, tentativa, gen_random_uuid());
  if r ->> 'ok' is distinct from 'true' or r ->> 'repeticao' is distinct from 'true' then
    raise exception 'RESERVA_NAO_IDEMPOTENTE %', r;
  end if;
  -- Outra tentativa enquanto a primeira está em aberto é recusada, não enfileirada.
  r := identidade.reservar_reenvio_familiar_privado(convite_b, outra, gen_random_uuid());
  if r ->> 'codigo' is distinct from 'envio_em_andamento' then
    raise exception 'RESERVA_CONCORRENTE_ACEITA %', r;
  end if;
  r := identidade.concluir_reenvio_familiar_privado(convite_b, tentativa, gen_random_uuid(), true);
  if r ->> 'ok' is distinct from 'true' then raise exception 'CONCLUSAO_NEGADA %', r; end if;
  if not exists (select 1 from identidade.convite_familiar c
    where c.id = convite_b and c.estado = 'enviado' and c.tentativa_envio_id is null
      and c.ultima_tentativa_id = tentativa) then
    raise exception 'CONCLUSAO_NAO_REGISTRADA';
  end if;
  -- Concluir de novo a mesma tentativa não reabre nem duplica o envio.
  r := identidade.concluir_reenvio_familiar_privado(convite_b, tentativa, gen_random_uuid(), true);
  if r ->> 'codigo' is distinct from 'tentativa_indisponivel' then
    raise exception 'CONCLUSAO_REPETIDA_ACEITA %', r;
  end if;
  r := identidade.reservar_reenvio_familiar_privado(convite_b, tentativa, gen_random_uuid());
  if r ->> 'codigo' is distinct from 'tentativa_concluida' then
    raise exception 'TENTATIVA_CONCLUIDA_REABERTA %', r;
  end if;

  -- Revogar a pré-autorização fecha o reenvio na hora.
  update identidade.convite_familiar set acesso_preautorizado_id = '50000000-0000-4000-8000-00000000000b',
      acesso_autorizado_por = admin, acesso_autorizado_em = clock_timestamp(),
      motivo_acesso_cifrado = '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',
      digest_autorizacao = 'digest-autorizacao-b'
    where id = convite_b;
  update identidade.convite_familiar set acesso_revogado_em = clock_timestamp(), acesso_revogado_por = admin
    where id = convite_b;
  r := identidade.reservar_reenvio_familiar_privado(convite_b, outra, gen_random_uuid());
  if r ->> 'codigo' is distinct from 'convite_indisponivel' then
    raise exception 'REENVIO_APOS_REVOGACAO_ACEITO %', r;
  end if;
end $$;

-- A garantia estrutural: o papel da ativação não tem como provisionar, mesmo que o
-- corpo da função mude. A aplicação também não alcança a tabela de convites.
do $$
begin
  if has_any_column_privilege('ffcmapp_ativar_familiar_owner', 'public.usuario', 'insert')
    or has_any_column_privilege('ffcmapp_ativar_familiar_owner', 'cadastro.acesso_paciente', 'insert') then
    raise exception 'ATIVACAO_COM_PRIVILEGIO_DE_PROVISIONAMENTO';
  end if;
  if exists (select 1 from pg_roles r where r.rolname in ('ffcmapp_ativar_familiar_owner', 'ffcmapp_convite_familiar_owner')
    and (r.rolcanlogin or r.rolsuper or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb)) then
    raise exception 'OWNER_COM_PRIVILEGIO_EXCESSIVO';
  end if;
  if has_table_privilege('authenticated', 'identidade.convite_familiar', 'select')
    or has_any_column_privilege('authenticated', 'identidade.convite_familiar', 'select') then
    raise exception 'APLICACAO_COM_CONVITE_DIRETO';
  end if;
end $$;
