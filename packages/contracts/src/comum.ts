import { z } from 'zod';

import {
  codigosErro,
  criarErroPublicoSemCampos,
  mensagensErro,
  statusErroHttp,
  type CodigoErro,
} from './erros.ts';

export { mensagensErro, statusErroHttp, type CodigoErro } from './erros.ts';

export const uuidSchema = z.string().uuid();

export const perfilSchema = z.enum(['administrador', 'profissional', 'familia']);
export type Perfil = z.infer<typeof perfilSchema>;

export const versaoSchema = z.number().int().positive();

export const cursorSchema = z.string().min(1).max(512);
export const limitePaginaSchema = z.number().int().min(1).max(100).default(25);

export const chaveIdempotenciaSchema = z
  .string()
  .min(16)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/, 'A chave de idempotência é inválida.');

export const cabecalhosMutacaoSchema = z
  .object({
    'x-chave-idempotencia': chaveIdempotenciaSchema,
  })
  .strict();

export const codigoErroSchema = z.enum(codigosErro);

export const campoErroSchema = z
  .object({
    campo: z.enum([
      'nome',
      'nome_preferencia',
      'data_nascimento',
      'email',
      'senha',
      'credencial',
      'perfil',
      'ativo',
      'versao_esperada',
      'motivo',
      'cursor',
      'limite',
      'id',
      'usuario_id',
      'paciente_id',
      'concessao_id',
      'contato_id',
      'relacao_id',
      'acesso_id',
      'valor',
      'tipo',
      'pessoa',
      'contatos',
      'descricao_relacao',
      'responsabilidade',
      'desafio_id',
      'csrf',
      'cabecalhos',
      'parametros',
      'corpo',
    ]),
    codigo: z.enum(['obrigatorio', 'formato_invalido', 'fora_do_limite', 'campo_desconhecido']),
  })
  .strict();

export const erroRespostaSchema = z
  .object({
    erro: z
      .object({
        codigo: codigoErroSchema,
        mensagem: z.string().min(1).max(160),
        campos: z.array(campoErroSchema).max(20).optional(),
      })
      .strict(),
    request_id: uuidSchema,
  })
  .strict()
  .refine(({ erro }) => erro.mensagem === mensagensErro[erro.codigo], {
    message: 'Use somente a mensagem pública do catálogo de erros.',
  });

export function sucessoRespostaSchema<T extends z.ZodType>(dados: T) {
  return z
    .object({
      dados,
      request_id: uuidSchema,
    })
    .strict();
}

export type RespostaSucesso<T> = {
  dados: T;
  request_id: string;
};

export type RespostaErro = z.infer<typeof erroRespostaSchema>;
export type RespostaHttp<T> = RespostaSucesso<T> | RespostaErro;

// Erros externos e de validação não entram neste construtor: o chamador
// escolhe um código público e recebe somente texto do catálogo.
export function criarErroPublico(codigo: CodigoErro, requestId: string): RespostaErro {
  return erroRespostaSchema.parse(criarErroPublicoSemCampos(codigo, requestId));
}

export const paginaSchema = <T extends z.ZodType>(item: T) =>
  z
    .object({
      itens: z.array(item),
      proximo_cursor: cursorSchema.nullable(),
    })
    .strict();

// Envelope de cifra. Mora aqui, e não em `rpc.ts`, porque `identidade.ts` precisa dele e
// `rpc.ts` importa `identidade.ts`: deixá-lo lá fecha um ciclo de módulos que o typecheck não
// acusa e que, em tempo de execução, deixa um schema `undefined` conforme a ordem de avaliação.
export const formatoCifraSchema = z.literal(1);
export const base64UrlSchema = z
  .string()
  .min(1)
  .max(32_768)
  .regex(/^[A-Za-z0-9_-]+$/);
export const keyIdSchema = z.string().min(1).max(128);

/** Persistência e transporte interno; nunca enviado ao navegador. */
export const campoCifradoSchema = z
  .object({
    formato: formatoCifraSchema,
    key_id: keyIdSchema,
    nonce: base64UrlSchema,
    ciphertext: base64UrlSchema,
    tag: base64UrlSchema,
  })
  .strict();
