import { z } from 'zod';

import {
  consultaBarreiraCadastroResultadoSchema,
  estadoEncerramentoCadastroSchema,
  estadoReconhecimentoCadastroSchema,
  estadoReservaCadastroSchema,
} from './barreira-cadastro.ts';
import { sucessoRespostaSchema, uuidSchema } from './comum.ts';

const vazio = z.object({}).strict();
const epoca = z.number().int().positive().safe();
const sessao = z.object({ 'x-sessao': uuidSchema }).strict();
const mutacao = sessao.extend({ origin: z.string().url().max(2048) }).strict();

/** HTTP 200 confirma que a operação da barreira retornou um estado, inclusive
 * conflito ou negativa; não confirma criação de paciente. O cliente deve
 * interpretar `dados.estado` conforme a operação e preservar a recuperação.
 * Falhas de autorização e transporte usam os erros HTTP públicos.
 * Contratos planejados, sem rotas ativas. A validação estrutural não comprova
 * origem, sessão, autorização, aleatoriedade ou opacidade dos identificadores.
 * O servidor deve verificar esses controles, aplicar no-store e falhar fechado;
 * identificadores vinculáveis a pessoas não devem ser registrados em logs. */
export const contratosBarreiraHttp = {
  consultar: {
    metodo: 'GET',
    caminho: '/api/cadastro/barreira',
    entrada: vazio,
    cabecalhos: sessao,
    parametros: vazio,
    saida: sucessoRespostaSchema(consultaBarreiraCadastroResultadoSchema),
  },
  reservar: {
    metodo: 'POST',
    caminho: '/api/cadastro/barreira/reservar',
    entrada: z.object({ epoca, reserva_id: uuidSchema }).strict(),
    cabecalhos: mutacao,
    parametros: vazio,
    saida: sucessoRespostaSchema(z.object({ estado: estadoReservaCadastroSchema }).strict()),
  },
  encerrar: {
    metodo: 'POST',
    caminho: '/api/cadastro/barreira/encerrar',
    entrada: z
      .object({ epoca, reserva_id: uuidSchema.nullable(), comando_id: uuidSchema })
      .strict(),
    cabecalhos: mutacao,
    parametros: vazio,
    saida: sucessoRespostaSchema(z.object({ estado: estadoEncerramentoCadastroSchema }).strict()),
  },
  reconhecer: {
    metodo: 'POST',
    caminho: '/api/cadastro/barreira/reconhecer',
    entrada: z.object({ comando_id: uuidSchema }).strict(),
    cabecalhos: mutacao,
    parametros: vazio,
    saida: sucessoRespostaSchema(z.object({ estado: estadoReconhecimentoCadastroSchema }).strict()),
  },
} as const;
