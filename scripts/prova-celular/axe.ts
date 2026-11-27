/**
 * Verificação de acessibilidade automatizada (axe-core) dos roteiros Playwright.
 *
 * Cada chamada varre a página no estado em que o roteiro a deixou, aplica a lista de exceções
 * conhecidas (`axe-excecoes.json`) e falha se sobrar violação. Cada exceção exige regra, alvo
 * e motivo. O resultado (inclusive o que foi tolerado) segue como anexo para o
 * repórter `axe-relatorio.ts` gravar `relatorio-axe.json`.
 *
 * Axe só automatiza uma parte das regras WCAG: passar aqui não certifica acessibilidade.
 */
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import excecoesBrutas from './axe-excecoes.json' with { type: 'json' };

export type Excecao = { regra: string; alvo: string; motivo: string };
export type Achado = { regra: string; impacto: string | null; alvo: string; ajuda: string };
export type ResultadoAxe = {
  rotulo: string;
  violacoes: Achado[];
  toleradas: (Achado & { motivo: string })[];
};

export const ANEXO_AXE = 'axe-resultado';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const excecoes: Excecao[] = excecoesBrutas.excecoes;

for (const excecao of excecoes) {
  if (!excecao.regra || !excecao.alvo || excecao.motivo.trim().length < 20)
    throw new Error(`Exceção axe sem regra, alvo ou motivo explícito: ${JSON.stringify(excecao)}`);
}

/** Exceções que bateram em alguma violação nesta execução do processo de teste. */
const usadas = new Set<Excecao>();

export async function conferirAxe(page: Page, rotulo: string): Promise<ResultadoAxe> {
  const analise = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const resultado: ResultadoAxe = { rotulo, violacoes: [], toleradas: [] };
  for (const violacao of analise.violations) {
    for (const no of violacao.nodes) {
      const achado: Achado = {
        regra: violacao.id,
        impacto: violacao.impact ?? null,
        alvo: no.target.join(' >> '),
        ajuda: violacao.help,
      };
      const excecao = excecoes.find((e) => e.regra === achado.regra && e.alvo === achado.alvo);
      if (excecao) {
        usadas.add(excecao);
        resultado.toleradas.push({ ...achado, motivo: excecao.motivo });
      } else resultado.violacoes.push(achado);
    }
  }
  const ordem = (a: Achado, b: Achado) =>
    `${a.regra}${a.alvo}`.localeCompare(`${b.regra}${b.alvo}`);
  resultado.violacoes.sort(ordem);
  resultado.toleradas.sort(ordem);
  await test.info().attach(ANEXO_AXE, {
    body: JSON.stringify(resultado),
    contentType: 'application/json',
  });
  expect(
    resultado.violacoes,
    `violações axe em «${rotulo}» (corrija ou registre em axe-excecoes.json com motivo)`,
  ).toEqual([]);
  return resultado;
}
