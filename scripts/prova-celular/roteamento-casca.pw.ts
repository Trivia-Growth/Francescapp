import { expect, test, type Page } from '@playwright/test';
import { criarErroPublico } from '../../packages/contracts/src/comum.js';
import { responder } from '../../web/fixtures/despachante.js';
import { envelope } from '../../web/fixtures/comum.js';
import { PACIENTE_IDS, sessaoAdministrador } from '../../web/fixtures/sessao.js';

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

test('a entrada interna limpa a senha e mantém a área privada oculta após recusa', async ({
  page,
}) => {
  let liberarResposta = () => {};
  const espera = new Promise<void>((resolver) => {
    liberarResposta = resolver;
  });
  await page.route('**/api/auth/interno', async (rota) => {
    await espera;
    return rota.fulfill({
      status: 401,
      json: criarErroPublico('nao_autenticado', PACIENTE_IDS[0]),
    });
  });
  await page.goto('/web/index.html#administracao/configuracao');
  const interno = page.locator('#acesso-interno');
  await interno.locator('summary').first().click();
  const senha = interno.getByLabel('Senha', { exact: true });
  await interno.getByLabel('E-mail', { exact: true }).fill('equipe@example.test');
  await senha.fill('senha-ficticia');
  try {
    await interno.getByRole('button', { name: 'Entrar com e-mail e senha' }).click();
    await expect(senha).toHaveValue('');
    await expect(interno).toHaveAttribute('aria-busy', 'true');
    await expect(
      page.getByRole('button', { name: 'Entrar com Google da organização' }),
    ).toBeDisabled();
  } finally {
    liberarResposta();
  }
  await expect(interno.locator('#interno-feedback')).toContainText('Entrada não autorizada');
  await expect(interno).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#administracao-view')).toBeHidden();
});

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

test('entrada interna continua funcionando após falha de renderização na navegação', async ({
  page,
}) => {
  await prepararSessao(page, 'tecnica');
  await page.route('**/web/navegacao-casca.tsx', (rota) =>
    rota.fulfill({
      contentType: 'application/javascript',
      body: `export function NavegacaoCasca({ estado }) {
        if (!estado.visivel) return null;
        if (!window.navegacaoRecuperada) {
          window.navegacaoFalhou = true;
          throw new Error('Falha fictícia de navegação');
        }
        return 'Navegação fictícia recuperada';
      }`,
    }),
  );
  let expirou = false;
  await page.route('**/api/**', (rota) => {
    const url = new URL(rota.request().url());
    if (url.pathname === '/api/sessao' && expirou)
      return rota.fulfill({
        status: 401,
        json: criarErroPublico('nao_autenticado', PACIENTE_IDS[0]),
      });
    if (url.pathname === '/api/auth/interno') {
      expirou = false;
      return rota.fulfill({ json: envelope(sessaoAdministrador) });
    }
    const fixture = responder(url.href);
    return fixture
      ? rota.fulfill({ json: fixture })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  await page.goto('/web/index.html#carteira');
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'navegacaoFalhou'))).toBe(true);
  const interno = page.locator('#acesso-interno');
  await expect(interno.locator('form').first()).toHaveCount(1);
  await expect(page.locator('#casca-barra')).toContainText('Tente abrir a área de novo.');

  expirou = true;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#login-view')).toBeVisible();
  await interno.locator('summary').first().click();
  await interno.getByLabel('E-mail', { exact: true }).fill('equipe@example.test');
  await interno.getByLabel('Senha', { exact: true }).fill('senha-ficticia');
  await page.evaluate(() => Reflect.set(window, 'navegacaoRecuperada', true));
  const login = page.waitForResponse('**/api/auth/interno');
  await interno.getByRole('button', { name: 'Entrar com e-mail e senha' }).click();
  expect((await login).status()).toBe(200);
  await expect(page.locator('#login-view')).toBeHidden();
  await expect(page.locator('#casca-barra')).toContainText('Navegação fictícia recuperada');
});

