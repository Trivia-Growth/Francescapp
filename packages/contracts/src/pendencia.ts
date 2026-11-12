import { z } from 'zod';
import { uuidSchema } from './comum.ts';

/** FR-027/FR-028: pendências do caso e o sinal operacional que elas produzem.
 *
 * Duas regras do requisito estão no contrato, não na interface:
 *
 * - `estado` do sinal nunca é uma classificação clínica. 'em_dia' afirma que os
 *   compromissos operacionais acordados estão em dia e nada mais; quem interpreta risco
 *   clínico é profissional habilitado, olhando o caso. 'informacao_insuficiente' existe
 *   justamente para que a ausência de acordo não apareça como tranquilidade.
 * - `motivos` nunca é opcional. FR-026 exige motivo visível para todo sinal operacional,
 *   inclusive para o estado "sem pendência".
 *
 * `chave_origem` identifica a instância da origem (a data da revisão acordada, o instante
 * da última atualização, o encaminhamento, a tarefa). Resolver uma pendência grava um
 * evento contra essa chave e não toca a origem; quando a origem muda, a chave muda e a
 * pendência volta aberta. */
export const tipoPendenciaSchema = z.enum([
  'revisao_proxima',
  'atualizacao_ausente',
  'encaminhamento_sem_retorno',
  'tarefa_atrasada',
]);
export const estadoPendenciaSchema = z.enum(['aberta', 'reconhecida', 'atribuida', 'resolvida']);
export const acaoPendenciaSchema = z.enum(['reconhecida', 'atribuida', 'resolvida', 'reaberta']);
export const estadoSinalSchema = z.enum([
  'em_dia',
  'atencao_operacional',
  'informacao_insuficiente',
]);

const diasSchema = z.number().int().min(1).max(365);
const chaveOrigemSchema = z.string().trim().min(1).max(200);

export const acordoAcompanhamentoSchema = z
  .object({
    versao: z.number().int().min(1),
    dias_entre_atualizacoes: diasSchema.nullable(),
    dias_antecedencia_revisao: z.number().int().min(1).max(180),
    dias_retorno_encaminhamento: diasSchema,
    proxima_revisao_em: z.iso.date().nullable(),
  })
  .strict();

export const pendenciaSchema = z
  .object({
    tipo: tipoPendenciaSchema,
    chave_origem: chaveOrigemSchema,
    motivo: z.string().trim().min(1).max(500),
    desde: z.iso.date().nullable(),
    estado: estadoPendenciaSchema,
    atribuido_usuario_id: uuidSchema.nullable(),
    tratada_em: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

export const sinalOperacionalSchema = z
  .object({
    paciente_id: uuidSchema,
    estado: estadoSinalSchema,
    acordo: acordoAcompanhamentoSchema.nullable(),
    ultima_atualizacao_em: z.iso.datetime({ offset: true }).nullable(),
    pendencias: z.array(pendenciaSchema).max(200),
    /** Só o Administrador acorda a periodicidade do caso; a interface esconde o editor
     * para os demais, mas a recusa real continua no banco. */
    perfil_escrita_acordo: z.boolean(),
  })
  .strict();

/** Resumo que viaja na lista de pessoas. Nunca carrega a pendência inteira: quem precisa
 * do detalhe abre o caso, onde a autorização é verificada de novo. */
export const sinalCarteiraSchema = z
  .object({
    estado: estadoSinalSchema,
    motivos: z.array(z.string().trim().min(1).max(500)).min(1).max(3),
  })
  .strict();

export const salvarAcordoSchema = z
  .object({
    versao_esperada: z.number().int().min(0).max(2_147_483_646),
    dias_entre_atualizacoes: diasSchema.nullable(),
    dias_antecedencia_revisao: z.number().int().min(1).max(180),
    dias_retorno_encaminhamento: diasSchema,
    proxima_revisao_em: z.iso.date().nullable(),
  })
  .strict();

export const tratarPendenciaSchema = z
  .object({
    tipo: tipoPendenciaSchema,
    chave_origem: chaveOrigemSchema,
    acao: acaoPendenciaSchema,
    atribuido_usuario_id: uuidSchema.nullable(),
  })
  .strict()
  .refine(
    ({ acao, atribuido_usuario_id: atribuido }) => (acao === 'atribuida') === (atribuido !== null),
    'Atribuir exige destinatário; as demais ações não aceitam um.',
  );

/** Resposta privada do banco; não constitui rota HTTP pública. */
export const respostaPendenciaPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      repeticao: z.boolean(),
      dados: sinalOperacionalSchema,
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

export type TipoPendencia = z.output<typeof tipoPendenciaSchema>;
export type EstadoPendencia = z.output<typeof estadoPendenciaSchema>;
export type AcaoPendencia = z.output<typeof acaoPendenciaSchema>;
export type EstadoSinal = z.output<typeof estadoSinalSchema>;
export type Pendencia = z.output<typeof pendenciaSchema>;
export type AcordoAcompanhamento = z.output<typeof acordoAcompanhamentoSchema>;
export type SinalOperacional = z.output<typeof sinalOperacionalSchema>;
export type SinalCarteira = z.output<typeof sinalCarteiraSchema>;
export type SalvarAcordo = z.output<typeof salvarAcordoSchema>;
export type TratarPendencia = z.output<typeof tratarPendenciaSchema>;

/** Rótulos do domínio em português, usados pela interface e pelos testes. Ficam no
 * contrato porque a distinção operacional/clínica de FR-028 é regra, não estilo. */
export const rotulosEstadoSinal: Record<EstadoSinal, string> = {
  em_dia: 'Compromissos operacionais em dia',
  atencao_operacional: 'Atenção operacional',
  informacao_insuficiente: 'Informação insuficiente',
};
export const rotulosTipoPendencia: Record<TipoPendencia, string> = {
  revisao_proxima: 'Revisão do caso',
  atualizacao_ausente: 'Atualização do caso',
  encaminhamento_sem_retorno: 'Encaminhamento sem retorno',
  tarefa_atrasada: 'Tarefa atrasada',
};
export const rotulosEstadoPendencia: Record<EstadoPendencia, string> = {
  aberta: 'Aberta',
  reconhecida: 'Reconhecida',
  atribuida: 'Atribuída',
  resolvida: 'Resolvida',
};
/** Texto exigido por FR-028 em toda superfície que mostra o sinal. */
export const avisoSinalOperacional =
  'Sinal operacional: trata de compromissos combinados no acompanhamento. Não é avaliação clínica nem indica ausência de risco.';
