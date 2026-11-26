begin;
-- FR-086 — quarta chave encontrada pela varredura de 20/11/2026, e a mais cara das quatro:
-- `ffcm.documentos.categorias`.
--
-- Ela nasceu `exposicao = 'publica'` (`20261120110000_documento_caso_privado.sql:131,136`),
-- com a justificativa de que "a tela de envio precisa oferecer as opções a qualquer
-- profissional autenticado". Só que quem a lê é o PROCESSO DO SERVIDOR:
-- `netlify/functions/documentos.ts:34` chama `listaConfigurada`, e esse leitor enxerga
-- somente `exposicao = 'servidor'` (`20261117420000:19,25`). Dois defeitos saem daí:
--
-- 1. O Administrador edita as categorias na tela, a gravação é aceita, e o servidor segue
--    devolvendo a lista VAZIA. `web/documentos-caso.ts:131-133` então informa "Nenhuma
--    categoria de anexo está configurada" e o envio de anexo fica sem classificação —
--    indefinidamente, qualquer que seja o valor gravado. É o mesmo interruptor que mente
--    de `20261127320000`, agora numa lista.
--
-- 2. Pior: `api.consultar_regras_atendimento` devolve TODAS as chaves `'publica'`
--    (`20261119320000:122`), e `regraAtendimentoSchema` exige `valor` TEXTO de 1 a 600
--    (`packages/contracts/src/regras-atendimento.ts:13`). Uma chave `'publica'` do tipo
--    `lista` faz `respostaRegrasAtendimentoPrivadaSchema.parse`
--    (`netlify/functions/_shared/regras-atendimento-nativa.ts:82`) lançar, e a tela de
--    Regras de atendimento inteira (FR-041) responde erro — pelo mesmo mecanismo já
--    registrado em 13/11/2026 com `drive_pasta_raiz`: uma única linha do catálogo derruba
--    a listagem inteira.
--
-- A correção resolve os dois: a chave passa a `'servidor'`, que é a exposição que o seu
-- leitor alcança. Nada perde alcance — a interface já recebe as categorias por
-- `/api/documentos?disponibilidade`, que exige sessão autenticada do mesmo jeito.
update identidade.configuracao_sistema
   set exposicao = 'servidor', versao = versao + 1, atualizado_em = now()
 where chave = 'ffcm.documentos.categorias'
   and exposicao <> 'servidor';

-- E a recorrência fica travada no banco, não na lembrança de quem escrever a próxima
-- migration: `'publica'` é o canal de TEXTO institucional lido por qualquer sessão
-- autenticada, e o contrato dessa rota só admite texto de 1 a 600 caracteres.
alter table identidade.configuracao_sistema
  add constraint configuracao_sistema_publica_texto_chk check ((
    exposicao <> 'publica'
    or (tipo = 'texto' and jsonb_typeof(valor) = 'string' and length(valor #>> '{}') <= 600)
  ) is true);

do $$
declare n integer;
begin
  select count(*) into n from identidade.configuracao_sistema
   where exposicao = 'publica' and tipo <> 'texto';
  if n > 0 then raise exception 'EXPOSICAO_PUBLICA_NAO_TEXTUAL: % chaves', n; end if;
end $$;

commit;
