import { criarAcessoPacienteSchema, revogarAcessoPacienteSchema } from './cadastro.ts';
import { z } from 'zod';
import {
  consultaBarreiraAcessoSchema,
  reservarAcessoSchema,
  reservaConcessaoAcessoSchema,
  reservaRevogacaoAcessoSchema,
  encerrarAcessoSchema,
  reconhecerAcessoSchema,
  estadoReservaCadastroSchema,
  estadoEncerramentoCadastroSchema,
  estadoReconhecimentoCadastroSchema,
} from './barreira-acesso.ts';
import { sucessoRespostaSchema, uuidSchema } from './comum.ts';
import { atestadoOperacaoSchema, resultadoAtestacaoSchema } from './rpc.ts';
const vazio = z.object({}).strict();
const sessao = z.object({ 'x-sessao': uuidSchema }).strict();
const mutacao = sessao.extend({ origin: z.string().url().max(2048) }).strict();
const contexto = { request_id: uuidSchema, atestado: atestadoOperacaoSchema };
export const entradaBarreiraAcessoSchema = z.union([
  reservaConcessaoAcessoSchema.extend({
    ...contexto,
    operacao: z.literal('api.reservar_concessao_acesso_profissional'),
  }),
  reservaRevogacaoAcessoSchema.extend({
    ...contexto,
    operacao: z.literal('api.reservar_concessao_acesso_profissional'),
  }),
  encerrarAcessoSchema.extend({
    ...contexto,
    operacao: z.literal('api.encerrar_concessao_acesso_profissional'),
  }),
  z
    .object({
      ...contexto,
      operacao: z.literal('api.consultar_barreira_concessao_acesso_profissional'),
    })
    .strict(),
  reconhecerAcessoSchema.extend({
    ...contexto,
    operacao: z.literal('api.reconhecer_barreira_concessao_acesso_profissional'),
  }),
]);
export const transporteBarreiraAcessoSchema = z
  .object({
    p_transporte: z
      .object({
        entrada: entradaBarreiraAcessoSchema,
        entrada_canonica: resultadoAtestacaoSchema.shape.entradaCanonica,
        dados_canonicos: resultadoAtestacaoSchema.shape.dadosCanonicos,
      })
      .strict(),
  })
  .strict();
export const contratosBarreiraAcessoHttp = {
  consultar: {
    metodo: 'GET',
    caminho: '/api/acessos/barreira',
    entrada: vazio,
    cabecalhos: sessao,
    saida: sucessoRespostaSchema(consultaBarreiraAcessoSchema),
  },
  reservar: {
    metodo: 'POST',
    caminho: '/api/acessos/barreira/reservar',
    entrada: reservarAcessoSchema,
    cabecalhos: mutacao,
    saida: sucessoRespostaSchema(z.object({ estado: estadoReservaCadastroSchema }).strict()),
  },
  encerrar: {
    metodo: 'POST',
    caminho: '/api/acessos/barreira/encerrar',
    entrada: encerrarAcessoSchema,
    cabecalhos: mutacao,
    saida: sucessoRespostaSchema(z.object({ estado: estadoEncerramentoCadastroSchema }).strict()),
  },
  reconhecer: {
    metodo: 'POST',
    caminho: '/api/acessos/barreira/reconhecer',
    entrada: reconhecerAcessoSchema,
    cabecalhos: mutacao,
    saida: sucessoRespostaSchema(z.object({ estado: estadoReconhecimentoCadastroSchema }).strict()),
  },
} as const;
export const respostaBarreiraAcessoSchema = z.discriminatedUnion('ok', [
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
        consultaBarreiraAcessoSchema,
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

export const criarAcessoReservadoHttpSchema = z
  .object({
    entrada: criarAcessoPacienteSchema.extend({ acesso_id: uuidSchema }),
    reserva_id: uuidSchema,
    geracao_reserva: z.number().int().positive().safe(),
  })
  .strict();

export const revogarAcessoReservadoHttpSchema = z
  .object({
    entrada: revogarAcessoPacienteSchema,
    reserva_id: uuidSchema,
    geracao_reserva: z.number().int().positive().safe(),
  })
  .strict();
