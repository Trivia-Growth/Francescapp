-- FR-010. Leitor de segredo de integração externa (hoje: a chave do OpenRouter usada na
-- transcrição). Espelha `20261104120000_vault_atestado.sql`: papel dono sem login guarda a
-- função, papel executor sem login é o único que pode executá-la, e o papel LOGIN de runtime
-- só alcança o executor dentro de um `SET LOCAL ROLE` explícito.
--
-- Diferença em relação ao leitor de chave criptográfica: aqui o segredo é um TOKEN de texto,
-- não uma chave de 32 bytes, então não há validação de base64 nem de tamanho exato. O que
-- protege é a lista de referências autorizadas: só nomes `ffcmapp.integracao.*` previamente
-- cadastrados são legíveis, e o prefixo impede alcançar `ffcmapp.cifra.*` ou
-- `ffcmapp.atestado.*` por este caminho.
--
-- NÃO provisiona segredo: credencial não entra em migration versionada. Quem cadastra o
-- valor no Vault é o solicitante (ver `tasks.md` da mudança `transcricao-audio-relato`).
select set_config('ffcmapp.migrador_segredo_integracao', current_user, false);
create role ffcmapp_segredo_integracao_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role ffcmapp_segredo_integracao_executor nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_segredo_integracao_owner to current_user with inherit false, set true;
grant usage, create on schema identidade to ffcmapp_segredo_integracao_owner;
grant usage on schema identidade to ffcmapp_segredo_integracao_executor;
grant usage on schema vault to ffcmapp_segredo_integracao_owner;
grant select on vault.decrypted_secrets to ffcmapp_segredo_integracao_owner;
grant execute on function vault._crypto_aead_det_decrypt(bytea, bytea, bigint, bytea, bytea) to ffcmapp_segredo_integracao_owner;

set role ffcmapp_segredo_integracao_owner;
alter default privileges revoke execute on functions from public;
create table identidade.referencias_integracao_vault (
  referencia text primary key check (referencia ~ '^ffcmapp\.integracao\.[a-z0-9][a-z0-9_-]{0,63}$'),
  ativa boolean not null default true
);
revoke all on identidade.referencias_integracao_vault from public, anon, authenticated, ffcmapp_segredo_integracao_executor;

-- A referência do provedor de transcrição já entra cadastrada: cadastrar a REFERÊNCIA não
-- é cadastrar o SEGREDO. Enquanto o valor não existir no Vault, a leitura falha fechada e a
-- transcrição fica indisponível — nunca "ligada sem credencial".
insert into identidade.referencias_integracao_vault(referencia) values ('ffcmapp.integracao.openrouter');

create function identidade.ler_segredo_integracao_vault(p_referencia text)
returns text language plpgsql security definer set search_path = pg_catalog as $$
declare segredo text;
begin
  if p_referencia is null or p_referencia !~ '^ffcmapp\.integracao\.[a-z0-9][a-z0-9_-]{0,63}$' then
    raise exception using errcode = '55000', message = 'CONFIGURACAO_INTEGRACAO_AUSENTE';
  end if;
  begin
    perform 1 from identidade.referencias_integracao_vault where referencia = p_referencia and ativa for share;
    if not found then raise exception 'referência não autorizada'; end if;
    select decrypted_secret into strict segredo from vault.decrypted_secrets where name = p_referencia;
    -- Teto e faixa de caracteres evitam devolver lixo binário ou um valor absurdo ao
    -- processo do servidor; o formato exato do token é do provedor, não nosso.
    if segredo is null or length(segredo) not between 8 and 512 or segredo !~ '^[\x21-\x7e]+$' then
      raise exception 'configuração inválida';
    end if;
  exception when others then
    raise exception using errcode = '55000', message = 'CONFIGURACAO_INTEGRACAO_AUSENTE';
  end;
  return segredo;
end $$;
revoke all on function identidade.ler_segredo_integracao_vault(text) from public, anon, authenticated;
grant execute on function identidade.ler_segredo_integracao_vault(text) to ffcmapp_segredo_integracao_executor;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_segredo_integracao'), false);
revoke create on schema identidade from ffcmapp_segredo_integracao_owner;
revoke ffcmapp_segredo_integracao_owner from current_user;

-- PASSO OPERACIONAL FORA DE MIGRATION (igual ao Vault e ao leitor de configuração):
--
--   grant ffcmapp_segredo_integracao_executor to <FFCM_VAULT_DB_USER> with inherit false, set true;
--
-- `inherit false` é obrigatório: sem isso qualquer consulta do pool passaria a enxergar o
-- segredo. Enquanto esse passo não for executado, a transcrição falha fechada.
