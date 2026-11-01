-- Exclusivamente para banco local isolado criado para este teste; não executar no Supabase.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database() <> 'ffcm_desafio_teste_local' then
    raise exception 'Banco de teste isolado obrigatório';
  end if;
end $$;
create schema identidade;
create role anon nologin;
create role authenticated nologin;
-- Simula privilégio default explícito anterior; o rascunho deve revogá-lo.
alter default privileges in schema identidade grant execute on functions to anon, authenticated;
create table identidade.desafio_login (
  id uuid primary key,
  nonce_hash text not null check (length(btrim(nonce_hash)) > 0),
  expira_em timestamptz not null,
  consumido_em timestamptz,
  criado_em timestamptz not null default clock_timestamp(),
  constraint desafio_login_ordem_datas_chk check (
    expira_em > criado_em and (consumido_em is null or consumido_em >= criado_em)
  )
);
\ir ../drafts/20261031120000_desafio_google.sql
do $$
declare
  id uuid := '11111111-1111-4111-8111-111111111111';
  hash text := repeat('a', 64);
begin
  perform identidade.registrar_desafio_google(id, hash, clock_timestamp() + interval '1 minute');
  if identidade.consumir_desafio_google(id, repeat('b', 64)) then
    raise exception 'hash incorreto consumiu desafio';
  end if;
  if not identidade.consumir_desafio_google(id, hash) then
    raise exception 'desafio válido recusado';
  end if;
  if identidade.consumir_desafio_google(id, hash) then
    raise exception 'desafio consumido duas vezes';
  end if;
  if identidade.consumir_desafio_google(null, hash) then
    raise exception 'id nulo aceito';
  end if;
  insert into identidade.desafio_login (id, nonce_hash, criado_em, expira_em)
  values ('33333333-3333-4333-8333-333333333333', hash,
    clock_timestamp() - interval '2 minutes', clock_timestamp() - interval '1 minute');
  if identidade.consumir_desafio_google('33333333-3333-4333-8333-333333333333', hash) then
    raise exception 'desafio expirado aceito';
  end if;
  begin
    perform identidade.registrar_desafio_google(id, hash, clock_timestamp() + interval '1 minute');
    raise exception 'id repetido aceito';
  exception when unique_violation then null; end;
  begin
    perform identidade.registrar_desafio_google('22222222-2222-4222-8222-222222222222', hash, clock_timestamp() - interval '1 second');
    raise exception 'expiração passada aceita';
  exception when invalid_parameter_value then null; end;
  begin
    perform identidade.registrar_desafio_google('22222222-2222-4222-8222-222222222222', hash, clock_timestamp() + interval '601 seconds');
    raise exception 'TTL acima do limite aceito';
  exception when invalid_parameter_value then null; end;
  begin
    perform identidade.registrar_desafio_google('22222222-2222-4222-8222-222222222222', 'inválido', clock_timestamp() + interval '1 minute');
    raise exception 'hash inválido aceito';
  exception when invalid_parameter_value then null; end;
  if has_function_privilege('public', 'identidade.registrar_desafio_google(uuid,text,timestamptz)', 'execute')
    or has_function_privilege('public', 'identidade.consumir_desafio_google(uuid,text)', 'execute')
    or has_function_privilege('anon', 'identidade.registrar_desafio_google(uuid,text,timestamptz)', 'execute')
    or has_function_privilege('anon', 'identidade.consumir_desafio_google(uuid,text)', 'execute')
    or has_function_privilege('authenticated', 'identidade.registrar_desafio_google(uuid,text,timestamptz)', 'execute')
    or has_function_privilege('authenticated', 'identidade.consumir_desafio_google(uuid,text)', 'execute') then
    raise exception 'execução pública permitida';
  end if;
end $$;
rollback;
