import { expect, test } from '@playwright/test';
import { envelope, id } from '../../web/fixtures/comum.js';
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

test('erro de renderização não desmonta a casca e oferece nova tentativa', async ({ page }) => {
  await page.route('**/web/configuracao-sistema.tsx', (rota) =>
    rota.fulfill({
      contentType: 'application/javascript',
      body: `export function TelaConfiguracaoSistema() {
        if (!window.painelRecuperado) throw new Error('Falha de renderização fictícia');
        return 'Painel fictício recuperado';
      }`,
    }),
  );
  await page.route('**/api/**', (rota) => {
    const fixture = responder(rota.request().url());
    return fixture
      ? rota.fulfill({ json: fixture })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  const modulo = page.waitForResponse('**/web/configuracao-sistema.tsx');
  await page.goto('/web/index.html#administracao/configuracao');
  await modulo;
  await page.evaluate(async (caminho) => {
    await import(caminho);
    await new Promise(requestAnimationFrame);
  }, '/web/configuracao-sistema.tsx');
  await expect(page.getByRole('link', { name: 'Pessoas acompanhadas' })).toBeVisible();
  await expect(page.getByText('Tente abrir a área de novo.')).toBeVisible();
  await page.evaluate(() => Reflect.set(window, 'painelRecuperado', true));
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByText('Painel fictício recuperado')).toBeVisible();
});

test('perda de audiência enquanto o módulo carrega encerra o estado ocupado', async ({ page }) => {
  let liberarModulo = () => {};
  const espera = new Promise<void>((resolver) => {
    liberarModulo = resolver;
  });
  await page.addInitScript(() => Reflect.set(window, 'audienciaFinanceiraFicticia', true));
  await page.route('**/web/financeiro-audiencia.ts', (rota) =>
    rota.fulfill({
      contentType: 'application/javascript',
      body: `export function criarAudienciaFinanceira(_consultar, aoMudar) {
        return {
          permitidaPara: () => window.audienciaFinanceiraFicticia,
          sondar: aoMudar,
          esquecer() {},
        };
      }`,
    }),
  );
  await page.route('**/web/financeiro.tsx', async (rota) => {
    await espera;
    await rota.continue();
  });
  await page.route('**/api/**', (rota) => {
    const fixture = responder(rota.request().url());
    return fixture
      ? rota.fulfill({ json: fixture })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  const modulo = page.waitForRequest('**/web/financeiro.tsx');
  await page.goto('/web/index.html#administracao/financeiro');
  const painel = page.locator('#administracao-conteudo');
  try {
    await modulo;
    await expect(painel).toHaveAttribute('aria-busy', 'true');
    await page.evaluate(() => Reflect.set(window, 'audienciaFinanceiraFicticia', false));
  } finally {
    liberarModulo();
  }
  await expect(page).toHaveURL(/#carteira$/);
  await expect(painel).not.toHaveAttribute('aria-busy', 'true');
  await expect(painel).toBeEmpty();
});

test('resposta atrasada do Financeiro não pinta a área para onde a pessoa foi', async ({
  page,
}) => {
  let liberarResposta = () => {};
  const espera = new Promise<void>((resolver) => {
    liberarResposta = resolver;
  });
  let valoresPedidos = 0;
  await page.route('**/api/**', async (rota) => {
    const url = new URL(rota.request().url());
    if (url.pathname.endsWith('/valores-acordados')) {
      valoresPedidos += 1;
      await espera;
      return rota.fulfill({
        json: envelope([
          {
            valor_id: id(40, 1),
            profissional_usuario_id: id(10, 2),
            valor_turno_centavos: 99_900,
            vigencia: { inicio: '2026-11-01', fim: null },
            motivo: 'Resposta atrasada fictícia',
          },
        ]),
      });
    }
    const fixture = responder(url.href);
    return fixture
      ? rota.fulfill({ json: fixture })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  await page.goto('/web/index.html#administracao/financeiro');
  const painel = page.locator('#administracao-conteudo');
  await expect(painel).toContainText('Financeiro do cuidado');
  await painel.getByLabel('Profissional (identificador)').fill(id(10, 2));
  await painel.getByRole('button', { name: 'Consultar valores' }).click();
  await expect(painel.getByRole('status').first()).toContainText('Consultando valores');
  expect(valoresPedidos).toBe(1);
  await page.getByRole('link', { name: 'Equipe', exact: true }).click();
  await expect(painel).toContainText('Convidar alguém');
  liberarResposta();
  // Dá tempo à resposta atrasada de chegar e, se pudesse, de pintar.
  await page.evaluate(() => new Promise((resolver) => setTimeout(resolver, 300)));
  await expect(painel).not.toContainText('Resposta atrasada fictícia');
  await expect(painel).not.toContainText('Financeiro do cuidado');
  await expect(painel).toContainText('Convidar alguém');
});
