import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  configuracaoSistemaSchema,
  valorCompativel,
  valorConfiguracaoSchema,
} from '../src/configuracao-sistema.ts';

/** O catálogo de configuração é semeado por migration e lido inteiro pela tela de
 * administração: `api.configuracao_sistema_privado` devolve TODAS as linhas e a entrada faz
 * `z.array(configuracaoSistemaSchema).parse(...)` de uma vez.
 *
 * Consequência que custou caro em 13/11/2026: UMA linha fora do contrato derruba a listagem
 * inteira. `ffcm.documentos.drive_pasta_raiz` nasce em branco, `valorConfiguracaoSchema`
 * exigia `min(1)` em texto, o `parse` lançava, e o `catch` da entrada devolvia
 * `servico_indisponivel` sem rastro. A tela de configuração ficou inutilizável e o 503 não
 * dizia por quê.
 *
 * Este teste lê as seeds reais das migrations em vez de repetir uma amostra à mão: amostra
 * copiada envelhece junto com o engano. Qualquer seed futura que o contrato recuse falha aqui,
 * antes de chegar em produção. */

const MIGRACOES = join(import.meta.dirname, '..', '..', '..', 'supabase', 'migrations');

/** Extrai `('ffcm.x', '<json>'::jsonb, '<tipo>'` das migrations, que é a forma usada em todas
 * as seeds do catálogo. Não tenta ser um parser de SQL: se a forma mudar, o teste passa a não
 * achar nada e a asserção de quantidade mínima falha, em vez de passar vazio em silêncio. */
function seedsDoCatalogo(): { chave: string; valor: unknown; tipo: string; arquivo: string }[] {
  const achados: { chave: string; valor: unknown; tipo: string; arquivo: string }[] = [];
  const padrao = /'(ffcm\.[a-z0-9._]+)',\s*\n\s*'((?:[^']|'')*)'::jsonb,\s*\n\s*'(\w+)'/g;
  for (const arquivo of readdirSync(MIGRACOES)
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    const conteudo = readFileSync(join(MIGRACOES, arquivo), 'utf8');
    for (const achado of conteudo.matchAll(padrao)) {
      const bruto = achado[2]?.replaceAll("''", "'") ?? '';
      let valor: unknown;
      try {
        valor = JSON.parse(bruto);
      } catch {
        continue; // `jsonb` que não é literal JSON simples não é seed de valor do catálogo.
      }
      achados.push({ chave: achado[1] ?? '', valor, tipo: achado[3] ?? '', arquivo });
    }
  }
  return achados;
}

describe('catálogo de configuração semeado por migration', () => {
  const seeds = seedsDoCatalogo();

  it('encontra as seeds reais, em vez de passar vazio', () => {
    // Guarda contra o teste virar decorativo se a forma das migrations mudar.
    expect(seeds.length).toBeGreaterThan(20);
    expect(seeds.map((s) => s.chave)).toContain('ffcm.documentos.drive_pasta_raiz');
  });

  it('todo valor semeado é aceito pelo contrato que a tela usa para ler', () => {
    const recusados = seeds
      .filter((s) => !valorConfiguracaoSchema.safeParse(s.valor).success)
      .map((s) => `${s.chave} (${s.arquivo}): ${JSON.stringify(s.valor)}`);
    // Uma linha recusada derruba a listagem inteira, não só a própria linha.
    expect(recusados).toEqual([]);
  });

  it('todo valor semeado corresponde ao tipo declarado na mesma linha', () => {
    const divergentes = seeds
      .filter((s) => {
        const valor = valorConfiguracaoSchema.safeParse(s.valor);
        if (!valor.success) return false; // já coberto pelo caso acima.
        return !valorCompativel(s.tipo as Parameters<typeof valorCompativel>[0], valor.data);
      })
      .map((s) => `${s.chave}: tipo ${s.tipo} com ${JSON.stringify(s.valor)}`);
    expect(divergentes).toEqual([]);
  });

  it('aceita texto em branco, porque em branco é estado do catálogo e não ausência', () => {
    // Regressão direta do defeito: `drive_pasta_raiz` em branco significa "Drive ainda não
    // configurado", e o envio de anexos fica indisponível — falha fechada, por desenho.
    const linha = {
      chave: 'ffcm.documentos.drive_pasta_raiz',
      valor: '',
      tipo: 'texto' as const,
      rotulo: 'Pasta raiz no Google Drive',
      descricao: 'Enquanto estiver em branco, o envio de anexos fica indisponível.',
      exposicao: 'servidor' as const,
      versao: 1,
      opcoes: null,
      atualizado_por_usuario_id: null,
      atualizado_em: '2026-11-13T12:00:00.000Z',
    };
    expect(configuracaoSistemaSchema.safeParse(linha).success).toBe(true);
    expect(valorCompativel('texto', '')).toBe(true);
  });

  it('continua recusando texto acima do teto e lista vazia', () => {
    // O conserto afrouxou só o piso de comprimento do texto; os demais limites ficam de pé.
    expect(valorConfiguracaoSchema.safeParse('x'.repeat(601)).success).toBe(false);
    expect(valorConfiguracaoSchema.safeParse([]).success).toBe(false);
    expect(valorConfiguracaoSchema.safeParse(['']).success).toBe(false);
  });
});
