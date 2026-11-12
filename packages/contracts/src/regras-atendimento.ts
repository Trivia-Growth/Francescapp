import { z } from 'zod';
import { uuidSchema } from './comum.ts';

/** FR-041: regras de funcionamento, períodos de acompanhamento, canais de retorno e uso do
 * diário. São linhas de `identidade.configuracao_sistema` com `exposicao = 'publica'`
 * (migration `20261119320000`): conteúdo institucional igual para todo mundo, sem dado pessoal.
 *
 * A tela de regras é SOMENTE LEITURA. Quem edita é Administrador, pela tela de configuração
 * já existente — por isso aqui não há schema de gravação. */
export const regraAtendimentoSchema = z
  .object({
    chave: z.string().regex(/^ffcm\.regras\.[a-z0-9][a-z0-9._-]{0,80}$/),
    valor: z.string().min(1).max(600),
    rotulo: z.string().trim().min(1).max(160),
    versao: z.number().int().min(1).max(2147483647),
    atualizado_em: z.iso.datetime({ offset: true }),
  })
  .strict();
export type RegraAtendimento = z.output<typeof regraAtendimentoSchema>;

export const regrasAtendimentoSchema = z.array(regraAtendimentoSchema);

export const respostaRegrasAtendimentoPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({ ok: z.literal(true), dados: regrasAtendimentoSchema, request_id: uuidSchema })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      erro: z.object({ codigo: z.literal('sem_permissao') }).strict(),
      request_id: uuidSchema,
    })
    .strict(),
]);
