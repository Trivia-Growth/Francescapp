-- Preparação interna D-04: nenhuma função é exposta ao navegador ou runtime.
-- A cifra autenticada é produzida pelo servidor; o banco armazena o envelope.
create table identidade.credencial_sessao (
  session_id uuid primary key references identidade.sessao(session_id) on delete restrict,
  estado text not null check (estado in ('disponivel', 'em_troca', 'incerta')),
  geracao bigint not null default 0 check (geracao >= 0),
  envelope jsonb not null check ((
    jsonb_typeof(envelope) = 'object'
    and envelope - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
    and envelope ->> 'formato' = '1'
    and nullif(envelope ->> 'key_id', '') is not null
    and nullif(envelope ->> 'nonce', '') is not null
    and nullif(envelope ->> 'ciphertext', '') is not null
    and nullif(envelope ->> 'tag', '') is not null
  ) is true)
);
alter table identidade.credencial_sessao enable row level security;
revoke all on identidade.credencial_sessao from public, anon, authenticated;

-- Guardas de integridade, não RPCs de negócio: a operação autorizada precisa
-- bloquear concessão e usuário, revogar sessões com ator/motivo e auditar na
-- mesma transação antes de mudar autoridade. Sem ela, mudanças são recusadas.
create function identidade.exigir_sessoes_revogadas_usuario()
returns trigger language plpgsql security definer set search_path = pg_catalog set row_security = off as $$
begin
  if old.ativo and not new.ativo and exists (
    select 1 from identidade.sessao s where s.usuario_id = old.id and s.revogada_em is null
  ) then
    raise exception 'revogue as sessões antes de desativar usuário' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function identidade.exigir_sessoes_revogadas_usuario() from public, anon, authenticated;
create trigger usuario_exige_sessoes_revogadas before update of ativo on public.usuario
  for each row execute function identidade.exigir_sessoes_revogadas_usuario();

create function identidade.exigir_sessoes_revogadas_concessao()
returns trigger language plpgsql security definer set search_path = pg_catalog set row_security = off as $$
begin
  if old.estado <> new.estado and not (
    (old.estado = 'pendente' and new.estado in ('vinculada', 'revogada')) or
    (old.estado = 'vinculada' and new.estado = 'revogada')
  ) then
    raise exception 'transição de concessão inválida' using errcode = '23514';
  end if;
  if old.estado = 'revogada' and
    (new.revogada_em, new.revogada_por_usuario_id, new.motivo_revogacao_cifrado) is distinct from
    (old.revogada_em, old.revogada_por_usuario_id, old.motivo_revogacao_cifrado) then
    raise exception 'revogação de concessão imutável' using errcode = '23514';
  end if;
  if old.estado <> 'revogada' and new.estado = 'revogada' and exists (
    select 1 from identidade.sessao s where s.concessao_id = old.id and s.revogada_em is null
  ) then
    raise exception 'revogue as sessões antes de revogar concessão' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function identidade.exigir_sessoes_revogadas_concessao() from public, anon, authenticated;
create trigger concessao_exige_sessoes_revogadas before update on identidade.concessao_equipe
  for each row execute function identidade.exigir_sessoes_revogadas_concessao();

-- Qualquer admissão participa do mesmo protocolo; parâmetros não conferem
-- autorização, que continua responsabilidade da futura RPC de negócio.
create function identidade.validar_insercao_sessao()
returns trigger language plpgsql security definer set search_path = pg_catalog set row_security = off as $$
begin
  perform 1 from identidade.concessao_equipe c where c.id = new.concessao_id for update;
  if not found then raise exception 'concessão indisponível' using errcode = '23514'; end if;
  perform 1 from public.usuario u where u.id = new.usuario_id for update;
  if not found then raise exception 'usuário indisponível' using errcode = '23514'; end if;
  if not exists (select 1 from identidade.concessao_equipe c
    join public.usuario u on u.id = c.usuario_id and u.ativo
    where c.id = new.concessao_id and c.usuario_id = new.usuario_id and c.estado = 'vinculada') then
    raise exception 'admissão sem autoridade vigente' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function identidade.validar_insercao_sessao() from public, anon, authenticated;
create trigger sessao_valida_insercao before insert on identidade.sessao
  for each row execute function identidade.validar_insercao_sessao();

create function identidade.proteger_tombstone_sessao()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'remoção de sessão não permitida' using errcode = '23514';
  end if;
  if (new.session_id, new.usuario_id, new.concessao_id) is distinct from
     (old.session_id, old.usuario_id, old.concessao_id) or
     (old.revogada_em is not null and
       (new.revogada_em, new.revogada_por_usuario_id, new.motivo_revogacao_cifrado) is distinct from
       (old.revogada_em, old.revogada_por_usuario_id, old.motivo_revogacao_cifrado)) then
    raise exception 'identidade ou revogação de sessão imutável' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function identidade.proteger_tombstone_sessao() from public, anon, authenticated;
create trigger sessao_protege_tombstone before update or delete on identidade.sessao
  for each row execute function identidade.proteger_tombstone_sessao();

