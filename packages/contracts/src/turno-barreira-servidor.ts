import { z } from 'zod';
import { sucessoRespostaSchema, uuidSchema } from './comum.ts';
import { atestadoOperacaoSchema, resultadoAtestacaoSchema } from './rpc.ts';
import {
  estadoEncerramentoCadastroSchema,
  estadoReconhecimentoCadastroSchema,
  estadoReservaCadastroSchema,
} from './barreira-cadastro.ts';
import {
  consultaBarreiraTurnoSchema,
  encerrarTurnoSchema,
  reconhecerTurnoSchema,
  reservarTurnoSchema,
} from './turno-barreira.ts';

const vazio = z.object({}).strict();
const sessao = z.object({ 'x-sessao': uuidSchema }).strict();
const mutacao = sessao.extend({ origin: z.string().url().max(2048) }).strict();
const contexto = { request_id: uuidSchema, atestado: atestadoOperacaoSchema };
export const entradaBarreiraTurnoSchema = z.discriminatedUnion('operacao', [
  reservarTurnoSchema.extend({ ...contexto, operacao: z.literal('api.reservar_turno') }),
  encerrarTurnoSchema.extend({ ...contexto, operacao: z.literal('api.encerrar_barreira_turno') }),
  z.object({ ...contexto, operacao: z.literal('api.consultar_barreira_turno') }).strict(),
  reconhecerTurnoSchema.extend({
    ...contexto,
    operacao: z.literal('api.reconhecer_barreira_turno'),
  }),
]);
export const transporteBarreiraTurnoSchema = z
  .object({
    p_transporte: z
      .object({
        entrada: entradaBarreiraTurnoSchema,
        entrada_canonica: resultadoAtestacaoSchema.shape.entradaCanonica,
        dados_canonicos: resultadoAtestacaoSchema.shape.dadosCanonicos,
      })
      .strict(),
  })
  .strict();
export const contratosBarreiraTurnoHttp = {
  consultar: {
    metodo: 'GET',
    caminho: '/api/turnos/barreira',
    entrada: vazio,
    cabecalhos: sessao,
    saida: sucessoRespostaSchema(consultaBarreiraTurnoSchema),
  },
  reservar: {
    metodo: 'POST',
    caminho: '/api/turnos/barreira/reservar',
    entrada: reservarTurnoSchema,
    cabecalhos: mutacao,
    saida: sucessoRespostaSchema(z.object({ estado: estadoReservaCadastroSchema }).strict()),
  },
  encerrar: {
    metodo: 'POST',
    caminho: '/api/turnos/barreira/encerrar',
    entrada: encerrarTurnoSchema,
    cabecalhos: mutacao,
    saida: sucessoRespostaSchema(z.object({ estado: estadoEncerramentoCadastroSchema }).strict()),
  },
  reconhecer: {
    metodo: 'POST',
    caminho: '/api/turnos/barreira/reconhecer',
    entrada: reconhecerTurnoSchema,
    cabecalhos: mutacao,
    saida: sucessoRespostaSchema(z.object({ estado: estadoReconhecimentoCadastroSchema }).strict()),
  },
} as const;
export const respostaBarreiraTurnoSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(false),
      erro: z.object({ codigo: z.literal('sem_permissao') }).strict(),
      request_id: uuidSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(true),
      dados: z.union([
        consultaBarreiraTurnoSchema,
        z
          .object({
            estado: z.union([
              estadoReservaCadastroSchema,
              estadoEncerramentoCadastroSchema,
              estadoReconhecimentoCadastroSchema,
            ]),
          })
          .strict(),
      ]),
      request_id: uuidSchema,
    })
    .strict(),
]);
