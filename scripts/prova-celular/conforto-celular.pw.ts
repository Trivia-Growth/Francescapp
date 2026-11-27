/**
 * Conforto no celular medido em navegador real — tarefa 4.3 de `financeiro-despesa-e-repasse`
 * e tarefa 4.3 de `pwa-e-avisos-no-app`.
 *
 * Por que existe: jsdom não calcula layout. Largura renderizada, rolagem horizontal e área de
 * toque só têm valor medidos por um motor de layout; afirmar isso a partir de jsdom seria
 * evidência falsa. O que é medido aqui soma aos testes de interface já existentes e não
 * substitui nenhum teste de autorização de servidor ou de banco.
 *
 * Nada de rede: toda requisição para fora de 127.0.0.1 é recusada, a API tem dublê e os dados
 * são fictícios.
 */
import { expect, test } from '@playwright/test';
import { conferirAxe } from './axe.ts';
import { type Alvo, medirAlvos, medirCampos, medirLargura, percorrerFoco } from './medidas.ts';

const VIEWPORTS = [
  { nome: '360x640', width: 360, height: 640 },
  { nome: '390x844', width: 390, height: 844 },
] as const;

/** Mínimo de área de toque adotado pelo projeto (`AGENTS.md — Qualidade e experiência`). */
const ALVO_MINIMO = 44;

function registrar(titulo: string, dados: unknown): void {
  console.log(`\n[medição] ${titulo}\n${JSON.stringify(dados, null, 2)}`);
}

function pequenos(alvos: Alvo[]): Alvo[] {
  return alvos.filter((alvo) => alvo.largura < ALVO_MINIMO || alvo.altura < ALVO_MINIMO);
}

test.beforeEach(async ({ context }) => {
  // Dublê de rede: só o servidor local responde. Qualquer outro destino é recusado.
  await context.route('**/*', (rota) => {
    const destino = new URL(rota.request().url());
    const local = destino.hostname === '127.0.0.1' || destino.hostname === 'localhost';
    return local ? rota.continue() : rota.abort('blockedbyclient');
  });
});

for (const viewport of VIEWPORTS) {
  test.describe(`financeiro no celular (${viewport.nome})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const tela of [
      { aba: 'Valor por turno', botao: 'Consultar valores', dinheiro: true },
      { aba: 'Despesas do caso', botao: 'Consultar despesas', dinheiro: true },
      { aba: 'Apuração', botao: 'Apurar período', dinheiro: false },
    ]) {
      test(`${tela.aba} — largura, alvos, foco e teclado`, async ({ page }) => {
        await page.goto('/scripts/prova-celular/financeiro.html');
        await page.getByRole('tab', { name: tela.aba }).click();
        await page.getByRole('button', { name: tela.botao }).click();
        await expect(page.locator('.financeiro__linha').first()).toBeVisible();

        await conferirAxe(page, `conforto-celular — financeiro ${viewport.nome} — ${tela.aba}`);
        const largura = await medirLargura(page);
        const alvos = await medirAlvos(page);
        const campos = await medirCampos(page);
        const foco = await percorrerFoco(page, 40);
        registrar(`financeiro ${viewport.nome} — ${tela.aba}`, {
          largura,
          alvos,
          campos,
          foco: foco.map((parada) => ({
            descricao: parada.descricao,
            contorno: `${parada.contorno} ${parada.espessura}px ${parada.cor}`,
            visivel: parada.visivel,
          })),
          alvosAbaixoDoMinimo: pequenos(alvos),
        });

        expect(largura.maisLargos, 'elementos passando da largura da janela').toEqual([]);
        expect(largura.documentoScrollWidth).toBeLessThanOrEqual(largura.janelaInnerWidth);
        expect(pequenos(alvos), `alvos de toque menores que ${ALVO_MINIMO}px`).toEqual([]);
        expect(
          campos.filter((campo) => !campo.temRotulo),
          'campos sem rótulo',
        ).toEqual([]);
        expect(foco.length).toBeGreaterThan(0);
        expect(
          foco.filter((parada) => !parada.visivel),
          'paradas sem foco visível',
        ).toEqual([]);
        if (tela.dinheiro)
          expect(
            campos.filter((campo) => campo.inputmode === 'decimal').length,
            'campo de valor com teclado decimal',
          ).toBeGreaterThan(0);
      });
    }
  });

  test.describe(`casca do aplicativo no celular (${viewport.nome})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('casca — largura, alvos, foco e rótulos', async ({ page }) => {
      await page.route('**/api/**', (rota) =>
        rota.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ codigo: 'nao_autenticado' }),
        }),
      );
      await page.goto('/web/index.html');
      await expect(page.locator('#login-view')).toBeVisible();

      await conferirAxe(page, `conforto-celular — casca ${viewport.nome}`);
      const largura = await medirLargura(page);
      const alvos = await medirAlvos(page);
      const campos = await medirCampos(page);
      const foco = await percorrerFoco(page, 40);
      registrar(`casca ${viewport.nome}`, {
        largura,
        alvos,
        campos,
        foco: foco.map((parada) => ({
          descricao: parada.descricao,
          contorno: `${parada.contorno} ${parada.espessura}px ${parada.cor}`,
          visivel: parada.visivel,
        })),
        alvosAbaixoDoMinimo: pequenos(alvos),
      });

      expect(largura.maisLargos, 'elementos passando da largura da janela').toEqual([]);
      expect(largura.documentoScrollWidth).toBeLessThanOrEqual(largura.janelaInnerWidth);
      expect(pequenos(alvos), `alvos de toque menores que ${ALVO_MINIMO}px`).toEqual([]);
      expect(
        campos.filter((campo) => !campo.temRotulo),
        'campos sem rótulo',
      ).toEqual([]);
      expect(
        foco.filter((parada) => !parada.visivel),
        'paradas sem foco visível',
      ).toEqual([]);
    });

    test('casca sem rede — aviso de indisponibilidade cabe na tela', async ({ page, context }) => {
      await page.route('**/api/**', (rota) =>
        rota.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ codigo: 'nao_autenticado' }),
        }),
      );
      await page.goto('/web/index.html');
      await expect(page.locator('#login-view')).toBeVisible();

      await context.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));
      const aviso = page.locator('#estado-rede');
      await expect(aviso).toBeVisible();

      await conferirAxe(page, `conforto-celular — casca sem rede ${viewport.nome}`);
      const caixa = await aviso.boundingBox();
      const largura = await medirLargura(page);
      const alvos = await medirAlvos(page);
      registrar(`casca sem rede ${viewport.nome}`, {
        aviso: { texto: (await aviso.textContent())?.slice(0, 80), caixa },
        largura,
        alvosAbaixoDoMinimo: pequenos(alvos),
      });

      expect(caixa).not.toBeNull();
      expect(caixa?.width ?? 0).toBeLessThanOrEqual(viewport.width);
      expect(largura.maisLargos, 'elementos passando da largura da janela').toEqual([]);
      expect(largura.documentoScrollWidth).toBeLessThanOrEqual(largura.janelaInnerWidth);
      expect(pequenos(alvos), `alvos de toque menores que ${ALVO_MINIMO}px`).toEqual([]);
      await context.setOffline(false);
    });
  });
}
