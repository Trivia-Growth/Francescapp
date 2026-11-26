import { z } from 'zod';
import { sucessoRespostaSchema, uuidSchema } from './comum.ts';
import { atestadoOperacaoSchema, resultadoAtestacaoSchema } from './rpc.ts';
import {
  estadoEncerramentoCadastroSchema,
  estadoReconhecimentoCadastroSchema,
  estadoReservaCadastroSchema,
} from './barreira-cadastro.ts';
import {
  consultaBarreiraEquipeSchema,
  encerrarEquipeSchema,
  reconhecerEquipeSchema,
  reservarEquipeSchema,
} from './barreira-equipe.ts';

const vazio = z.object({}).strict();
const sessao = z.object({ 'x-sessao': uuidSchema }).strict();
const mutacao = sessao.extend({ origin: z.string().url().max(2048) }).strict();
const contexto = { request_id: uuidSchema, atestado: atestadoOperacaoSchema };
export const entradaBarreiraEquipeSchema = z.discriminatedUnion('operacao', [
  reservarEquipeSchema.extend({
    ...contexto,
    operacao: z.literal('api.reservar_concessao_equipe'),
  }),
  encerrarEquipeSchema.extend({
    ...contexto,
    operacao: z.literal('api.encerrar_concessao_equipe'),
  }),
  z
    .object({ ...contexto, operacao: z.literal('api.consultar_barreira_concessao_equipe') })
    .strict(),
  reconhecerEquipeSchema.extend({
    ...contexto,
    operacao: z.literal('api.reconhecer_barreira_concessao_equipe'),
  }),
]);
export const transporteBarreiraEquipeSchema = z
  .object({
    p_transporte: z
      .object({
        entrada: entradaBarreiraEquipeSchema,
        entrada_canonica: resultadoAtestacaoSchema.shape.entradaCanonica,
        dados_canonicos: resultadoAtestacaoSchema.shape.dadosCanonicos,
      })
      .strict(),
  })
  .strict();
export const contratosBarreiraEquipeHttp = {
  consultar: {
    metodo: 'GET',
    caminho: '/api/equipe/barreira',
    entrada: vazio,
    cabecalhos: sessao,
    saida: sucessoRespostaSchema(consultaBarreiraEquipeSchema),
  },
  reservar: {
    metodo: 'POST',
    caminho: '/api/equipe/barreira/reservar',
    entrada: reservarEquipeSchema,
    cabecalhos: mutacao,
    saida: sucessoRespostaSchema(z.object({ estado: estadoReservaCadastroSchema }).strict()),
  },
  encerrar: {
    metodo: 'POST',
    caminho: '/api/equipe/barreira/encerrar',
    entrada: encerrarEquipeSchema,
    cabecalhos: mutacao,
    saida: sucessoRespostaSchema(z.object({ estado: estadoEncerramentoCadastroSchema }).strict()),
  },
  reconhecer: {
    metodo: 'POST',
    caminho: '/api/equipe/barreira/reconhecer',
    entrada: reconhecerEquipeSchema,
    cabecalhos: mutacao,
    saida: sucessoRespostaSchema(z.object({ estado: estadoReconhecimentoCadastroSchema }).strict()),
  },
} as const;
export const respostaBarreiraEquipeSchema = z.discriminatedUnion('ok', [
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
        consultaBarreiraEquipeSchema,
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
