/**
 * Repórter Playwright: junta os anexos `axe-resultado` e grava `relatorio-axe.json`, versionado.
 * Sem datas nem durações, para o diff só mudar quando as violações mudarem. Rodar um subconjunto
 * (`--grep`) substitui só as entradas dos rótulos que rodaram; as demais permanecem.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import type { ResultadoAxe } from './axe.ts';

const ARQUIVO = resolve(import.meta.dirname, 'relatorio-axe.json');

export default class RelatorioAxe implements Reporter {
  private readonly novos = new Map<string, ResultadoAxe>();

  onTestEnd(_teste: TestCase, resultado: TestResult): void {
    for (const anexo of resultado.attachments) {
      if (anexo.name !== 'axe-resultado' || !anexo.body) continue;
      const dado = JSON.parse(anexo.body.toString()) as ResultadoAxe;
      this.novos.set(dado.rotulo, dado);
    }
  }

  onEnd(): void {
    if (this.novos.size === 0) return;
    const atual: Record<string, ResultadoAxe> = existsSync(ARQUIVO)
      ? Object.fromEntries(
          (JSON.parse(readFileSync(ARQUIVO, 'utf8')).paginas as ResultadoAxe[]).map((p) => [
            p.rotulo,
            p,
          ]),
        )
      : {};
    for (const [rotulo, dado] of this.novos) atual[rotulo] = dado;
    const paginas = Object.values(atual).sort((a, b) => a.rotulo.localeCompare(b.rotulo));
    const total = (campo: 'violacoes' | 'toleradas') =>
      paginas.reduce((soma, p) => soma + p[campo].length, 0);
    writeFileSync(
      ARQUIVO,
      `${JSON.stringify({ resumo: { paginas: paginas.length, violacoes: total('violacoes'), toleradas: total('toleradas') }, paginas }, null, 2)}\n`,
    );
  }
}
