-- RASCUNHO: não executar automaticamente nem aplicar remotamente.
-- Privilégios, identidade do runtime e vínculo do consumo à admissão pendentes.
-- Funções SECURITY INVOKER não concedem acesso à tabela a qualquer papel.
-- O consumo exige commit confirmado antes da chamada Auth; resultado incerto falha fechado.
create function identidade.registrar_desafio_google(
  p_id uuid, p_hash text, p_expira_em timestamptz
) returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_agora timestamptz := clock_timestamp();
begin
  if p_id is null or p_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
     or p_expira_em is null or p_expira_em <= v_agora
     or p_expira_em > v_agora + interval '600 seconds' then
    raise exception using errcode = '22023', message = 'desafio inválido';
  end if;
  insert into identidade.desafio_login (id, nonce_hash, expira_em)
  values (p_id, p_hash, p_expira_em);
end $$;

create function identidade.consumir_desafio_google(p_id uuid, p_hash text)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_desafio identidade.desafio_login%rowtype;
  v_agora timestamptz;
begin
  if p_id is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  -- Reavaliar validade depois de adquirir o lock: uma espera pode ultrapassar TTL.
  select * into v_desafio from identidade.desafio_login where id = p_id for update;
  v_agora := clock_timestamp();
  if not found or v_desafio.nonce_hash <> p_hash or v_desafio.consumido_em is not null
     or v_desafio.expira_em <= v_agora then
    return false;
  end if;
  update identidade.desafio_login
     set consumido_em = v_agora
   where id = p_id;
  return found;
end $$;

revoke all on function identidade.registrar_desafio_google(uuid, text, timestamptz) from public;
revoke all on function identidade.consumir_desafio_google(uuid, text) from public;
revoke all on function identidade.registrar_desafio_google(uuid, text, timestamptz) from anon, authenticated;
revoke all on function identidade.consumir_desafio_google(uuid, text) from anon, authenticated;
