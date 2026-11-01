-- Apenas fixture descartável: não autentica identidade nem implementa admissão.
-- O digest revela metadados e permite testar hipóteses sobre envelopes; não
-- constitui confidencialidade sem criptografia autenticada e nonce aleatório.
create schema experimento_digest;
create role ffcm_digest_owner_fixture nologin nosuperuser noinherit nobypassrls;
create table experimento_digest.credencial (
 session_id uuid primary key,
 envelope jsonb not null,
 envelope_digest bytea generated always as (sha256(jsonb_send(envelope))) stored
);
grant usage on schema experimento_digest to ffcm_digest_owner_fixture;
grant insert(session_id,envelope),select(session_id,envelope_digest) on experimento_digest.credencial to ffcm_digest_owner_fixture;
create function experimento_digest.inserir(p_sessao uuid,p_envelope jsonb)
returns void language plpgsql security invoker set search_path=pg_catalog as $$
begin
 insert into experimento_digest.credencial(session_id,envelope) values(p_sessao,p_envelope);
 if not found or not exists(select 1 from experimento_digest.credencial
   where session_id=p_sessao and envelope_digest=sha256(jsonb_send(p_envelope))) then
  raise exception using errcode='P0002',message='CREDENCIAL_INCONSISTENTE';
 end if;
end $$;
revoke all on function experimento_digest.inserir(uuid,jsonb) from public;
grant execute on function experimento_digest.inserir(uuid,jsonb) to ffcm_digest_owner_fixture;
