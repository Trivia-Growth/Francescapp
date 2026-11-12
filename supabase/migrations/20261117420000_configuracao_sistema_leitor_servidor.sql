-- Leitor de configuração para o processo do servidor (Netlify Functions), espelhando a cadeia do
-- Vault (`20261027170000_vault_owner_restrito.sql`): papel LOGIN de runtime não enxerga a tabela,
-- só pode `SET ROLE` para um executor sem login, que só pode EXECUTE nesta função.
--
-- A função expõe SOMENTE linhas `exposicao = 'servidor'`. Chave de exposição 'administracao'
-- existe para a tela autenticada e nunca cai no processo do servidor por este caminho.
--
-- Não é caminho de autorização: devolve parâmetro operacional (serviço ligado/desligado, rótulo,
-- limite). Quem decide permissão continua sendo a operação privada com sessão, concessão e
-- atestado. Por isso não há `auth_privado.uid()` aqui — não existe usuário neste caminho.
create role ffcmapp_configuracao_leitor_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role ffcmapp_configuracao_leitor_executor nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_configuracao_leitor_owner to current_user with inherit false, set true;
grant usage on schema identidade to ffcmapp_configuracao_leitor_owner, ffcmapp_configuracao_leitor_executor;
-- `exposicao` entra no grant porque é o filtro da própria consulta; `rotulo`, `descricao` e
-- autoria não entram: o processo do servidor não tem o que fazer com eles.
grant select (chave, valor, tipo, versao, exposicao) on identidade.configuracao_sistema to ffcmapp_configuracao_leitor_owner;
create policy configuracao_sistema_leitor_servidor on identidade.configuracao_sistema
  for select to ffcmapp_configuracao_leitor_owner using (exposicao = 'servidor');

create function identidade.ler_configuracao_sistema_publica() returns jsonb
language sql security definer stable set search_path = '' set row_security = on as $$
  select coalesce(jsonb_object_agg(c.chave, jsonb_build_object('valor', c.valor, 'tipo', c.tipo, 'versao', c.versao)), '{}'::jsonb)
  from identidade.configuracao_sistema c
  where c.exposicao = 'servidor';
$$;
revoke all on function identidade.ler_configuracao_sistema_publica() from public, anon, authenticated, service_role;
alter function identidade.ler_configuracao_sistema_publica() owner to ffcmapp_configuracao_leitor_owner;

select set_config('ffcmapp.configuracao_leitor_migrador', current_user, false);
set role ffcmapp_configuracao_leitor_owner;
revoke all on function identidade.ler_configuracao_sistema_publica() from public, anon, authenticated, service_role;
grant execute on function identidade.ler_configuracao_sistema_publica() to ffcmapp_configuracao_leitor_executor;
reset role;
select set_config('role', current_setting('ffcmapp.configuracao_leitor_migrador'), false);
revoke ffcmapp_configuracao_leitor_owner from current_user;

-- PASSO OPERACIONAL FORA DE MIGRATION (igual ao Vault): o papel LOGIN de runtime não é criado
-- aqui porque credencial não entra em migration versionada. Depois de aplicar, executar uma vez
-- com o papel administrativo do projeto, substituindo <FFCM_CONFIG_DB_USER> pelo usuário LOGIN já
-- provisionado para o pool:
--
--   grant ffcmapp_configuracao_leitor_executor to <FFCM_CONFIG_DB_USER> with inherit false, set true;
--
-- `inherit false` é obrigatório: o papel de runtime só ganha o privilégio dentro de um
-- `SET LOCAL ROLE` explícito, numa transação com `statement_timeout` curto. Sem isso, qualquer
-- consulta do pool passaria a enxergar a configuração do servidor.
--
-- Enquanto esse passo não for executado, o leitor do servidor falha e o código cai na variável de
-- ambiente (ver `netlify/functions/_shared/configuracao-servidor.ts`). Falha de leitura NUNCA
-- liga um serviço: o padrão continua sendo o valor de ambiente.
