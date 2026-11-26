import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import { campoCifradoSchema } from './rpc.ts';

/** Vínculos de FR-002, preservados exatamente como o requisito os enumera.
 * Uma pessoa pode acumular vínculos; nenhum deles concede acesso. A autorização
 * continua vindo de `cadastro.acesso_paciente` e da concessão de equipe, nunca
 * deste mapa — por isso não existe campo de permissão nesta estrutura. */
export const VINCULOS_REDE = [
  'paciente',
  'familiar',
  'cuidador',
  'responsavel_legal',
  'contato_emergencia',
  'profissional',
  'responsavel_financeiro',
] as const;

export type VinculoRede = (typeof VINCULOS_REDE)[number];

export type PessoaRede = {
  id: string;
  nome: string;
  vinculos: readonly VinculoRede[];
  contato: string | null;
  observacao: string | null;
};

/** Valida dados externos antes de persistir; não infere nem soma permissão. */
export function validarRedeCuidado(entrada: unknown): PessoaRede[] {
  const invalido = (): never => {
    throw new Error('Rede de cuidado inválida.');
  };
  const objeto = (valor: unknown): Record<string, unknown> => {
    if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return invalido();
    return valor as Record<string, unknown>;
  };
  const texto = (valor: unknown, limite: number): string => {
    if (typeof valor !== 'string') return invalido();
    const limpo = valor.trim();
    if (limpo.length === 0 || limpo.length > limite) return invalido();
    return limpo;
  };
  const opcional = (valor: unknown, limite: number): string | null => {
    if (valor === undefined || valor === null) return null;
    if (typeof valor !== 'string') return invalido();
    const limpo = valor.trim();
    if (limpo.length === 0) return null;
    if (limpo.length > limite) return invalido();
    return limpo;
  };
  if (!Array.isArray(entrada)) return invalido();
  if (entrada.length > 100) return invalido();
  const ids = new Set<string>();
  return entrada.map((item): PessoaRede => {
    const pessoa = objeto(item);
    if (
      Object.keys(pessoa).some(
        (chave) => !['id', 'nome', 'vinculos', 'contato', 'observacao'].includes(chave),
      )
    )
      return invalido();
    const id = texto(pessoa.id, 64);
    if (ids.has(id)) return invalido();
    ids.add(id);
    const nome = texto(pessoa.nome, 200);
    const vinculos = pessoa.vinculos;
    if (!Array.isArray(vinculos) || vinculos.length === 0 || vinculos.length > VINCULOS_REDE.length)
      return invalido();
    const tipos = vinculos.map((vinculo) => {
      if (typeof vinculo !== 'string' || !(VINCULOS_REDE as readonly string[]).includes(vinculo))
        return invalido();
      return vinculo as VinculoRede;
    });
    if (new Set(tipos).size !== tipos.length) return invalido();
    return {
      id,
      nome,
      vinculos: tipos,
      contato: opcional(pessoa.contato, 200),
      observacao: opcional(pessoa.observacao, 1000),
    };
  });
}

/** Aplica a mesma validação do domínio na fronteira HTTP. */
export const redeCuidadoSchema = z.unknown().transform((entrada, ctx) => {
  try {
    return validarRedeCuidado(entrada);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Rede de cuidado inválida.' });
    return z.NEVER;
  }
});

const versaoRedeSchema = z.number().int().min(0).max(2_147_483_647);

export const salvarRedeCuidadoSchema = z
  .object({
    versao_esperada: versaoRedeSchema.max(2_147_483_646),
    pessoas: redeCuidadoSchema,
  })
  .strict();

export type SalvarRedeCuidado = z.output<typeof salvarRedeCuidadoSchema>;

/** Saída da rota: mapa corrente do paciente, ou nulo quando nada foi registrado. */
export const documentoRedeCuidadoSchema = z
  .object({ versao: versaoRedeSchema.min(1), conteudo: redeCuidadoSchema })
  .strict()
  .nullable();

export type DocumentoRedeCuidado = z.output<typeof documentoRedeCuidadoSchema>;
