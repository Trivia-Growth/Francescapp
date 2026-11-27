import { expect, test } from '@playwright/test';
import { envelope } from '../../web/fixtures/comum.js';
import { responder } from '../../web/fixtures/despachante.js';
import { sessaoAdministrador } from '../../web/fixtures/sessao.js';

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript((id) => {
    sessionStorage.setItem('modo-acesso', 'tecnica');
    sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
    sessionStorage.setItem('sessao-tecnica', id);
  }, sessaoAdministrador.session_id);
});

test('descarta o painel anterior quando o módulo resolve depois da navegação', async ({ page }) => {
  let liberarModulo = () => {};
  const espera = new Promise<void>((resolver) => {
    liberarModulo = resolver;
  });
  await page.route('**/web/configuracao-sistema.tsx', async (rota) => {
    await espera;
    await rota.continue();
  });
  let consultasConfiguracao = 0;
  await page.route('**/api/**', (rota) => {
    const url = new URL(rota.request().url());
    if (url.pathname === '/api/admin/configuracao-sistema') consultasConfiguracao += 1;
    const fixture = responder(url.href);
    return fixture
      ? rota.fulfill({ json: fixture })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  const modulo = page.waitForRequest('**/web/configuracao-sistema.tsx');
  await page.goto('/web/index.html#administracao/configuracao');
  try {
    await modulo;
    await page.getByRole('link', { name: 'Equipe', exact: true }).click();
    await expect(
      page.getByRole('link', { name: 'Convidar alguém', exact: true }).last(),
    ).toBeVisible();
  } finally {
    liberarModulo();
  }
  await page.evaluate(async (caminho) => {
    await import(caminho);
    await new Promise(requestAnimationFrame);
  }, '/web/configuracao-sistema.tsx');
  await expect(page.locator('#administracao-conteudo')).toContainText('Convidar alguém');
  await expect(page.locator('#administracao-conteudo')).not.toContainText(
    'Configuração do sistema',
  );
  expect(consultasConfiguracao).toBe(0);
});

test('revalidação descarta Equipe sem esconder os demais destinos do administrador', async ({
  page,
}) => {
  let revogouConcessoes = false;
  await page.route('**/api/**', (rota) => {
    const { pathname } = new URL(rota.request().url());
    if (pathname === '/api/sessao' && revogouConcessoes)
      return rota.fulfill({
        json: envelope({
          ...sessaoAdministrador,
          capacidades: sessaoAdministrador.capacidades.filter(
            (cap) => cap !== 'administrar_concessoes',
          ),
        }),
      });
    const fixture = responder(rota.request().url());
    return fixture
      ? rota.fulfill({ json: fixture })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  await page.goto('/web/index.html#administracao/equipe');
  await expect(page.locator('#administracao-conteudo')).toContainText('Convidar alguém');
  revogouConcessoes = true;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page).toHaveURL(/#carteira$/);
  await expect(page.locator('#administracao-conteudo')).toBeEmpty();
  await expect(page.getByRole('link', { name: 'Administração' })).toBeVisible();
});
