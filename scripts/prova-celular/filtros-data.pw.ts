import { resolve } from 'node:path';
import { type Page, expect, test } from '@playwright/test';
import { type ViteDevServer, createServer } from 'vite';
import { envelope } from '../../web/fixtures/comum.ts';
import { responder } from '../../web/fixtures/despachante.ts';
import { PACIENTE_IDS, concessoesEquipe, sessaoAdministrador } from '../../web/fixtures/sessao.ts';
import { conferirAxe } from './axe.ts';
import { conferirAlinhamentoDaData, conferirControlesNativos } from './controles-nativos.js';

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
  const grupo = page.locator(`[data-aprimorada=data]:has(> #${id})`);
  const visivel = grupo.locator('[data-valor-visivel]');
  await expect(visivel).toBeVisible();
  const opacidade = await grupo
    .locator(`#${id}`)
    .evaluate((campo) => getComputedStyle(campo).opacity);
  expect(opacidade, `CSS de tema para #${id}`).toBe('0');
  return { grupo, visivel };
}

async function consultarAuditoria(page: Page) {
  const aplicar = page.getByRole('button', { name: 'Aplicar filtros' });
  const pedido = page.waitForRequest((req) => new URL(req.url()).pathname === caminhoAuditoria);
  await aplicar.click();
  return new URL((await pedido).url()).searchParams;
}

for (const seletor of [
  '#cadastro',
  '#administracao-conteudo',
  '#ficha-view',
  '#regras-conteudo',
  '#home-view',
  '#agenda-individual',
]) {
  test(`a casca mantém seleção e data nativas em ${seletor}`, async ({ page }) => {
    await page.goto(`${origem}/#home`);
    await expect(page.locator('#home-view')).toBeVisible();
    await conferirControlesNativos(page, seletor);
  });
}

test('Auditoria envia o limite inicial digitado e retira o filtro ao apagar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origem}/#administracao/auditoria`);
  const aplicar = page.getByRole('button', { name: 'Aplicar filtros' });
  await expect(aplicar).toBeEnabled();
  await conferirAxe(page, 'filtros-data — auditoria (390x844)');
  await conferirControlesNativos(page, '#administracao-conteudo');
  const { grupo: inicioGrupo, visivel: inicio } = await dataVisivel(page, 'auditoria-de');
  await expect(inicio).toHaveAttribute('id', 'auditoria-de-texto');
  expect(
    await inicioGrupo.evaluate(
      (no) => no.parentElement?.closest('[data-aprimorada=data]') === null,
    ),
  ).toBe(true);

  const resultado = page.locator('[data-aprimorada=selecao]:has(> #auditoria-resultado)');
  await expect(resultado.locator('#auditoria-resultado')).toHaveCSS('opacity', '0');
  expect(
    await resultado.evaluate(
      (no) => no.parentElement?.closest('[data-aprimorada=selecao]') === null,
    ),
  ).toBe(true);

  // No iOS, campos com menos de 16px provocam zoom ao receber foco.
  for (const seletor of [
    '[data-aprimorada=selecao]:has(> #auditoria-caso) > [role=combobox]',
    '#auditoria-acao',
    '[data-aprimorada=selecao]:has(> #auditoria-resultado) > [role=combobox]',
    '#auditoria-de-texto',
    '#auditoria-ate-texto',
  ]) {
    const campo = page.locator(seletor);
    await expect(campo).toBeVisible();
    await expect(campo).toHaveCSS('font-size', '16px');
  }

  // A seleção e a data podem ser usadas juntas na mesma consulta.
  await page.getByRole('combobox', { name: /^Resultado/ }).click();
  await page.getByRole('option', { name: 'Negado', exact: true }).click();
  await expect(resultado.getByRole('combobox')).toContainText('Negado');
  await expect(resultado.locator('#auditoria-resultado')).toHaveValue('negado');

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
  await expect(visivel).toHaveValue('25/10/2026');
  const filtros = await consultarAuditoria(page);
  expect(filtros.get('instante_ate'), 'limite final do GET de Auditoria').toBe(
    '2026-10-25T23:59:59.999Z',
  );
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
  const { grupo, visivel } = await dataVisivel(page, `linha-tempo-de-${caso}`);
  await conferirAlinhamentoDaData(grupo);
  await expect(visivel).toHaveAttribute('id', `linha-tempo-de-${caso}-texto`);
  await conferirAxe(page, 'filtros-data — linha do tempo');
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

test('Ficha renova a seleção de profissional ao avançar a página', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (erro) => erros.push(erro.message));
  await page.route('**/api/admin/concessoes-equipe**', (rota) => {
    const cursor = new URL(rota.request().url()).searchParams.get('cursor');
    const itens = cursor ? concessoesEquipe.itens.slice(4) : concessoesEquipe.itens.slice(0, 4);
    return rota.fulfill({
      json: envelope({ itens, proximo_cursor: cursor ? null : 'pagina-ficticia' }),
    });
  });
  await page.goto(`${origem}/#paciente/${caso}/equipe`);
  const proxima = page.getByRole('button', { name: 'Próxima página' });
  await expect(proxima).toBeVisible();
  await conferirControlesNativos(page, '#ficha-view');
  await conferirAxe(page, 'filtros-data — equipe do caso');
  const id = 'profissional-selecionado';
  const grupo = page.locator(`[data-aprimorada=selecao]:has(> #${id})`);
  const nativo = grupo.locator(`#${id}`);

  async function conferirSelecao() {
    await expect(grupo).toHaveCount(1);
    const medidas = await nativo.evaluate((no) => ({
      opacidade: getComputedStyle(no).opacity,
      invólucroÚnico:
        no.parentElement?.parentElement?.closest('[data-aprimorada=selecao]') === null,
    }));
    expect(medidas.opacidade, 'CSS de tema para #profissional-selecionado').toBe('0');
    expect(medidas.invólucroÚnico).toBe(true);
    await expect(grupo.getByRole('combobox', { name: 'Profissional', exact: true })).toBeVisible();
  }

  await conferirSelecao();
  await grupo.getByRole('combobox').click();
  const nome = concessoesEquipe.itens.find((item) => item.usuario_id)?.email;
  if (!nome) throw new Error('Fixture de equipe sem profissional.');
  await grupo.getByRole('option', { name: nome, exact: true }).click();
  expect(await nativo.inputValue()).not.toBe('');
  await proxima.click();
  await expect(page.getByText(/Página 2\./)).toBeVisible();
  await conferirSelecao();
  await expect(nativo).toHaveValue('');
  expect(erros).toEqual([]);
});

