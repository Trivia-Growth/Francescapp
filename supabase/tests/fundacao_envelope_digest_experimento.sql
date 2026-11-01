-- Apenas banco e socket descartáveis; não aplica migração nem usa dados reais.
\set ON_ERROR_STOP on
do $$ declare s text := current_setting('unix_socket_directories'); begin
 if current_database() <> 'ffcm_digest_teste_local' or inet_server_addr() is not null
  or s !~ '^/tmp/ffcm-digest[.][A-Za-z0-9]+$' or current_setting('data_directory') <> s || '/data'
 then raise exception 'cluster descartável obrigatório'; end if;
end $$;
begin;
\ir ../drafts/20261105000000_envelope_digest_experimento.sql
insert into experimento_digest.credencial(session_id,envelope) values
 ('00000000-0000-4000-8000-000000000001','{"ciphertext":"alheio","tag":"t"}');
set local role ffcm_digest_owner_fixture;
do $$ begin
 begin perform envelope from experimento_digest.credencial;
  raise exception 'owner leu envelope'; exception when insufficient_privilege then null; end;
 if not exists(select 1 from experimento_digest.credencial where session_id='00000000-0000-4000-8000-000000000001' and envelope_digest is not null)
  then raise exception 'digest alheio não visível'; end if;
 perform experimento_digest.inserir('00000000-0000-4000-8000-000000000002','{"ciphertext":"original","tag":"t"}');
end $$;
reset role;
create function pg_temp.adulterar_digest() returns trigger language plpgsql as $$ begin
 new.envelope:=jsonb_set(new.envelope,'{ciphertext}','"adulterado"'); return new; end $$;
create trigger adulterar_digest before insert on experimento_digest.credencial for each row execute function pg_temp.adulterar_digest();
set local role ffcm_digest_owner_fixture;
do $$ begin
 begin perform experimento_digest.inserir('00000000-0000-4000-8000-000000000003','{"ciphertext":"original","tag":"t"}');
  raise exception 'adulteração aceita'; exception when sqlstate 'P0002' then
  if sqlerrm <> 'CREDENCIAL_INCONSISTENTE' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from experimento_digest.credencial where session_id='00000000-0000-4000-8000-000000000002' and envelope->>'ciphertext'='original')
  or exists(select 1 from experimento_digest.credencial where session_id='00000000-0000-4000-8000-000000000003')
 then raise exception 'integridade ou rollback falhou'; end if;
end $$;
drop trigger adulterar_digest on experimento_digest.credencial;
-- Contraexemplo: trigger privilegiado e adiado pode modificar após o retorno
-- da função. A comparação anterior ao commit não detecta essa alteração.
create function pg_temp.adulterar_adiado_digest() returns trigger language plpgsql security definer set search_path=pg_catalog as $$ begin
 update experimento_digest.credencial set envelope=jsonb_set(envelope,'{ciphertext}','"adiado"') where session_id=new.session_id;
 return null;
end $$;
create constraint trigger adulterar_adiado_digest after insert on experimento_digest.credencial
 deferrable initially deferred for each row execute function pg_temp.adulterar_adiado_digest();
set local role ffcm_digest_owner_fixture;
select experimento_digest.inserir('00000000-0000-4000-8000-000000000004','{"ciphertext":"original","tag":"t"}');
reset role;
set constraints all immediate;
do $$ begin
 if not exists(select 1 from experimento_digest.credencial where session_id='00000000-0000-4000-8000-000000000004' and envelope->>'ciphertext'='adiado')
 then raise exception 'contraexemplo de trigger adiado não reproduzido'; end if;
end $$;
rollback;