-- Ordem obrigatória em todas as futuras operações concorrentes: concessão,
-- usuário, sessão, credencial. Se houver várias linhas, ordenar por ID em
-- cada classe. As RPCs de revogação/desativação ainda não existem: deverão
-- respeitar esta ordem e revogar as sessões na mesma transação. Nunca chamar
-- Auth enquanto os locks estiverem retidos.
create function identidade.iniciar_renovacao(p_sessao uuid, p_usuario uuid)
returns table(geracao bigint, envelope jsonb)
language plpgsql security invoker set search_path = pg_catalog as $$
declare v_concessao uuid;
begin
  -- A leitura inicial só identifica a linha a bloquear; não autoriza a troca.
  select s.concessao_id into v_concessao from identidade.sessao s
    where s.session_id = p_sessao and s.usuario_id = p_usuario;
  if not found then return; end if;
  perform 1 from identidade.concessao_equipe c where c.id = v_concessao for update;
  if not found then return; end if;
  perform 1 from public.usuario u where u.id = p_usuario for update;
  if not found then return; end if;
  perform 1 from identidade.sessao s where s.session_id = p_sessao for update;
  if not found then return; end if;
  -- Releitura após TODOS os locks: descarta mudanças enquanto se aguardava.
  perform 1 from identidade.sessao s
    join public.usuario u on u.id = s.usuario_id and u.ativo
    join identidade.concessao_equipe c on c.id = s.concessao_id
      and c.usuario_id = u.id and c.estado = 'vinculada'
    where s.session_id = p_sessao and s.usuario_id = p_usuario
      and s.concessao_id = v_concessao and s.revogada_em is null;
  if not found then return; end if;
  return query update identidade.credencial_sessao cs
    set estado = 'em_troca', geracao = cs.geracao + 1
    where cs.session_id = p_sessao and cs.estado = 'disponivel'
    returning cs.geracao, cs.envelope;
end $$;
revoke all on function identidade.iniciar_renovacao(uuid,uuid) from public, anon, authenticated;

create function identidade.finalizar_renovacao(p_sessao uuid, p_usuario uuid, p_geracao bigint, p_envelope jsonb)
returns boolean language plpgsql security invoker set search_path = pg_catalog as $$
declare v_concessao uuid;
begin
  select s.concessao_id into v_concessao from identidade.sessao s
    where s.session_id = p_sessao and s.usuario_id = p_usuario;
  if not found then return false; end if;
  perform 1 from identidade.concessao_equipe c where c.id = v_concessao for update;
  if not found then return false; end if;
  perform 1 from public.usuario u where u.id = p_usuario for update;
  if not found then return false; end if;
  perform 1 from identidade.sessao s where s.session_id = p_sessao for update;
  if not found then return false; end if;
  perform 1 from identidade.sessao s
    join public.usuario u on u.id = s.usuario_id and u.ativo
    join identidade.concessao_equipe c on c.id = s.concessao_id
      and c.usuario_id = u.id and c.estado = 'vinculada'
    where s.session_id = p_sessao and s.usuario_id = p_usuario
      and s.concessao_id = v_concessao and s.revogada_em is null;
  if not found then return false; end if;
  update identidade.credencial_sessao cs set estado = 'disponivel', envelope = p_envelope
    where cs.session_id = p_sessao and cs.estado = 'em_troca' and cs.geracao = p_geracao;
  return found;
end $$;
revoke all on function identidade.finalizar_renovacao(uuid,uuid,bigint,jsonb) from public, anon, authenticated;

create function identidade.invalidar_renovacao(p_sessao uuid, p_usuario uuid, p_geracao bigint)
returns boolean language plpgsql security invoker set search_path = pg_catalog as $$
begin
  perform 1 from identidade.sessao s where s.session_id = p_sessao and s.usuario_id = p_usuario for update;
  if not found then return false; end if;
  update identidade.credencial_sessao cs set estado = 'incerta'
    where cs.session_id = p_sessao and cs.estado = 'em_troca' and cs.geracao = p_geracao;
  return found;
end $$;
revoke all on function identidade.invalidar_renovacao(uuid,uuid,bigint) from public, anon, authenticated;

-- Falha fechada também durante troca ou quando a credencial não foi instalada.
create or replace function identidade.sessao_atual_valida()
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth, identidade as $$
  with contexto as (
    select case when coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then auth.uid() else null::uuid end as usuario_id,
      case when (auth.jwt() ->> 'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (auth.jwt() ->> 'session_id')::uuid else null::uuid end as session_id
  )
  select exists (select 1 from contexto x
    join public.usuario u on u.id = x.usuario_id and u.ativo
    join identidade.sessao s on s.usuario_id = u.id and s.revogada_em is null and s.session_id = x.session_id
    join identidade.concessao_equipe c on c.id = s.concessao_id and c.estado = 'vinculada' and c.usuario_id = u.id
    join identidade.credencial_sessao cs on cs.session_id = s.session_id and cs.estado = 'disponivel');
$$;
revoke all on function identidade.sessao_atual_valida() from public, anon, authenticated;
