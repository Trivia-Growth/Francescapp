import { resolve } from 'node:path';
import { type Page, expect, test } from '@playwright/test';
import { type ViteDevServer, createServer } from 'vite';
import { envelope } from '../../web/fixtures/comum.ts';
import { responder } from '../../web/fixtures/despachante.ts';
import { PACIENTE_IDS, sessaoAdministrador } from '../../web/fixtures/sessao.ts';

const caso = PACIENTE_IDS[0];
const caminhoAuditoria = '/api/admin/auditoria';
const caminhoLinhaTempo = `/api/pacientes/${caso}/linha-tempo`;
let servidor: ViteDevServer | undefined;
let origem: string;

test.use({ serviceWorkers: 'block', timezoneId: 'UTC' });

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

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-15T12:00:00Z'));
  await page.addInitScript((id) => {
    sessionStorage.setItem('modo-acesso', 'tecnica');
    sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
    sessionStorage.setItem('sessao-tecnica', id);
  }, sessaoAdministrador.session_id);
  await page.route('**/*', (rota) => {
    const url = new URL(rota.request().url());
    if (url.origin !== origem) return rota.abort();
    if (!url.pathname.startsWith('/api/')) return rota.continue();
    const json =
      url.pathname === caminhoLinhaTempo
        ? envelope({ paciente_id: caso, papel: 'colaborador', itens: [], proximo_cursor: null })
        : responder(url.href);
    return json ? rota.fulfill({ json }) : rota.fulfill({ status: 404, json: {} });
  });
});

async function dataVisivel(page: Page, id: string) {
  const grupo = page.locator(`.ui-data[data-aprimorada]:has(> #${id})`);
  const visivel = grupo.locator('.ui-data__texto');
  await expect(visivel).toBeVisible();
  const opacidade = await grupo
    .locator(`#${id}`)
    .evaluate((campo) => getComputedStyle(campo).opacity);
  expect(opacidade, `CSS de tema para #${id}`).toBe('0');
  return { grupo, visivel };
}

async function conferirObservadorDaAdministracao(page: Page) {
  await page.locator('#administracao-conteudo').evaluate((raiz) => {
    const legado = document.createElement('select');
    legado.id = 'selecao-legada-da-prova';
    legado.setAttribute('aria-label', 'Seleção legada de prova');
    legado.add(new Option('Valor fictício', 'teste'));
    raiz.append(legado);
  });
  const legado = page.locator('.ui-selecao[data-aprimorada]:has(> #selecao-legada-da-prova)');
  await expect(legado).toHaveCount(1);
  await legado.evaluate((grupo) => grupo.remove());
}

async function consultarAuditoria(page: Page) {
  const aplicar = page.getByRole('button', { name: 'Aplicar filtros' });
  const pedido = page.waitForRequest((req) => new URL(req.url()).pathname === caminhoAuditoria);
  await aplicar.click();
  return new URL((await pedido).url()).searchParams;
}

test('Auditoria envia o limite inicial digitado e retira o filtro ao apagar', async ({ page }) => {
  await page.goto(`${origem}/#administracao/auditoria`);
  const aplicar = page.getByRole('button', { name: 'Aplicar filtros' });
  await expect(aplicar).toBeEnabled();
  await conferirObservadorDaAdministracao(page);
  const { grupo: inicioGrupo, visivel: inicio } = await dataVisivel(page, 'auditoria-de');
  await expect(inicio).toHaveAttribute('id', 'auditoria-de-texto');
  expect(await inicioGrupo.evaluate((no) => no.parentElement?.closest('.ui-data') === null)).toBe(
    true,
  );

  const resultado = page.locator('.ui-selecao[data-aprimorada]:has(> #auditoria-resultado)');
  await expect(resultado.locator('#auditoria-resultado')).toHaveCSS('opacity', '0');
  expect(await resultado.evaluate((no) => no.parentElement?.closest('.ui-selecao') === null)).toBe(
    true,
  );

  // A seleção e a data podem ser usadas juntas na mesma consulta.
  await page.getByRole('combobox', { name: /^Resultado/ }).click();
  await page.getByRole('option', { name: 'Negado', exact: true }).click();

  await inicio.fill('15/10/2026');
  await expect(page.locator('#auditoria-de')).toHaveValue('2026-10-15');
  const primeira = await consultarAuditoria(page);
  expect(primeira.get('resultado')).toBe('negado');
  expect(primeira.get('instante_de'), 'limite inicial do GET de Auditoria').toBe(
    '2026-10-15T00:00:00.000Z',
  );
  await expect(inicio).toHaveValue('15/10/2026');
  await expect(page.locator('#auditoria-de')).toHaveValue('2026-10-15');

  await inicio.fill('');
  const segunda = await consultarAuditoria(page);
  expect(segunda.get('instante_de')).toBeNull();
});

test('Auditoria envia o limite final escolhido no calendário', async ({ page }) => {
  await page.goto(`${origem}/#administracao/auditoria`);
  await expect(page.getByRole('button', { name: 'Aplicar filtros' })).toBeEnabled();
  const { grupo: fim, visivel } = await dataVisivel(page, 'auditoria-ate');
  await fim.getByRole('button', { name: 'Escolher no calendário' }).click();
  await fim.getByRole('button', { name: '25 de outubro de 2026' }).click();
  const filtros = await consultarAuditoria(page);
  expect(filtros.get('instante_ate'), 'limite final do GET de Auditoria').toBe(
    '2026-10-25T23:59:59.999Z',
  );
  await expect(visivel).toHaveValue('25/10/2026');
  await expect(page.locator('#auditoria-ate')).toHaveValue('2026-10-25');
});

test('Linha do tempo encaminha a data escolhida junto dos demais filtros', async ({ page }) => {
  const consultas: URLSearchParams[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.pathname === caminhoLinhaTempo) consultas.push(url.searchParams);
  });
  await page.goto(`${origem}/#paciente/${caso}/linha-tempo`);
  await expect(
    page.locator('output').filter({ hasText: 'Nada registrado neste caso ainda.' }),
  ).toBeVisible();
  const { visivel } = await dataVisivel(page, `linha-tempo-de-${caso}`);
  await visivel.fill('15/10/2026');

  // O filtro por tipo dispara um GET mesmo quando o filtro de data está quebrado.
  // Assim o vermelho aponta o parâmetro ausente, sem depender de esperar uma consulta
  // que o onChange pode deixar de disparar.
  const pedido = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return url.pathname === caminhoLinhaTempo && url.searchParams.get('fontes') === 'diario';
  });
  await page.getByRole('combobox', { name: /^Tipo de registro/ }).click();
  await page.getByRole('option', { name: 'Diário', exact: true }).click();
  const filtros = new URL((await pedido).url()).searchParams;
  expect(filtros.get('de'), 'limite inicial do GET de Linha do tempo').toBe('2026-10-15T00:00:00Z');
  expect(consultas.some((busca) => busca.has('de') && !busca.has('fontes'))).toBe(true);
});
