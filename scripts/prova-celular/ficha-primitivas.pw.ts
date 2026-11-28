import { resolve } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { envelope } from '../../web/fixtures/comum.js';
import { responder } from '../../web/fixtures/despachante.js';
import { PACIENTE_IDS, pacientes, sessaoAdministrador } from '../../web/fixtures/sessao.js';
import { conferirAxe } from './axe.js';

let servidor: ViteDevServer | undefined;
let origem: string;

test.use({
  viewport: { width: 320, height: 844 },
  serviceWorkers: 'block',
  reducedMotion: 'reduce',
});

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

const caso = PACIENTE_IDS[0];
const detalhe = `/api/pacientes/${caso}`;

async function preparar(pagina: Page, perfil: 'profissional' | 'familia') {
  const modo = perfil === 'familia' ? 'familiar' : 'tecnica';
  await pagina.addInitScript(
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
  const consultas: string[] = [];
  await pagina.route('**/*', (rota) => {
    const url = new URL(rota.request().url());
    if (url.origin !== origem) return rota.abort();
    if (!url.pathname.startsWith('/api/')) return rota.continue();
    consultas.push(url.pathname);
    if (['/api/sessao', '/api/familiar/sessao'].includes(url.pathname))
      return rota.fulfill({
        json: envelope({
          ...sessaoAdministrador,
          usuario: { ...sessaoAdministrador.usuario, perfil },
          capacidades: [],
        }),
      });
    if (url.pathname === detalhe || url.pathname === `/api/familiar/pacientes/${caso}`)
      return rota.fulfill({
        json: envelope({ ...pacientes.itens[0], data_nascimento: null, contatos: [] }),
      });
    if (url.pathname === '/api/familiar/pacientes')
      return rota.fulfill({ json: envelope(pacientes) });
    if (url.pathname === `${detalhe}/pendencias`)
      return rota.fulfill({
        json: envelope({
          paciente_id: caso,
          estado: 'informacao_insuficiente',
          acordo: null,
          ultima_atualizacao_em: null,
          pendencias: [],
          perfil_escrita_acordo: false,
        }),
      });
    if (url.pathname === `${detalhe}/plano`)
      return rota.fulfill({ json: envelope({ itens: [], proximo_cursor: null }) });
    if (url.pathname === `${detalhe}/tarefas`) return rota.fulfill({ json: envelope([]) });
    if (url.pathname === `${detalhe}/anamnese`) return rota.fulfill({ json: envelope(null) });
    const resposta = responder(url.href);
    return resposta
      ? rota.fulfill({ json: resposta })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  return consultas;
}

test('moldura da ficha exibe as seções completas a 320 px e mantém a navegação por teclado', async ({
  page,
}) => {
  await preparar(page, 'profissional');
  await page.goto(`${origem}/#carteira`);
  const linha = page.locator(`[data-paciente-id="${caso}"]`);
  await linha.click();

  const ficha = page.locator('#ficha-view');
  await expect(ficha.locator('#ficha-title')).toHaveText('Ângela Souza Ficcional');
  await expect(ficha.getByRole('heading', { name: 'Visão do caso' })).toBeVisible();
  await expect(ficha.getByRole('button', { name: 'Voltar para a lista' })).toHaveCSS(
    'border-radius',
    '999px',
  );
  await expect(ficha.locator('[data-situacao=ativo]')).toHaveCSS('border-radius', '999px');

  const faixa = ficha.getByRole('tablist', { name: 'Seções da ficha' });
  await expect(faixa.getByRole('tab')).toHaveText([
    'Visão do caso',
    'Diário',
    'Plano de cuidado',
    'Pendências',
  ]);
  const mais = ficha.locator('#ficha-mais-secoes');
  await mais.locator('summary').press('Enter');
  await expect(mais.getByRole('button', { name: 'Linha do tempo' })).toBeVisible();
  const medidas = await ficha.evaluate((no) => {
    const resumo = (elemento: Element | null) => {
      if (!elemento) throw new Error('Região esperada da ficha não encontrada.');
      return [elemento.scrollWidth, elemento.clientWidth];
    };
    return {
      documento: resumo(document.documentElement),
      ficha: resumo(no),
      faixa: resumo(no.querySelector('[role=tablist]')),
      mais: resumo(no.querySelector('#ficha-mais-secoes')),
    };
  });
  for (const [regiao, [conteudo, largura]] of Object.entries(medidas))
    expect(conteudo, `largura disponível em ${regiao}`).toBe(largura);
  await expect(
    ficha.locator(
      '.ficha-cabecalho, .ficha-identidade, .ficha-abas, .ficha-aba, .ficha-mais, .ficha-painel, .pessoa-situacao, .avatar',
    ),
  ).toHaveCount(0);
  const axe = await conferirAxe(page, 'Moldura da ficha com Mais seções aberto a 320 px');
  expect(axe.toleradas).toEqual([]);

  const visao = faixa.getByRole('tab', { name: 'Visão do caso' });
  const diario = faixa.getByRole('tab', { name: 'Diário' });
  await visao.focus();
  await visao.press('ArrowRight');
  await expect(diario).toBeFocused();
  await expect(visao).toHaveAttribute('aria-selected', 'true');

  const plano = faixa.getByRole('tab', { name: 'Plano de cuidado' });
  await diario.press('ArrowRight');
  await expect(plano).toBeFocused();
  await plano.press('Enter');
  await expect(plano).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'ficha-aba-plano');
  await expect(page).toHaveURL(/\/plano$/);

  const voltar = ficha.getByRole('button', { name: 'Voltar para a lista' });
  await voltar.press('Enter');
  await expect(linha).toBeFocused();
});

test('link direto do Cadastro não expõe a seção nem consulta o cadastro para Família', async ({
  page,
}) => {
  const consultas = await preparar(page, 'familia');
  await page.goto(`${origem}/#paciente/${caso}/cadastro`);
  const ficha = page.locator('#ficha-view');
  await expect(ficha.locator('#ficha-title')).toHaveText('Ângela Souza Ficcional');
  const abas = ficha.getByRole('tablist').getByRole('tab');
  await expect(abas.first()).toHaveText('Dados do paciente');
  await expect(abas.first()).toHaveAttribute('aria-selected', 'true');
  await expect(ficha.getByText('Mais seções', { exact: true })).toHaveCount(0);
  await expect(ficha.getByRole('tab', { name: 'Cadastro' })).toHaveCount(0);
  expect(consultas).not.toContain(detalhe);
  expect(consultas).not.toContain('/api/contatos/barreira');
});

async function conferirLarguraDaMarca(marca: Locator) {
  await expect(marca).toBeVisible();
  const medidas = await marca.evaluate(async (no) => {
    await document.fonts.ready;
    const texto = document.createRange();
    texto.selectNodeContents(no);
    const { paddingInlineStart, paddingInlineEnd } = getComputedStyle(no);
    return {
      marca: no.getBoundingClientRect().width,
      interna:
        texto.getBoundingClientRect().width +
        Number.parseFloat(paddingInlineStart) +
        Number.parseFloat(paddingInlineEnd),
    };
  });
  expect(medidas.marca, 'marca ajustada ao texto e ao recuo').toBeCloseTo(medidas.interna, 0);
}

for (const largura of [320, 1440]) {
  test(`marcas da ficha acompanham o texto a ${largura} px`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await preparar(page, 'profissional');
    await page.goto(`${origem}/#carteira`);
    await page.locator(`[data-paciente-id="${caso}"]`).click();
    const ficha = page.locator('#ficha-view');
    await conferirLarguraDaMarca(ficha.locator('[data-situacao=ativo]'));
    const painel = ficha.getByRole('tabpanel');
    await conferirLarguraDaMarca(painel.getByText('Informação insuficiente', { exact: true }));
    await ficha.getByRole('tab', { name: 'Pendências' }).click();
    await expect(
      painel.getByRole('heading', { name: 'Pendências e sinal do acompanhamento' }),
    ).toBeVisible();
    await conferirLarguraDaMarca(painel.getByText('Informação insuficiente', { exact: true }));
  });
}
