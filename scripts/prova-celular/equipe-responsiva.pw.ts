import { resolve } from 'node:path';
import { type Page, expect, test } from '@playwright/test';
import { type ViteDevServer, createServer } from 'vite';
import { envelope } from '../../web/fixtures/comum.ts';
import { responder } from '../../web/fixtures/despachante.ts';
import { CONCESSOES, sessaoAdministrador } from '../../web/fixtures/sessao.ts';

const titulo = 'Pessoas com acesso concedido';
const emailLongo = `profissional.${'acompanhamentoficticio'.repeat(3)}@exemplo.test`;
const cursor = 'pagina-2';
const primeira = { ...CONCESSOES[2], email: emailLongo };
const segunda = CONCESSOES[0];
const terceira = CONCESSOES[3];

let servidor: ViteDevServer | undefined;
let origem: string;

test.use({ serviceWorkers: 'block' });

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

async function abrirEquipe(page: Page, sessao = sessaoAdministrador) {
  const cursores: (string | null)[] = [];
  await page.addInitScript((id) => {
    sessionStorage.setItem('modo-acesso', 'tecnica');
    sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
    sessionStorage.setItem('sessao-tecnica', id);
  }, sessao.session_id);
  await page.route('**/*', (rota) => {
    const url = new URL(rota.request().url());
    if (url.origin !== origem) return rota.abort();
    if (!url.pathname.startsWith('/api/')) return rota.continue();
    if (url.pathname === '/api/sessao') return rota.fulfill({ json: envelope(sessao) });
    if (url.pathname === '/api/admin/concessoes-equipe') {
      const recebido = url.searchParams.get('cursor');
      cursores.push(recebido);
      const pagina =
        recebido === null
          ? { itens: [primeira, segunda], proximo_cursor: cursor }
          : { itens: [terceira], proximo_cursor: null };
      return rota.fulfill({ json: envelope(pagina) });
    }
    const fixture = responder(url.href);
    return fixture
      ? rota.fulfill({ json: fixture })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  await page.goto(`${origem}/#administracao/equipe`);
  return cursores;
}

test('Equipe alterna entre lista e tabela a 719/720 px e preserva a paginação e a ordem', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await abrirEquipe(page);
  await expect(page.getByText('2 pessoas com acesso concedido.')).toBeVisible();

  const registros = page.locator('[class~="@container/equipe"]');
  const lista = page.getByRole('list', { name: titulo });
  const tabela = page.getByRole('table', { name: titulo });
  const carregarMais = page.getByRole('button', { name: 'Carregar mais' });
  const linhasLista = lista.getByRole('listitem');
  const linhasTabela = tabela.locator('tbody > tr');

  await registros.evaluate((no) => {
    no.style.width = '719px';
  });
  await expect(registros).toHaveCSS('width', '719px');
  await expect(lista).toBeVisible();
  await expect(tabela).toHaveCount(0);
  await expect(linhasLista.first().locator('dt')).toHaveText([
    'Pessoa',
    'Perfil',
    'Estado',
    'Conta',
  ]);
  await expect(linhasLista.first().locator('dd')).toHaveText([
    emailLongo,
    'Profissional',
    'Convite pendente',
    'Conta ativa',
  ]);
  await expect(linhasLista.locator('dd').filter({ hasText: '@exemplo.test' })).toHaveText([
    emailLongo,
    segunda.email,
  ]);
  await expect(carregarMais).toBeEnabled();

  await registros.evaluate((no) => {
    no.style.width = '720px';
  });
  await expect(registros).toHaveCSS('width', '720px');
  await expect(tabela).toBeVisible();
  await expect(lista).toHaveCount(0);
  await expect(tabela.getByRole('columnheader')).toHaveText([
    'Pessoa',
    'Perfil',
    'Conta',
    'Estado',
  ]);
  await expect(linhasTabela.first().locator('th, td')).toHaveText([
    emailLongo,
    'Profissional',
    'Conta ativa',
    'Convite pendente',
  ]);
  await expect(linhasTabela.getByRole('rowheader')).toHaveText([emailLongo, segunda.email]);

  const proximaPagina = page.waitForResponse((resposta) => {
    const url = new URL(resposta.url());
    return (
      url.pathname === '/api/admin/concessoes-equipe' && url.searchParams.get('cursor') === cursor
    );
  });
  await carregarMais.click();
  expect((await proximaPagina).ok()).toBe(true);
  await expect(linhasTabela.getByRole('rowheader')).toHaveText([
    emailLongo,
    segunda.email,
    terceira.email,
  ]);
  await expect(carregarMais).toHaveCount(0);

  await registros.evaluate((no) => {
    no.style.width = '719px';
  });
  await expect(linhasLista.locator('dd').filter({ hasText: '@exemplo.test' })).toHaveText([
    emailLongo,
    segunda.email,
    terceira.email,
  ]);
  await expect(carregarMais).toHaveCount(0);
});

test('Equipe quebra e-mail sem espaços a 360 px e cabe a 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await abrirEquipe(page);
  const lista = page.getByRole('list', { name: titulo });
  const email = lista.getByText(emailLongo, { exact: true });
  await expect(email).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const medirQuebra = () =>
    email.evaluate((no) => {
      const texto = document.createRange();
      texto.selectNodeContents(no);
      const { left, right } = no.getBoundingClientRect();
      const linhas = [...texto.getClientRects()];
      return {
        linhas: linhas.length,
        cabe: linhas.every((linha) => linha.left >= left - 1 && linha.right <= right + 1),
      };
    });
  const quebra = await medirQuebra();
  expect(quebra.linhas).toBeGreaterThan(1);
  expect(quebra.cabe).toBe(true);

  await page.setViewportSize({ width: 320, height: 800 });
  expect((await medirQuebra()).cabe).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

// O primeiro cenário usa um perfil profissional válido sem acesso à área. O segundo isola a
// capacidade da área: perfil de administrador sem administrar_concessoes.
for (const sessao of [
  {
    ...sessaoAdministrador,
    usuario: { ...sessaoAdministrador.usuario, perfil: 'profissional' },
    capacidades: [],
  },
  { ...sessaoAdministrador, capacidades: ['administrar_cadastro'] },
]) {
  test(`link direto da Equipe recusa ${sessao.usuario.perfil} sem a capacidade da área`, async ({
    page,
  }) => {
    const cursores = await abrirEquipe(page, sessao);
    if (sessao.usuario.perfil === 'profissional') {
      await expect(page).toHaveURL(/#carteira$/);
      await expect(page.locator('#patients-body')).toContainText('Ângela Souza Ficcional');
    } else {
      await expect(page.locator('#administracao-abas a[aria-current="page"]')).toBeVisible();
      await expect(page.locator('#administracao-conteudo')).not.toHaveAttribute(
        'aria-busy',
        'true',
      );
    }
    await expect(page.locator('a[href="#administracao/equipe"]')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Equipe', exact: true })).toHaveCount(0);
    expect(cursores).toEqual([]);
  });
}