test('Cadastro recupera os campos dentro do diálogo e restaura o aviso sobre a equipe', async ({
  page,
}) => {
  await prepararSessao(page, 'tecnica');
  await page.route('**/web/campos-caso-novo.tsx', async (rota) => {
    const resposta = await rota.fetch();
    const original = await resposta.text();
    const assinatura = /export function CamposCasoNovo\(\{[\s\S]*?\}\) \{/;
    if (!assinatura.test(original)) throw new Error('Componente de cadastro não identificado.');
    return rota.fulfill({
      response: resposta,
      body: original.replace(
        assinatura,
        (inicio) =>
          `${inicio}\nif (!window.cadastroRecuperado) throw new Error('Falha fictícia no Cadastro');`,
      ),
    });
  });
  await page.route('**/api/**', (rota) => {
    const url = new URL(rota.request().url());
    if (url.pathname === '/api/sessao')
      return rota.fulfill({
        json: envelope({
          ...sessaoAdministrador,
          capacidades: sessaoAdministrador.capacidades.filter(
            (capacidade) => capacidade !== 'administrar_concessoes',
          ),
        }),
      });
    const fixture = responder(url.href);
    return fixture
      ? rota.fulfill({ json: fixture })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });

  await page.goto('/web/index.html#carteira');
  await page.locator('#new-patient-link').click();
  const dialogo = page.locator('#cadastro-dialogo');
  const tentar = dialogo.getByRole('button', { name: 'Tentar novamente' });
  await expect(tentar).toBeVisible();
  await page.evaluate(() => Reflect.set(window, 'cadastroRecuperado', true));
  await tentar.click();
  await expect(dialogo.locator('#create-title')).toBeFocused();
  await expect(dialogo.locator('#case-manager')).toBeDisabled();
  await expect(dialogo.locator('#manager-state')).toContainText(
    'Seu acesso não permite listar a equipe',
  );
  await expect(tentar).toHaveCount(0);
});

test('link antigo, consulta da URL, histórico e foco da gaveta', async ({ page }) => {
  await prepararSessao(page, 'tecnica');
  await page.route('**/api/**', (rota) => {
    const fixture = responder(rota.request().url());
    return fixture
      ? rota.fulfill({ json: fixture })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  await page.goto('/web/index.html?agenda=conectada#administracao/configuracao');
  const admin = page.getByRole('heading', { name: 'Administração', level: 1 });
  const carteira = page.getByRole('heading', { name: 'Pessoas acompanhadas', level: 1 });
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  await expect(admin).toBeVisible();
  await menu.click();
  await expect(page.getByRole('button', { name: 'Fechar menu' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await menu.click();
  await page.mouse.click(385, 420);
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
  await expect(page.locator('#filtros-carteira')).toBeEmpty();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Administração' })).toHaveCount(0);
  expect(recursosAdministrativos).toEqual([]);
});

test('sair limpa os filtros mesmo com os responsáveis em consulta', async ({ page }) => {
  await prepararSessao(page, 'tecnica');
  let liberarEquipe = () => {};
  const esperaEquipe = new Promise<void>((resolver) => {
    liberarEquipe = resolver;
  });
  const caminhoEquipe = '/api/admin/concessoes-equipe';
  await page.route('**/api/**', async (rota) => {
    const url = new URL(rota.request().url());
    if (url.pathname === caminhoEquipe) await esperaEquipe;
    if (url.pathname === '/api/sessao/sair')
      return rota.fulfill({
        json: envelope({ encerrada_localmente: true, pendencia_externa: false }),
      });
    if (url.pathname === '/api/sessao')
      return rota.fulfill({
        json: envelope({
          ...sessaoAdministrador,
          capacidades: ['administrar_concessoes', 'consultar_carteira_integral'],
        }),
      });
    const fixture = responder(url.href);
    return fixture
      ? rota.fulfill({ json: fixture })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  await page.goto('/web/index.html#carteira');
  const filtros = page.locator('#filtros-carteira');
  const consultaEquipe = page.waitForRequest(
    (pedido) => new URL(pedido.url()).pathname === caminhoEquipe,
  );
  try {
    await filtros.locator('summary').click();
    await consultaEquipe;
    const filtragem = page.waitForRequest((pedido) => {
      const url = new URL(pedido.url());
      return (
        url.pathname === '/api/pacientes' && url.searchParams.get('filtro_revisao') === 'vencida'
      );
    });
    await filtros.getByLabel('Revisão').selectOption('vencida');
    await filtragem;
    await expect(filtros.locator('summary')).toHaveText('Filtrar pessoas (1 filtro ativo)');
    await page.locator('summary[aria-label="Conta"]').click();
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(page.locator('#login-title')).toBeVisible();
  } finally {
    liberarEquipe();
  }
  await expect(filtros).toBeHidden();
  await expect(filtros).toBeEmpty();
});

test('falha dos filtros preserva a Carteira e a navegação', async ({ page }) => {
  await prepararSessao(page, 'tecnica');
  await page.route('**/web/filtros-carteira.tsx', (rota) =>
    rota.fulfill({
      contentType: 'application/javascript',
      body: `export function SinalCarteira() { return null; }
        export function BarraFiltrosCarteira() {
          window.filtrosFalharam = true;
          throw new Error('Falha fictícia nos filtros');
        }`,
    }),
  );
  await page.route('**/api/**', (rota) => {
    const fixture = responder(rota.request().url());
    return fixture
      ? rota.fulfill({ json: fixture })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  await page.goto('/web/index.html#carteira');
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'filtrosFalharam'))).toBe(true);
  await expect(page.locator('#patients-body button').first()).toBeVisible();
  await expect(page.locator('#filtros-carteira')).toContainText('Tente abrir a área de novo.');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fechar menu' })).toBeFocused();
});

test('receber responsáveis mantém os filtros abertos e com foco', async ({ page }) => {
  await prepararSessao(page, 'tecnica');
  const caminhoEquipe = '/api/admin/concessoes-equipe';
  let liberar = () => {};
  const espera = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  await page.route('**/api/**', async (rota) => {
    if (new URL(rota.request().url()).pathname === caminhoEquipe) await espera;
    const fixture = responder(rota.request().url());
    return fixture
      ? rota.fulfill({ json: fixture })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  await page.goto('/web/index.html#carteira');
  const filtros = page.locator('#filtros-carteira');
  const painel = filtros.locator('details');
  const revisao = filtros.getByLabel('Revisão', { exact: true });
  const consultaEquipe = page.waitForRequest(
    (pedido) => new URL(pedido.url()).pathname === caminhoEquipe,
  );
  try {
    await painel.locator('summary').click();
    await consultaEquipe;
    await revisao.selectOption('vencida');
    await revisao.focus();
  } finally {
    liberar();
  }
  const responsavel = filtros.getByLabel('Responsável', { exact: true });
  const opcao = responsavel.locator('option').nth(2);
  await expect(opcao).toBeAttached();
  await expect(painel).toHaveAttribute('open', '');
  await expect(revisao).toBeFocused();
  await expect(revisao).toHaveValue('vencida');
  const usuario = await opcao.getAttribute('value');
  if (!usuario) throw new Error('Responsável fictício ausente.');
  const pedido = page.waitForRequest((requisicao) => {
    const url = new URL(requisicao.url());
    return (
      url.pathname === '/api/pacientes' && url.searchParams.get('filtro_responsavel') === usuario
    );
  });
  await responsavel.selectOption(usuario);
  await pedido;
});

test('volta da ficha devolve foco à linha da Carteira', async ({ page }) => {
  await prepararSessao(page, 'tecnica');
  await page.route('**/api/**', (rota) => {
    const fixture = responder(rota.request().url());
    return fixture
      ? rota.fulfill({ json: fixture })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  await page.goto('/web/index.html#carteira');
  const linha = page.locator(`[data-paciente-id="${PACIENTE_IDS[0]}"]`);
  await linha.click();
  await expect(page.locator('#ficha-title')).toBeVisible();
  await page.goBack();
  await expect(linha).toBeFocused();
  await page.goForward();
  await expect(page.locator('#ficha-title')).toBeVisible();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('link', { name: 'Pessoas acompanhadas' }).click();
  await expect(linha).toBeFocused();
});

test('trilho revela rótulo e preserva foco ao cruzar 1024 px', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepararSessao(page, 'tecnica');
  await page.route('**/api/**', (rota) => {
    const fixture = responder(rota.request().url());
    return fixture
      ? rota.fulfill({ json: fixture })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  await page.goto('/web/index.html#carteira');
  const titulo = page.getByRole('heading', { name: 'Pessoas acompanhadas', level: 1 });
  await expect(titulo).toBeFocused();
  await page.getByRole('button', { name: 'Recolher navegação' }).click();
  const link = page.getByRole('link', { name: 'Pessoas acompanhadas' });
  const rotulo = link.locator('.casca-rotulo-trilho');
  await link.hover();
  await expect(rotulo).toBeVisible();
  await page.mouse.move(800, 200);
  await link.focus();
  await expect(rotulo).toBeVisible();
  await page.setViewportSize({ width: 1023, height: 900 });
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  await expect(menu).toBeFocused();
  await menu.click();
  await expect(page.getByRole('button', { name: 'Fechar menu' })).toBeFocused();
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(page.getByRole('button', { name: 'Expandir navegação' })).toBeFocused();
});

test('link de Seu dia mantém uma vista enquanto a ficha carrega', async ({ page }) => {
  await prepararSessao(page, 'tecnica');
  let carteiraJaConsultada = false;
  let liberarFicha = () => {};
  const espera = new Promise<void>((resolver) => {
    liberarFicha = resolver;
  });
  await page.route('**/api/**', async (rota) => {
    const url = new URL(rota.request().url());
    if (url.pathname === '/api/pacientes' && !carteiraJaConsultada) {
      carteiraJaConsultada = true;
      return rota.fulfill({ json: envelope({ itens: [], proximo_cursor: null }) });
    }
    if (url.pathname === `/api/pacientes/${PACIENTE_IDS[0]}`) {
      await espera;
      return rota.fulfill({
        json: envelope({
          id: PACIENTE_IDS[0],
          nome: 'Ângela Souza Ficcional',
          nome_preferencia: 'Gela',
          versao: 3,
          data_nascimento: null,
          contatos: [],
          acompanhamento: [],
        }),
      });
    }
    const fixture = responder(url.href);
    return fixture
      ? rota.fulfill({ json: fixture })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  await page.goto('/web/index.html#home');
  const link = page.locator(`#home-view a[href^="#paciente/${PACIENTE_IDS[0]}/"]`);
  const pedidoFicha = page.waitForRequest(
    (pedido) => new URL(pedido.url()).pathname === `/api/pacientes/${PACIENTE_IDS[0]}`,
  );
  try {
    await link.first().click();
    await pedidoFicha;
    await expect(page.locator('#home-view')).toBeVisible();
    await expect(page.locator('#lista-view')).toBeHidden();
  } finally {
    liberarFicha();
  }
  await expect(page.locator('#ficha-title')).toBeVisible();
});
