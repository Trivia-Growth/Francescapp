import { resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { type ViteDevServer, createServer } from 'vite';
import { envelope } from '../../web/fixtures/comum.js';
import { responder } from '../../web/fixtures/despachante.js';
import { pacientes, sessaoAdministrador } from '../../web/fixtures/sessao.js';
import { conferirAxe } from './axe.js';

test.use({ viewport: { width: 320, height: 844 }, serviceWorkers: 'block' });
let servidor: ViteDevServer | undefined;
let origem: string;

// A configuração da aplicação compila as utilitárias que estas provas medem.
test.beforeAll(async () => {
  servidor = await createServer({
    root: resolve('web'),
    configFile: resolve('web/vite.config.ts'),
    server: { host: '127.0.0.1', port: 0 },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === 'string') throw new Error('Vite sem porta local.');
  origem = `http://127.0.0.1:${endereco.port}`;
});

test.afterAll(async () => {
  await servidor?.close();
});

async function abrirCarteira(page: Page, modo: 'tecnica' | 'familiar') {
  await page.addInitScript(
    ({ modo, id }) => {
      sessionStorage.setItem('modo-acesso', modo);
      sessionStorage.setItem(
        modo === 'tecnica' ? 'fluxo-tecnico' : 'fluxo-familiar',
        'AAAAAAAAAAAAAAAAAAAAAA',
      );
      sessionStorage.setItem(`sessao-${modo}`, id);
    },
    { modo, id: sessaoAdministrador.session_id },
  );
  await page.route('**/api/**', (rota) => {
    const url = new URL(rota.request().url());
    if (url.pathname === '/api/pacientes') {
      return rota.fulfill({ json: envelope({ ...pacientes, proximo_cursor: 'cursor-ficticio' }) });
    }
    if (url.pathname === '/api/familiar/sessao') {
      return rota.fulfill({
        json: envelope({
          ...sessaoAdministrador,
          usuario: { ...sessaoAdministrador.usuario, perfil: 'familia' },
          capacidades: [],
        }),
      });
    }
    if (url.pathname === '/api/familiar/pacientes') {
      const [{ id, nome, nome_preferencia, versao }] = pacientes.itens;
      return rota.fulfill({
        json: envelope({ itens: [{ id, nome, nome_preferencia, versao }], proximo_cursor: null }),
      });
    }
    const dados = responder(url.href);
    return dados
      ? rota.fulfill({ json: dados })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  await page.goto(`${origem}/index.html#carteira`);
  await expect(page.locator('#patients-body button').first()).toBeVisible();
}

test('Carteira usa as primitivas e cabe a 320 px com os filtros abertos', async ({ page }) => {
  await abrirCarteira(page, 'tecnica');
  const carteira = page.locator('#lista-view');
  const resumo = carteira.locator('#filtros-carteira summary');
  for (const seletor of [
    '#new-patient-link',
    '#reload-patients',
    '#busca-pacientes',
    '#next-page',
  ]) {
    await expect(carteira.locator(seletor)).toHaveCSS('border-radius', '999px');
    await expect(carteira.locator(seletor)).toHaveCSS('min-height', '46px');
  }
  await expect(resumo).toHaveCSS('border-radius', '999px');
  await resumo.focus();
  await resumo.press('Enter');
  await expect(carteira.getByLabel('Situação do caso')).toBeVisible();
  await expect(
    carteira.getByText('Tarefa de cuidado vencida.', { exact: false }).first(),
  ).toBeVisible();

  const inspecao = await carteira.evaluate((raiz) => ({
    pagina: document.documentElement.scrollWidth,
    largura: document.documentElement.clientWidth,
    carteira: raiz.scrollWidth,
    larguraCarteira: raiz.clientWidth,
    classesLegadas: [...raiz.querySelectorAll('*')]
      .filter((no) => !no.closest('#cadastro-dialogo, #agenda-individual'))
      .flatMap((no) => [...no.classList])
      .filter((classe) =>
        /^(ui-|page-heading$|workspace$|with-registration$|patient-register$|section-heading$|carteira-tools$|busca$|list-status$|list-loading$|pagination$|filtros?-carteira|sinal-carteira|avatar$|pessoa-situacao$)/.test(
          classe,
        ),
      ),
  }));
  expect(inspecao.pagina).toBe(inspecao.largura);
  expect(inspecao.carteira).toBe(inspecao.larguraCarteira);
  expect(inspecao.classesLegadas).toEqual([]);
  await conferirAxe(page, 'Carteira — filtros abertos a 320 px');
});

test('a partir de 1200 px só a busca da barra fica visível', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await abrirCarteira(page, 'tecnica');
  await expect(page.locator('#busca')).toBeHidden();
  const busca = page.getByRole('searchbox', { name: 'Buscar pessoas acompanhadas por nome' });
  await busca.fill('gela');
  await expect(page.locator('#patients-body button')).toHaveCount(1);
  await expect(page.locator('#patients-body button').first()).toContainText(
    'Ângela Souza Ficcional',
  );
});

test('a Carteira de Família mantém o recorte sem cadastro, filtros ou sinal', async ({ page }) => {
  await abrirCarteira(page, 'familiar');
  await expect(page.locator('#patients-body button')).toHaveCount(1);
  await expect(page.locator('#new-patient-link')).toBeHidden();
  await expect(page.locator('#filtros-carteira')).toBeHidden();
  await expect(
    page.locator('#patients-body [data-estado], #patients-body [data-situacao]'),
  ).toHaveCount(0);
  await conferirAxe(page, 'Carteira — Família a 320 px');
});
