import { z } from 'zod';
import { cursorSchema, limitePaginaSchema, uuidSchema, versaoSchema } from './comum.ts';

/** Estado parcial experimental, não é rota nem contrato completo de consulta.
 * Ausência/inconclusão não comprovam falha. Indisponibilidade permanece erro,
 * não um resultado de consulta bem-sucedida. Confirmação não dispensa nova
 * autorização para ler o paciente; este schema não comprova autorização.
 * resultado_id pode ser vinculável a uma pessoa. Uma futura resposta exige
 * autorização vigente, Cache-Control: no-store e ausência do conteúdo em logs;
 * esses controles ainda não estão implementados aqui. */
export const estadoReconciliacaoCadastroSchema = z.discriminatedUnion('estado', [
  z
    .object({
      estado: z.literal('confirmado'),
      resultado_id: uuidSchema,
      resultado_versao: versaoSchema,
    })
    .strict(),
  z.object({ estado: z.literal('pendente') }).strict(),
  z.object({ estado: z.literal('indeterminado') }).strict(),
]);

/** Experimento interno: identidade e perfil são derivados no servidor/banco,
 * nunca filtrados por parâmetros recebidos do cliente. Sem rota implementada.
 * cursorSchema só limita tamanho: antes de integrar, emitir e resolver cursor
 * opaco no servidor e impedir seu registro em logs; não comprovado aqui. */
export const consultaReconciliacaoCadastroSchema = z
  .object({ cursor: cursorSchema.optional(), limite: limitePaginaSchema })
  .strict();

/** A lista vazia não prova falha ou inexistência de requisição em trânsito.
 * IDs podem ser dados pessoais; este contrato não autoriza envio ao navegador. */
export const paginaReconciliacaoCadastroSchema = z
  .object({
    itens: z
      .array(
        z.object({ operacao_id: uuidSchema, situacao: estadoReconciliacaoCadastroSchema }).strict(),
      )
      .max(100),
    proximo_cursor: cursorSchema.nullable(),
  })
  .strict();