test('Cadastro mantém os controles React ao carregar a equipe e adicionar contatos', async ({
  page,
}) => {
  let liberarEquipe = () => {};
  const equipeAdiada = new Promise<void>((resolver) => {
    liberarEquipe = resolver;
  });
  await page.route('**/api/admin/concessoes-equipe**', async (rota) => {
    await equipeAdiada;
    return rota.fulfill({ json: envelope(concessoesEquipe) });
  });
  await page.route('**/api/pacientes', (rota) =>
    rota.request().method() === 'POST'
      ? rota.fulfill({
          json: envelope({
            id: caso,
            nome: 'Paciente fictício',
            nome_preferencia: 'Fictício',
            data_nascimento: '2000-01-31',
            contatos: [],
            versao: 1,
          }),
        })
      : rota.fallback(),
  );
  const erros: string[] = [];
  page.on('pageerror', (erro) => erros.push(erro.message));

  try {
    await page.goto(`${origem}/#carteira`);
    await page.getByRole('link', { name: 'Novo paciente' }).click();
    const dialogo = page.locator('#cadastro-dialogo');
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('button', { name: 'Conferir e liberar' }).click();
    await conferirControlesNativos(page, '#cadastro');
    await expect(dialogo.locator('#add-contact-controle')).toHaveCSS('display', 'contents');
    await conferirAxe(page, 'filtros-data — cadastro de paciente');
    const { visivel: nascimento } = await dataVisivel(page, 'birth-date');
    await expect(nascimento).toHaveAttribute('id', 'birth-date-texto');

    async function selecao(id: string) {
      const grupo = dialogo.locator(`[data-aprimorada=selecao]:has(> #${id})`);
      await expect(grupo.locator(`#${id}`)).toHaveCSS('opacity', '0');
      expect(
        await grupo.evaluate(
          (no) => no.parentElement?.closest('[data-aprimorada=selecao]') === null,
        ),
      ).toBe(true);
      return grupo.getByRole('combobox');
    }

    const responsavel = await selecao('case-manager');
    await expect(responsavel).toBeDisabled();
    liberarEquipe();
    await expect(responsavel).toBeEnabled();

    const criar = dialogo.getByRole('button', { name: 'Cadastrar paciente' });
    await expect(criar).toBeEnabled();
    await dialogo.locator('#patient-name').fill('Paciente fictício');
    await dialogo.locator('#preferred-name').fill('Fictício');
    await nascimento.fill('31/01/2000');
    await dialogo.locator('#contact-value-1').fill('contato@exemplo.test');

    await dialogo.getByRole('button', { name: 'Adicionar outro contato' }).click();
    await expect(dialogo.locator('#contact-value-2')).toBeFocused();
    await (await selecao('contact-type-2')).click();
    await dialogo.getByRole('option', { name: 'Telefone', exact: true }).click();
    await expect(dialogo.locator('#contact-value-2')).toHaveAttribute('type', 'tel');
    await dialogo.getByRole('button', { name: 'Remover contato 2' }).click();
    await expect(dialogo.locator('#contact-type-2')).toHaveCount(0);
    await expect(dialogo.locator('#contact-value-1')).toBeFocused();

    const situacao = await selecao('case-status');
    await criar.click();
    await expect(situacao).toHaveAttribute('aria-invalid', 'true');
    await expect(situacao).toBeFocused();
    await expect(responsavel).toHaveAttribute('aria-invalid', 'true');

    await situacao.click();
    await dialogo.getByRole('option', { name: 'Ativo', exact: true }).click();
    await expect(situacao).not.toHaveAttribute('aria-invalid', 'true');
    await responsavel.click();
    const pessoa = concessoesEquipe.itens.find(
      (item) => item.perfil === 'profissional' && item.estado === 'vinculada' && item.ativo,
    );
    if (!pessoa?.usuario_id) throw new Error('Fixture sem responsável vinculado.');
    await dialogo.locator(`[role="option"][data-valor="${pessoa.usuario_id}"]`).click();
    await expect(responsavel).not.toHaveAttribute('aria-invalid', 'true');

    const pedido = page.waitForRequest(
      (req) => new URL(req.url()).pathname === '/api/pacientes' && req.method() === 'POST',
    );
    await criar.click();
    expect((await pedido).postDataJSON()).toMatchObject({
      entrada: {
        data_nascimento: '2000-01-31',
        situacao: 'ativo',
        responsavel_id: pessoa.usuario_id,
        contatos: [{ tipo: 'email', valor: 'contato@exemplo.test' }],
      },
    });
    await expect(nascimento).toHaveValue('');
    await expect(dialogo.locator('#case-status')).toHaveValue('');
    await expect(dialogo.locator('#case-manager')).toHaveValue('');
    await expect(situacao.locator('[data-valor-visivel]')).toHaveText('Selecione a situação');
    await expect(responsavel.locator('[data-valor-visivel]')).toHaveText(
      'Selecione quem acompanha o caso',
    );
    expect(erros).toEqual([]);
  } finally {
    liberarEquipe();
  }
});

