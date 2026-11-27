import { expect, test, type Page } from '@playwright/test';
import { responder } from '../../web/fixtures/despachante.js';
import { envelope } from '../../web/fixtures/comum.js';
import { sessaoAdministrador } from '../../web/fixtures/sessao.js';

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

async function prepararSessao(pagina: Page, modo: 'tecnica' | 'familiar') {
  await pagina.addInitScript(
    ({ modo, id }) => {
      sessionStorage.setItem('modo-acesso', modo);
      sessionStorage.setItem(
        `fluxo-${modo === 'tecnica' ? 'tecnico' : 'familiar'}`,
        'AAAAAAAAAAAAAAAAAAAAAA',
      );
      sessionStorage.setItem(`sessao-${modo}`, id);
    },
    { modo, id: sessaoAdministrador.session_id },
  );
}

test('link antigo, consulta da URL, histórico e foco da gaveta', async ({ page }) => {
  await prepararSessao(page, 'tecnica');
  await page.route('**/api/**', (rota) => {
    const fixture = responder(rota.request().url());
    return fixture
      ? rota.fulfill({ json: fixture })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  await page.goto('/web/index.html?agenda=conectada#administracao/configuracao');
  const admin = page.locator('#administracao-title');
  const carteira = page.locator('#patients-title');
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  await expect(admin).toBeVisible();
  await menu.click();
  await expect(page.getByRole('button', { name: 'Fechar menu' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await menu.click();
  await page.getByRole('link', { name: 'Pessoas acompanhadas' }).click();
  await expect(carteira).toBeFocused();
  await expect(page).toHaveURL(/\?agenda=conectada#carteira$/);
  await page.goBack();
  await expect(admin).toBeVisible();
  await expect(page).toHaveURL(/#administracao\/configuracao$/);
  await page.goForward();
  await expect(carteira).toBeVisible();
  await expect(carteira).toBeFocused();
  await expect(page).toHaveURL(/\?agenda=conectada#carteira$/);
});

test('link direto de Administração não monta área nem consulta recursos para Família', async ({
  page,
}) => {
  await prepararSessao(page, 'familiar');
  const recursosAdministrativos: string[] = [];
  await page.route('**/api/**', (rota) => {
    const { pathname } = new URL(rota.request().url());
    if (pathname.startsWith('/api/admin/')) recursosAdministrativos.push(pathname);
    if (pathname === '/api/familiar/sessao')
      return rota.fulfill({
        json: envelope({
          ...sessaoAdministrador,
          usuario: { ...sessaoAdministrador.usuario, perfil: 'familia' },
          capacidades: [],
        }),
      });
    if (pathname === '/api/familiar/pacientes')
      return rota.fulfill({ json: envelope({ itens: [], proximo_cursor: null }) });
    return rota.fulfill({ status: 403, json: { codigo: 'sem_permissao' } });
  });
  await page.goto('/web/index.html#administracao/configuracao');
  await expect(page.locator('#patients-title')).toBeVisible();
  await expect(page).toHaveURL(/#carteira$/);
  await expect(page.locator('#administracao-view')).toBeHidden();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Administração' })).toHaveCount(0);
  expect(recursosAdministrativos).toEqual([]);
});
