import { z } from 'zod';
import { uuidSchema } from './comum.ts';

/** FR-072: avisos no aplicativo.
 *
 * O aviso é **projeção** de quatro eventos que já existem no banco (design D6) — passagem
 * pendente de ciência (FR-057), pendência por atraso (FR-027), sinal operacional em atenção
 * (FR-028) e relato marcado como atenção (FR-014). Não há fila de mensagens própria e não
 * há texto gravado na criação: o contrato carrega **referência**, não conteúdo.
 *
 * Por isso `motivo` só vem preenchido na pendência de FR-027, onde o texto é gerado pelo
 * derivador do banco a partir de datas e já é exibido à mesma audiência na carteira. Os
 * demais tipos chegam sem texto algum — quem quer saber o teor abre a origem, onde a
 * autorização é verificada de novo. Um aviso que descrevesse o acontecimento vazaria
 * audiência, e a revisão deve tratar texto novo aqui como achado.
 *
 * `lido` é marca do destinatário (design D7): tira o aviso do indicador, não registra
 * ciência de FR-013/FR-057 e não encerra a pendência de origem. */
export const tipoAvisoSchema = z.enum([
  'passagem_sem_ciencia',
  'pendencia_operacional',
  'sinal_atencao_operacional',
  'relato_em_atencao',
]);

export const avisoSchema = z
  .object({
    tipo: tipoAvisoSchema,
    paciente_id: uuidSchema,
    /** Identifica a instância da origem. Quando a origem muda, a chave muda e o aviso
     * volta a contar como não lido — como já vale para a pendência de FR-027. */
    chave_origem: z.string().trim().min(1).max(200),
    instante: z.iso.datetime({ offset: true }).nullable(),
    /** Continua sendo quem é, mesmo quando apresentado a quem substitui (FR-037). */
    destinatario_usuario_id: uuidSchema,
    por_substituicao: z.boolean(),
    lido: z.boolean(),
    motivo: z.string().trim().min(1).max(500).nullable(),
  })
  .strict();

export const listaAvisosSchema = z
  .object({
    itens: z.array(avisoSchema).max(200),
    nao_lidos: z.number().int().min(0),
  })
  .strict();

export const marcarAvisoLidoSchema = z
  .object({
    paciente_id: uuidSchema,
    tipo: tipoAvisoSchema,
    chave_origem: z.string().trim().min(1).max(200),
  })
  .strict();

/** Resposta privada do banco; não constitui rota HTTP pública. */
export const respostaAvisosPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      repeticao: z.boolean(),
      dados: listaAvisosSchema,
      request_id: uuidSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      erro: z
        .object({ codigo: z.enum(['sem_permissao', 'conflito', 'conflito_idempotencia']) })
        .strict(),
      request_id: uuidSchema,
    })
    .strict(),
]);

export type TipoAviso = z.output<typeof tipoAvisoSchema>;
export type Aviso = z.output<typeof avisoSchema>;
export type ListaAvisos = z.output<typeof listaAvisosSchema>;
export type MarcarAvisoLido = z.output<typeof marcarAvisoLidoSchema>;

/** Rótulos do domínio em português. Ficam no contrato porque descrevem a ORIGEM do aviso,
 * e nunca o seu conteúdo: trocá-los por um resumo do acontecimento é vazamento, não estilo. */
export const rotulosTipoAviso: Readonly<Record<TipoAviso, string>> = Object.freeze({
  passagem_sem_ciencia: 'Passagem de turno aguardando sua ciência',
  pendencia_operacional: 'Pendência de acompanhamento em aberto',
  sinal_atencao_operacional: 'Caso em atenção operacional',
  relato_em_atencao: 'Registro marcado como necessitando atenção',
});
