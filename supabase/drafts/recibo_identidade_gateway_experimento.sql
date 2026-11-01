-- Experimento descartável. Não usar como migração nem como endpoint.
-- O papel gateway representa uma chamada JWT validada: essa premissa não é testada aqui.
do $$
declare v_socket text := current_setting('unix_socket_directories');
begin
  if not ((current_database() = 'ffcm_recibo_fixture' and v_socket ~ '^/tmp/ffcm-recibo\.[a-zA-Z0-9]+$')
       or (current_database() = 'ffcm_admissao_teste_local' and v_socket ~ '^/tmp/ffcm-admissao\.[a-zA-Z0-9]+$'))
    or inet_server_addr() is not null
    or current_setting('listen_addresses') <> ''
    or current_setting('data_directory') <> v_socket || '/data'
    or v_socket is distinct from current_setting('ffcm_fixture.socket_esperado', true)
    or current_setting('data_directory') is distinct from current_setting('ffcm_fixture.data_esperado', true)
    or coalesce(current_setting('ffcm_fixture.token_servidor', true), '') = ''
    or current_setting('ffcm_fixture.token_servidor', true) is distinct from current_setting('ffcm_fixture.token_esperado', true)
  then raise exception 'cluster local descartável obrigatório'; end if;
end $$;
create role recibo_owner_fixture nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role recibo_gateway_fixture nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role recibo_executor_fixture nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create schema recibo_fixture authorization recibo_owner_fixture;
grant usage on schema recibo_fixture to recibo_gateway_fixture, recibo_executor_fixture;
set local role recibo_owner_fixture;
create table recibo_fixture.recibo (
  id text primary key,
  usuario uuid not null,
  sessao uuid not null,
  digest text not null,
  expira_em timestamptz not null
);
-- Somente fixture: hashes derivam dos bytes recebidos por cada função.
create table recibo_fixture.recibo_vinculado (
  id text primary key,
  usuario uuid not null,
  sessao uuid not null,
  operacao text not null,
  audiencia text not null,
  digest bytea not null,
  expira_em timestamptz not null
);
create function recibo_fixture.emitir_vinculado(p_id text, p_operacao text, p_audiencia text, p_bytes bytea) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare v_claims jsonb := current_setting('request.jwt.claims', true)::jsonb;
begin
  if p_id is null or p_operacao is null or p_audiencia is null or p_bytes is null
    or v_claims->>'sub' is null or v_claims->>'session_id' is null then
    raise exception 'identidade inválida';
  end if;
  insert into recibo_fixture.recibo_vinculado values
    (p_id, (v_claims->>'sub')::uuid, (v_claims->>'session_id')::uuid,
     p_operacao, p_audiencia, sha256(p_bytes), clock_timestamp() + interval '1 minute');
end $$;
create function recibo_fixture.consumir_vinculado(p_id text, p_usuario uuid, p_sessao uuid, p_operacao text, p_audiencia text, p_bytes bytea) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
declare v_id text;
begin
  delete from recibo_fixture.recibo_vinculado
  where id=p_id and usuario=p_usuario and sessao=p_sessao and operacao=p_operacao
    and audiencia=p_audiencia and digest=sha256(p_bytes) and expira_em>clock_timestamp()
  returning id into v_id;
  return v_id is not null;
end $$;
revoke all on function recibo_fixture.emitir_vinculado(text,text,text,bytea) from public;
revoke all on function recibo_fixture.consumir_vinculado(text,uuid,uuid,text,text,bytea) from public;
grant execute on function recibo_fixture.emitir_vinculado(text,text,text,bytea) to recibo_gateway_fixture;
create function recibo_fixture.emitir(p_id text, p_digest text) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare v_claims jsonb := current_setting('request.jwt.claims', true)::jsonb;
begin
  if p_id is null or p_digest is null or v_claims->>'sub' is null or v_claims->>'session_id' is null then
    raise exception 'identidade inválida';
  end if;
  insert into recibo_fixture.recibo values
    (p_id, (v_claims->>'sub')::uuid, (v_claims->>'session_id')::uuid, p_digest, clock_timestamp() + interval '1 minute');
end $$;
create function recibo_fixture.consumir(p_id text, p_usuario uuid, p_sessao uuid, p_digest text) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
declare v_id text;
begin
  delete from recibo_fixture.recibo
  where id=p_id and usuario=p_usuario and sessao=p_sessao and digest=p_digest and expira_em>clock_timestamp()
  returning id into v_id;
  return v_id is not null;
end $$;
revoke all on function recibo_fixture.emitir(text,text) from public;
revoke all on function recibo_fixture.consumir(text,uuid,uuid,text) from public;
grant execute on function recibo_fixture.emitir(text,text) to recibo_gateway_fixture;
grant execute on function recibo_fixture.consumir(text,uuid,uuid,text) to recibo_executor_fixture;
reset role;
