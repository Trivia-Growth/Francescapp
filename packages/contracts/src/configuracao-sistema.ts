import { z } from 'zod';
import { uuidSchema } from './comum.ts';

/** Tipos possíveis de uma chave do catálogo. O tipo vem do banco (definido por migration),
 * nunca da tela: a tela edita valor. Ver
 * `supabase/migrations/20261117400000_configuracao_sistema.sql`. */
export const tipoConfiguracaoSchema = z.enum(['booleano', 'texto', 'numero', 'lista']);
export type TipoConfiguracao = z.output<typeof tipoConfiguracaoSchema>;

/** Valor de uma chave. A forma depende do `tipo` da linha; a checagem cruzada acontece no
 * banco (`configuracao_sistema_valor_tipo_chk` e a operação privada), porque só lá o tipo é
 * confiável. Aqui o schema aceita as quatro formas e `valorCompativel` cruza as duas. */
export const valorConfiguracaoSchema = z.union([
  z.boolean(),
  z.string().min(1).max(600),
  z.number().finite(),
  z.array(z.string().trim().min(1).max(200)).min(1).max(50),
]);
export type ValorConfiguracao = z.output<typeof valorConfiguracaoSchema>;

export function valorCompativel(tipo: TipoConfiguracao, valor: ValorConfiguracao): boolean {
  if (tipo === 'booleano') return typeof valor === 'boolean';
  if (tipo === 'numero') return typeof valor === 'number';
  if (tipo === 'texto') return typeof valor === 'string';
  return Array.isArray(valor);
}

/** Espelha a saída de `api.configuracao_sistema_privado`, migration `20261117410000`. */
export const configuracaoSistemaSchema = z
  .object({
    chave: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,99}$/, 'chave fora do formato do catálogo.'),
    valor: valorConfiguracaoSchema,
    tipo: tipoConfiguracaoSchema,
    rotulo: z.string().trim().min(1).max(160),
    descricao: z.string().trim().min(1).max(600).nullable(),
    exposicao: z.enum(['administracao', 'servidor']),
    versao: z.number().int().min(1).max(2147483647),
    atualizado_por_usuario_id: uuidSchema.nullable(),
    atualizado_em: z.iso.datetime({ offset: true }),
  })
  .strict();
export type ConfiguracaoSistema = z.output<typeof configuracaoSistemaSchema>;

/** Entrada da gravação. Não existe criação: `versao_esperada` começa em 1 porque a linha já
 * foi semeada por migration. A tela não manda `tipo` — ele é lido do catálogo no banco. */
export const gravarConfiguracaoSistemaSchema = z
  .object({
    configuracao_chave: z
      .string()
      .regex(/^[a-z0-9][a-z0-9._-]{0,99}$/, 'chave fora do formato do catálogo.'),
    valor: valorConfiguracaoSchema,
    versao_esperada: z.number().int().min(1).max(2147483646),
  })
  .strict();
export type GravarConfiguracaoSistema = z.output<typeof gravarConfiguracaoSistemaSchema>;

export const respostaConfiguracaoSistemaPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      dados: z.union([configuracaoSistemaSchema, z.array(configuracaoSistemaSchema)]),
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
