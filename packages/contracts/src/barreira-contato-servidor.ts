import { novoContatoSchema } from './cadastro.ts';
import { z } from 'zod';
import {
  consultaBarreiraContatoSchema,
  reservarContatoSchema,
  encerrarContatoSchema,
  reconhecerContatoSchema,
  estadoReservaCadastroSchema,
  estadoEncerramentoCadastroSchema,
  estadoReconhecimentoCadastroSchema,
} from './barreira-contato.ts';
import { sucessoRespostaSchema, uuidSchema } from './comum.ts';
import { atestadoOperacaoSchema, resultadoAtestacaoSchema } from './rpc.ts';
const vazio = z.object({}).strict();
const sessao = z.object({ 'x-sessao': uuidSchema }).strict();
const mutacao = sessao.extend({ origin: z.string().url().max(2048) }).strict();
const contexto = { request_id: uuidSchema, atestado: atestadoOperacaoSchema };
export const entradaBarreiraContatoSchema = z.discriminatedUnion('operacao', [
  reservarContatoSchema.extend({
    ...contexto,
    operacao: z.literal('api.reservar_criacao_contato'),
  }),
  encerrarContatoSchema.extend({
    ...contexto,
    operacao: z.literal('api.encerrar_criacao_contato'),
  }),
  z.object({ ...contexto, operacao: z.literal('api.consultar_barreira_criacao_contato') }).strict(),
  reconhecerContatoSchema.extend({
    ...contexto,
    operacao: z.literal('api.reconhecer_barreira_criacao_contato'),
  }),
]);
export const transporteBarreiraContatoSchema = z
  .object({
    p_transporte: z
      .object({
        entrada: entradaBarreiraContatoSchema,
        entrada_canonica: resultadoAtestacaoSchema.shape.entradaCanonica,
        dados_canonicos: resultadoAtestacaoSchema.shape.dadosCanonicos,
      })
      .strict(),
  })
  .strict();
export const contratosBarreiraContatoHttp = {
  consultar: {
    metodo: 'GET',
    caminho: '/api/contatos/barreira',
    entrada: vazio,
    cabecalhos: sessao,
    saida: sucessoRespostaSchema(consultaBarreiraContatoSchema),
  },
  reservar: {
    metodo: 'POST',
    caminho: '/api/contatos/barreira/reservar',
    entrada: reservarContatoSchema,
    cabecalhos: mutacao,
    saida: sucessoRespostaSchema(z.object({ estado: estadoReservaCadastroSchema }).strict()),
  },
  encerrar: {
    metodo: 'POST',
    caminho: '/api/contatos/barreira/encerrar',
    entrada: encerrarContatoSchema,
    cabecalhos: mutacao,
    saida: sucessoRespostaSchema(z.object({ estado: estadoEncerramentoCadastroSchema }).strict()),
  },
  reconhecer: {
    metodo: 'POST',
    caminho: '/api/contatos/barreira/reconhecer',
    entrada: reconhecerContatoSchema,
    cabecalhos: mutacao,
    saida: sucessoRespostaSchema(z.object({ estado: estadoReconhecimentoCadastroSchema }).strict()),
  },
} as const;
export const respostaBarreiraContatoSchema = z.discriminatedUnion('ok', [
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
        consultaBarreiraContatoSchema,
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

export const criarContatoReservadoHttpSchema = z
  .object({
    entrada: novoContatoSchema,
    reserva_id: uuidSchema,
    geracao_reserva: z.number().int().positive().safe(),
  })
  .strict();
