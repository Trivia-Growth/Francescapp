import { expect, test } from '@playwright/test';
import { responder } from '../../web/fixtures/despachante.js';
import { PACIENTE_IDS, sessaoAdministrador } from '../../web/fixtures/sessao.js';

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

for (const secao of ['anamnese', 'diario', 'documentos']) {
  test(`módulo antigo de ${secao} não substitui a seção que permaneceu aberta`, async ({
    page,
  }) => {
    await page.addInitScript((id) => {
      sessionStorage.setItem('modo-acesso', 'tecnica');
      sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
      sessionStorage.setItem('sessao-tecnica', id);
    }, sessaoAdministrador.session_id);
    let liberarModulo = () => {};
    const espera = new Promise<void>((resolver) => {
      liberarModulo = resolver;
    });
    const moduloDaSecao = secao === 'documentos' ? 'documentos-caso' : secao;
    await page.route(`**/web/${moduloDaSecao}.tsx`, async (rota) => {
      await espera;
      await rota.continue();
    });
    let leiturasDaSecao = 0;
    await page.route('**/api/**', (rota) => {
      if (new URL(rota.request().url()).pathname === `/api/pacientes/${PACIENTE_IDS[0]}/${secao}`)
        leiturasDaSecao += 1;
      const fixture = responder(rota.request().url());
      return fixture
        ? rota.fulfill({ json: fixture })
        : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
    });
    const modulo = page.waitForRequest(`**/web/${moduloDaSecao}.tsx`);
    await page.goto(`/web/index.html#paciente/${PACIENTE_IDS[0]}/${secao}`);
    const painel = page.locator('#ficha-painel');
    try {
      await modulo;
      await expect(painel.locator(`[data-secao="${secao}"]`)).toHaveAttribute('aria-busy', 'true');
      await page.locator('#ficha-aba-plano').click();
      await expect(painel.locator('.ficha-secao')).toHaveAttribute('data-secao', 'plano');
    } finally {
      liberarModulo();
    }
    await page.evaluate(async (caminho) => {
      await import(caminho);
      await new Promise(requestAnimationFrame);
    }, `/web/${moduloDaSecao}.tsx`);
    await expect(painel.locator('.ficha-secao')).toHaveCount(1);
    await expect(painel.locator('.ficha-secao')).toHaveAttribute('data-secao', 'plano');
    await expect(page.locator('#ficha-aba-plano')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeVisible();
    expect(leiturasDaSecao).toBe(0);
  });
}

test('primeira renderização da ficha pode ser recuperada pelo mesmo link', async ({ page }) => {
  await page.addInitScript((id) => {
    sessionStorage.setItem('modo-acesso', 'tecnica');
    sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
    sessionStorage.setItem('sessao-tecnica', id);
  }, sessaoAdministrador.session_id);
  await page.route('**/web/ficha.tsx', (rota) =>
    rota.fulfill({
      contentType: 'application/javascript',
      body: `export const secaoInicialDaFicha = () => undefined;
        export function TelaFicha() {
          if (!window.fichaRecuperada) throw new Error('Falha fictícia ao desenhar a ficha');
          return 'Ficha fictícia recuperada';
        }`,
    }),
  );
  await page.route('**/api/**', (rota) => {
    const fixture = responder(rota.request().url());
    return fixture
      ? rota.fulfill({ json: fixture })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  await page.goto(`/web/index.html#paciente/${PACIENTE_IDS[0]}/visao`);
  await expect(page.getByText('Tente abrir a área de novo.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeVisible();
  await page.evaluate(() => Reflect.set(window, 'fichaRecuperada', true));
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByText('Ficha fictícia recuperada')).toBeVisible();
});
