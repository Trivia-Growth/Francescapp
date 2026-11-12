import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import { campoCifradoSchema } from './rpc.ts';

/** FR-020: “profissional habilitado” é uma marca guardada na concessão de equipe,
 * preenchida pela administração na tela e nunca por constante no código
 * (decisão do solicitante de 11/11/2026: o que é variável se preenche no front e fica no banco).
 *
 * A marca só faz sentido para concessão de perfil `profissional` e estado `vinculada`:
 * a coordenação (administrador) organiza o cuidado, mas FR-020 diz que a case manager não
 * emite conduta clínica por assumir a coordenação. O banco recusa a marca nos demais casos;
 * este contrato só descreve o transporte. */
const versaoHabilitacaoSchema = z.number().int().min(0).max(2_147_483_647);

export const itemHabilitacaoSchema = z
  .object({
    concessao_id: uuidSchema,
    usuario_id: uuidSchema.nullable(),
    email: z.string().min(1).max(254),
    perfil: z.enum(['profissional', 'administrador']),
    estado: z.enum(['pendente', 'vinculada', 'revogada']),
    habilitado: z.boolean(),
    versao: versaoHabilitacaoSchema,
  })
  .strict();

export const listaHabilitacaoSchema = z.array(itemHabilitacaoSchema).max(500);

export const gravarHabilitacaoSchema = z
  .object({
    concessao_id: uuidSchema,
    habilitado: z.boolean(),
    versao_esperada: versaoHabilitacaoSchema.max(2_147_483_646),
  })
  .strict();

export type ItemHabilitacao = z.output<typeof itemHabilitacaoSchema>;
export type GravarHabilitacao = z.output<typeof gravarHabilitacaoSchema>;

export const habilitacaoPlanoCriseHttp = {
  listar: {
    metodo: 'GET',
    caminho: '/api/admin/habilitacao-plano-crise',
    entrada: z.object({}).strict(),
    saida: listaHabilitacaoSchema,
  },
  gravar: {
    metodo: 'POST',
    caminho: '/api/admin/habilitacao-plano-crise',
    entrada: gravarHabilitacaoSchema,
    saida: itemHabilitacaoSchema,
  },
} as const;

/** Resposta privada do banco: o e-mail viaja cifrado, como em qualquer leitura de
 * concessão; a decifragem acontece no servidor, nunca no navegador. */
const itemPrivadoSchema = z
  .object({
    concessao_id: uuidSchema,
    usuario_id: uuidSchema.nullable(),
    email: campoCifradoSchema,
    perfil: z.enum(['profissional', 'administrador']),
    estado: z.enum(['pendente', 'vinculada', 'revogada']),
    habilitado: z.boolean(),
    versao: versaoHabilitacaoSchema,
  })
  .strict();

export const respostaHabilitacaoPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      dados: z.union([z.array(itemPrivadoSchema).max(500), itemPrivadoSchema]),
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
