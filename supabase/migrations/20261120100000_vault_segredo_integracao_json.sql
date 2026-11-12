-- FR-030. A guarda de anexos usa o Google Drive institucional, e a credencial do Google é um
-- JSON de conta de serviço — não um token curto como a chave do OpenRouter.
--
-- Por que ESTENDER o leitor de `20261119100000` em vez de criar um segundo: a cadeia de papéis
-- (dono sem login guarda a função, executor sem login é o único que executa, papel LOGIN do pool
-- só alcança o executor dentro de `SET LOCAL ROLE`) é exatamente a mesma, e duplicá-la criaria
-- uma segunda superfície para revisar e revogar. O que muda é só a VALIDAÇÃO do valor lido.
--
-- A validação não é formalidade: o leitor antigo recusa qualquer coisa acima de 512 caracteres e
-- qualquer caractere fora de `[\x21-\x7e]` (sem espaço). Um JSON de conta de serviço tem ~2 KiB e
-- pode conter espaço. Sem esta migration, a referência do Drive seria cadastrada e a leitura
-- falharia fechada para sempre — indisponibilidade silenciosa, não erro visível.
--
-- `formato` fica na tabela de referências, não no código: assim o teto de tamanho de um segredo
-- de token continua sendo 512 mesmo depois desta migration. Ampliar o limite para todos seria
-- afrouxar a frente de transcrição sem necessidade.
--
-- NÃO provisiona segredo: credencial não entra em migration versionada, nem em repositório, nem
-- em log. Quem cadastra o VALOR no Vault é o solicitante.
select set_config('ffcmapp.migrador_segredo_json', current_user, false);
grant ffcmapp_segredo_integracao_owner to current_user with inherit false, set true;
-- Refazer a função exige CREATE no schema, e `20261119100000` revogou esse CREATE ao terminar,
-- de propósito: o papel não guarda poder de criar objetos em `identidade`. Devolvemos só pelo
-- tempo da troca e tiramos de novo no fim, como lá.
grant create on schema identidade to ffcmapp_segredo_integracao_owner;

set role ffcmapp_segredo_integracao_owner;

alter table identidade.referencias_integracao_vault
  add column formato text not null default 'token' check (formato in ('token', 'json'));

comment on column identidade.referencias_integracao_vault.formato is
  'Forma esperada do segredo: `token` (texto curto imprimível) ou `json` (documento JSON de credencial). Define a validação em `ler_segredo_integracao_vault`.';

-- Cadastrar a REFERÊNCIA não é cadastrar o SEGREDO. Enquanto o valor não existir no Vault, a
-- leitura falha fechada e a guarda de documentos fica indisponível — nunca "ligada sem
-- credencial".
insert into identidade.referencias_integracao_vault (referencia, formato)
values ('ffcmapp.integracao.google_drive', 'json');

create or replace function identidade.ler_segredo_integracao_vault(p_referencia text)
returns text language plpgsql security definer set search_path = pg_catalog as $$
declare segredo text; formato text;
begin
  if p_referencia is null or p_referencia !~ '^ffcmapp\.integracao\.[a-z0-9][a-z0-9_-]{0,63}$' then
    raise exception using errcode = '55000', message = 'CONFIGURACAO_INTEGRACAO_AUSENTE';
  end if;
  begin
    select r.formato into formato from identidade.referencias_integracao_vault r
      where r.referencia = p_referencia and r.ativa for share;
    if not found then raise exception 'referência não autorizada'; end if;
    select decrypted_secret into strict segredo from vault.decrypted_secrets where name = p_referencia;
    if segredo is null then raise exception 'configuração inválida'; end if;
    if formato = 'token' then
      -- Teto e faixa de caracteres evitam devolver lixo binário ou um valor absurdo ao
      -- processo do servidor; o formato exato do token é do provedor, não nosso.
      if length(segredo) not between 8 and 512 or segredo !~ '^[\x21-\x7e]+$' then
        raise exception 'configuração inválida';
      end if;
    else
      -- Credencial em JSON: o teto é maior e o espaço é permitido, mas o valor precisa ser um
      -- OBJETO JSON de verdade. Devolver texto livre ao processo do servidor sob o nome de
      -- credencial é o que permite que um valor colado errado vire falha remota obscura.
      if length(segredo) not between 32 and 8192
        or jsonb_typeof(segredo::jsonb) is distinct from 'object' then
        raise exception 'configuração inválida';
      end if;
    end if;
  exception when others then
    raise exception using errcode = '55000', message = 'CONFIGURACAO_INTEGRACAO_AUSENTE';
  end;
  return segredo;
end $$;
revoke all on function identidade.ler_segredo_integracao_vault(text) from public, anon, authenticated;
grant execute on function identidade.ler_segredo_integracao_vault(text) to ffcmapp_segredo_integracao_executor;

reset role;
select set_config('role', current_setting('ffcmapp.migrador_segredo_json'), false);
revoke create on schema identidade from ffcmapp_segredo_integracao_owner;
revoke ffcmapp_segredo_integracao_owner from current_user;

-- PASSO OPERACIONAL FORA DE MIGRATION: o `grant ffcmapp_segredo_integracao_executor to
-- <FFCM_VAULT_DB_USER> with inherit false, set true;` de `20261119100000` continua valendo e
-- não precisa ser repetido — a cadeia de papéis é a mesma.