test('Cadastro mantém a ação à vista e sem rolagem horizontal a 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(`${origem}/#carteira`);
  const abrir = page.getByRole('link', { name: 'Novo paciente' });
  await abrir.click();

  const dialogo = page.getByRole('dialog', { name: 'Novo paciente' });
  await expect(dialogo.locator('#create-title')).toBeFocused();
  await dialogo.getByRole('button', { name: 'Conferir e liberar' }).click();
  const cadastrar = dialogo.getByRole('button', { name: 'Cadastrar paciente' });
  await expect(cadastrar).toBeEnabled();
  for (const controle of [
    cadastrar,
    dialogo.locator('#patient-name'),
    dialogo.locator('#add-contact'),
  ]) {
    await expect(controle).toHaveCSS('border-radius', '999px');
    await expect(controle).toHaveCSS('min-height', '46px');
  }

  await expect(
    dialogo.locator('[class*="ui-campo"], [class*="ui-data"], [class*="ui-selecao"]'),
  ).toHaveCount(0);
  const corpo = dialogo.locator('#cadastro-corpo');
  const medidas = await corpo.evaluate((no) => ({
    largura: no.clientWidth,
    conteudo: no.scrollWidth,
    documento: document.documentElement.scrollWidth,
    janela: document.documentElement.clientWidth,
    altura: no.clientHeight,
    alturaConteudo: no.scrollHeight,
  }));
  expect(medidas.conteudo).toBe(medidas.largura);
  expect(medidas.documento).toBe(medidas.janela);
  expect(medidas.alturaConteudo).toBeGreaterThan(medidas.altura);
  await expect(cadastrar).toBeInViewport();
  await corpo.evaluate((no) => {
    no.scrollTop = no.scrollHeight;
  });
  await expect(cadastrar).toBeInViewport();
  await conferirAxe(page, 'Cadastro — 320 px com o corpo rolado');
  await page.keyboard.press('Escape');
  await expect(dialogo).toBeHidden();
  await expect(abrir).toBeFocused();
});
