import { z } from 'zod';
import { sucessoRespostaSchema, uuidSchema } from './comum.ts';
import { atestadoOperacaoSchema, resultadoAtestacaoSchema } from './rpc.ts';
import {
  estadoEncerramentoCadastroSchema,
  estadoReconhecimentoCadastroSchema,
  estadoReservaCadastroSchema,
} from './barreira-cadastro.ts';
import {
  consultaBarreiraTarefaSchema,
  encerrarTarefaSchema,
  reconhecerTarefaSchema,
  reservarTarefaSchema,
} from './barreira-tarefa-cuidado.ts';

const vazio = z.object({}).strict();
const sessao = z.object({ 'x-sessao': uuidSchema }).strict();
const mutacao = sessao.extend({ origin: z.string().url().max(2048) }).strict();
const contexto = { request_id: uuidSchema, atestado: atestadoOperacaoSchema };
export const entradaBarreiraTarefaSchema = z.discriminatedUnion('operacao', [
  reservarTarefaSchema.extend({ ...contexto, operacao: z.literal('api.reservar_tarefa_cuidado') }),
  encerrarTarefaSchema.extend({ ...contexto, operacao: z.literal('api.encerrar_tarefa_cuidado') }),
  z.object({ ...contexto, operacao: z.literal('api.consultar_barreira_tarefa_cuidado') }).strict(),
  reconhecerTarefaSchema.extend({
    ...contexto,
    operacao: z.literal('api.reconhecer_barreira_tarefa_cuidado'),
  }),
]);
export const transporteBarreiraTarefaSchema = z
  .object({
    p_transporte: z
      .object({
        entrada: entradaBarreiraTarefaSchema,
        entrada_canonica: resultadoAtestacaoSchema.shape.entradaCanonica,
        dados_canonicos: resultadoAtestacaoSchema.shape.dadosCanonicos,
      })
      .strict(),
  })
  .strict();
export const contratosBarreiraTarefaHttp = {
  consultar: {
    metodo: 'GET',
    caminho: '/api/tarefas/barreira',
    entrada: vazio,
    cabecalhos: sessao,
    saida: sucessoRespostaSchema(consultaBarreiraTarefaSchema),
  },
  reservar: {
    metodo: 'POST',
    caminho: '/api/tarefas/barreira/reservar',
    entrada: reservarTarefaSchema,
    cabecalhos: mutacao,
    saida: sucessoRespostaSchema(z.object({ estado: estadoReservaCadastroSchema }).strict()),
  },
  encerrar: {
    metodo: 'POST',
    caminho: '/api/tarefas/barreira/encerrar',
    entrada: encerrarTarefaSchema,
    cabecalhos: mutacao,
    saida: sucessoRespostaSchema(z.object({ estado: estadoEncerramentoCadastroSchema }).strict()),
  },
  reconhecer: {
    metodo: 'POST',
    caminho: '/api/tarefas/barreira/reconhecer',
    entrada: reconhecerTarefaSchema,
    cabecalhos: mutacao,
    saida: sucessoRespostaSchema(z.object({ estado: estadoReconhecimentoCadastroSchema }).strict()),
  },
} as const;
export const respostaBarreiraTarefaSchema = z.discriminatedUnion('ok', [
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
        consultaBarreiraTarefaSchema,
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
