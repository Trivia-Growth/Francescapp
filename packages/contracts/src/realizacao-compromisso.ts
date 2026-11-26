import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import { campoCifradoSchema } from './rpc.ts';

/** FR-024: situação de realização do compromisso.
 *
 * O compromisso continua vivendo no Google Calendar; o produto guarda apenas o que a
 * equipe declara sobre ele, numa tabela local chaveada pelo identificador do evento.
 *
 * Só quatro situações são REGISTRÁVEIS. `realizacao_nao_confirmada` não está entre elas de
 * propósito: é o estado derivado de um compromisso já passado sem registro, e distinguir
 * isso de falta é exigência literal do requisito. Nenhum caminho grava "não confirmada", e
 * nenhum caminho transforma ausência de registro em falta. */
export const situacaoRegistravelSchema = z.enum(['realizado', 'faltou', 'cancelado', 'remarcado']);

/** O que a tela mostra: as situações registradas, mais os dois estados derivados. */
export const situacaoApresentadaSchema = z.enum([
  'realizado',
  'faltou',
  'cancelado',
  'remarcado',
  'realizacao_nao_confirmada',
  'agendado',
]);

/** Catálogo fechado de barreiras. São obstáculos logísticos; o requisito manda identificar
 * barreira SEM produzir diagnóstico de risco, então não há escore, classificação clínica
 * nem termo clínico aqui — e acrescentar um seria mudança de requisito, não de código. */
export const motivoBarreiraSchema = z.enum(['transporte', 'custo', 'disponibilidade', 'outras']);

export const eventoIdSchema = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^[A-Za-z0-9_-]+$/);

const versaoSchema = z.number().int().min(0).max(2_147_483_645);

export type SituacaoRegistravel = z.output<typeof situacaoRegistravelSchema>;
export type SituacaoApresentada = z.output<typeof situacaoApresentadaSchema>;
export type MotivoBarreira = z.output<typeof motivoBarreiraSchema>;

/** Pedido de registro (e de retificação: retificar é gravar a versão seguinte).
 *
 * As três regras de forma abaixo também valem no banco, por CHECK. Aqui elas existem para
 * recusar cedo e explicar o erro, não para substituir o banco. */
export const registrarRealizacaoSchema = z
  .object({
    agenda_usuario_id: uuidSchema.optional(),
    evento_id: eventoIdSchema,
    situacao: situacaoRegistravelSchema,
    motivo: motivoBarreiraSchema.nullable().optional(),
    observacao: z.string().trim().min(1).max(2000).nullable().optional(),
    evento_destino_id: eventoIdSchema.nullable().optional(),
    versao_esperada: versaoSchema,
  })
  .strict()
  .superRefine((valor, ctx) => {
    // Remarcar é relacionar o compromisso original à nova data: sem destino não é remarcação,
    // e destino fora de remarcação não quer dizer nada.
    const temDestino = valor.evento_destino_id !== null && valor.evento_destino_id !== undefined;
    if (temDestino !== (valor.situacao === 'remarcado'))
      ctx.addIssue({ code: 'custom', message: 'Remarcação exige evento de destino.' });
    if (temDestino && valor.evento_destino_id === valor.evento_id)
      ctx.addIssue({ code: 'custom', message: 'O destino não pode ser o próprio compromisso.' });
    // A falta identifica a barreira; é o que o requisito pede registrar.
    if (valor.situacao === 'faltou' && (valor.motivo === null || valor.motivo === undefined))
      ctx.addIssue({ code: 'custom', message: 'A falta exige motivo.' });
    // Registrar que algo foi realizado não é lugar para texto livre sobre a pessoa.
    if (
      valor.situacao === 'realizado' &&
      ((valor.motivo !== null && valor.motivo !== undefined) ||
        (valor.observacao !== null && valor.observacao !== undefined))
    )
      ctx.addIssue({ code: 'custom', message: 'Realizado não aceita motivo nem observação.' });
  });

export const consultarRealizacaoSchema = z
  .object({
    agenda_usuario_id: uuidSchema.optional(),
    eventos: z
      .array(
        z
          .object({
            evento_id: eventoIdSchema,
            // Instante de término vindo do Google. Serve só para derivar a apresentação;
            // não participa de nenhuma autorização.
            fim: z.iso.datetime({ offset: true }).nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(250),
  })
  .strict();

/** Saída pública. Não há `paciente_id`: a situação de realização não é canal do caso. */
export const realizacaoCompromissoSchema = z
  .object({
    evento_id: eventoIdSchema,
    situacao: situacaoApresentadaSchema,
    situacao_registrada: situacaoRegistravelSchema.nullable(),
    motivo: motivoBarreiraSchema.nullable(),
    observacao: z.string().nullable(),
    evento_destino_id: eventoIdSchema.nullable(),
    versao: versaoSchema,
    registrado_em: z.iso.datetime({ offset: true }).nullable(),
    autor_usuario_id: uuidSchema.nullable(),
    registro_id: uuidSchema.nullable(),
    // Direção inversa do vínculo entre datas: compromissos remarcados PARA este.
    remarcado_de: z.array(eventoIdSchema),
  })
  .strict();

export const realizacaoCompromissosSchema = z
  .object({
    agenda_usuario_id: uuidSchema,
    compromissos: z.array(realizacaoCompromissoSchema),
  })
  .strict();

export type RegistrarRealizacao = z.output<typeof registrarRealizacaoSchema>;
export type ConsultarRealizacao = z.output<typeof consultarRealizacaoSchema>;
export type RealizacaoCompromisso = z.output<typeof realizacaoCompromissoSchema>;
export type RealizacaoCompromissos = z.output<typeof realizacaoCompromissosSchema>;

/** Resposta privada do banco; não constitui rota HTTP pública. O texto livre volta
 * cifrado — a decifra acontece no servidor, para quem a operação já autorizou. */
export const respostaRealizacaoPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      repeticao: z.boolean(),
      dados: z
        .object({
          agenda_usuario_id: uuidSchema,
          compromissos: z.array(
            z
              .object({
                evento_id: eventoIdSchema,
                situacao: situacaoApresentadaSchema,
                situacao_registrada: situacaoRegistravelSchema.nullable(),
                motivo: motivoBarreiraSchema.nullable(),
                observacao: campoCifradoSchema.nullable(),
                evento_destino_id: eventoIdSchema.nullable(),
                versao: versaoSchema,
                registrado_em: z.iso.datetime({ offset: true }).nullable(),
                autor_usuario_id: uuidSchema.nullable(),
                registro_id: uuidSchema.nullable(),
                remarcado_de: z.array(eventoIdSchema),
              })
              .strict(),
          ),
        })
        .strict(),
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
