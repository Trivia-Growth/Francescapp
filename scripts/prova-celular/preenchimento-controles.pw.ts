import { resolve } from 'node:path';
import { type Page, expect, test } from '@playwright/test';
import { type ViteDevServer, createServer } from 'vite';
import { criarErroPublico } from '../../packages/contracts/src/comum.ts';
import { conferirAxe } from './axe.ts';
import { envelope, id } from '../../web/fixtures/comum.ts';
import { responder } from '../../web/fixtures/despachante.ts';
import { pacientes, sessaoAdministrador } from '../../web/fixtures/sessao.ts';

const [caso] = pacientes.itens;
const familiar = id(93, 1);
const outroFamiliar = id(93, 2);
const nomeFamiliar = 'Familiar fictício';
const nomeOutroFamiliar = 'Outro familiar fictício';
const caminhoCaso = `/api/pacientes/${caso.id}`;
const consultasFundamento: (string | null)[] = [];
let servidor: ViteDevServer | undefined;
let origem: string;

const orientacao = {
  orientacao_id: id(91, 1),
  versao: 2,
  situacao: 'vigente',
  visibilidade: 'publica',
  texto: 'Orientação fictícia',
  autor: 'Equipe fictícia',
  data: '2026-10-15',
  destinatarios: 'Família fictícia',
  validade: '2026-10-25',
  registrado_em: '2026-10-15T12:00:00Z',
};
const encaminhamento = {
  encaminhamento_id: id(92, 1),
  versao: 1,
  etapa: 'realizado',
  destino: 'Serviço fictício',
  motivo: 'Motivo fictício',
  responsavel: 'Pessoa fictícia',
};

test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });

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
  consultasFundamento.length = 0;
  await page.addInitScript((id) => {
    sessionStorage.setItem('modo-acesso', 'tecnica');
    sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
    sessionStorage.setItem('sessao-tecnica', id);
  }, sessaoAdministrador.session_id);
  await page.route('**/*', (rota) => {
    const url = new URL(rota.request().url());
    if (url.origin !== origem) return rota.abort();
    if (!url.pathname.startsWith('/api/')) return rota.continue();
    switch (url.pathname) {
      case `${caminhoCaso}/orientacoes`:
        return rota.fulfill({ json: envelope([orientacao]) });
      case `${caminhoCaso}/encaminhamentos`:
        return rota.fulfill({ json: envelope([encaminhamento]) });
      case `${caminhoCaso}/execucao-turno/reconciliar`:
        return rota.fulfill({ json: envelope({ epoca: 1, resultado_pendente: null }) });
      case `${caminhoCaso}/execucao-turno/catalogo`:
        return rota.fulfill({
          json: envelope([
            {
              tipo: 'temperatura',
              unidade: '°C',
              ativo: true,
              observacao: false,
              referencia_informativa: null,
            },
          ]),
        });
      case `${caminhoCaso}/execucao-turno`:
        return rota.fulfill({ json: envelope({ itens: [], proximo_cursor: null }) });
      case `${caminhoCaso}/execucao-turno/medicacao/concessoes`:
        return rota.fulfill({
          json: envelope({ itens: [], proximo_cursor: null, pode_gerir: true }),
        });
      case `${caminhoCaso}/execucao-turno/familiares`:
        return rota.fulfill({
          json: envelope({
            itens: [
              { usuario_id: familiar, nome: nomeFamiliar },
              { usuario_id: outroFamiliar, nome: nomeOutroFamiliar },
            ],
            proximo_cursor: null,
            pode_gerir: true,
          }),
        });
      case `${caminhoCaso}/execucao-turno/fundamento`:
        consultasFundamento.push(url.searchParams.get('familiar_usuario_id'));
        return rota.fulfill({ json: envelope(null) });
    }
    const json = responder(url.href);
    return json ? rota.fulfill({ json }) : rota.fulfill({ status: 404, json: {} });
  });
});

async function lerValorVisivel(
  page: Page,
  id: string,
  valorNativo: string,
): Promise<string | null> {
  const nativo = page.locator(`#${id}`);
  await expect(nativo).toHaveValue(valorNativo);
  expect(await nativo.evaluate((no) => getComputedStyle(no).opacity), `CSS de #${id}`).toBe('0');
  return nativo.evaluate(async (no) => {
    // Deixa o React pintar o resultado do clique. A divergência é verificada sem retry.
    await new Promise<void>((resolver) => requestAnimationFrame(() => resolver()));
    const visivel = no.parentElement?.querySelector('[data-valor-visivel]');
    return visivel instanceof HTMLInputElement ? visivel.value : (visivel?.textContent ?? null);
  });
}

test('Orientações mostram datas e audiência da versão a substituir', async ({ page }) => {
  await page.goto(`${origem}/#paciente/${caso.id}/orientacoes`);
  await page.getByRole('button', { name: 'Substituir', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Salvar nova versão' })).toBeVisible();
  await conferirAxe(page, 'preenchimento-controles — orientações em substituição');

  expect({
    data: await lerValorVisivel(page, 'orientacao-data', orientacao.data),
    validade: await lerValorVisivel(page, 'orientacao-validade', orientacao.validade),
    audiencia: await lerValorVisivel(page, 'orientacao-visibilidade', 'publica'),
  }).toEqual({
    data: '15/10/2026',
    validade: '25/10/2026',
    audiencia: 'Pública (a família também vê)',
  });
});

test('Encaminhamentos mostram a etapa do registro em edição', async ({ page }) => {
  await page.goto(`${origem}/#paciente/${caso.id}/encaminhamentos`);
  await page.getByRole('button', { name: 'Editar encaminhamento para Serviço fictício' }).click();
  await expect(page.getByRole('button', { name: 'Salvar alterações' })).toBeVisible();
  await conferirAxe(page, 'preenchimento-controles — encaminhamento em edição');

  expect(await lerValorVisivel(page, 'encaminhamento-estado', 'realizado')).toBe('realizado');
});

test('Gestão do Turno restaura o familiar ao continuar editando o fundamento', async ({ page }) => {
  await page.goto(`${origem}/#carteira`);
  await page.locator('#patients-body').getByRole('button', { name: caso.nome }).click();
  await page.getByText('Mais seções', { exact: true }).click();
  await page.getByText('Execução e relatórios', { exact: true }).click();
  await expect(page.getByText(/Catálogo consultado/)).toBeVisible();
  await page.getByText('Fundamento familiar, medicação e catálogo', { exact: true }).click();
  await expect(page.getByText('Permissões e configuração consultadas.')).toBeVisible();
  const selecao = page.getByRole('combobox', { name: 'Familiar com acesso ao caso' });
  await selecao.click();
  await page.getByRole('option', { name: nomeFamiliar, exact: true }).click();
  await expect(page.getByText('Nenhum fundamento registrado.')).toBeVisible();

  const fundamento = page.getByRole('textbox', { name: 'Fundamento registrado' });
  await fundamento.fill('Rascunho fictício');
  await selecao.click();
  await page.getByRole('option', { name: nomeOutroFamiliar, exact: true }).click();
  await page.getByRole('button', { name: 'Continuar editando' }).click();

  expect(await lerValorVisivel(page, 'turno-gestao-familiar', familiar)).toBe(nomeFamiliar);
  await expect(fundamento).toHaveValue('Rascunho fictício');
  await conferirAxe(page, 'preenchimento-controles — gestão do turno');
  expect(consultasFundamento).toEqual([familiar]);
});

test('Execução aguarda a abertura da seção e cancela a reconciliação ao sair', async ({ page }) => {
  const caminho = `${caminhoCaso}/execucao-turno/reconciliar`;
  await page.addInitScript((caminho) => {
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = (entrada, opcoes) => {
      if (typeof entrada !== 'string' || new URL(entrada, location.href).pathname !== caminho)
        return fetchOriginal(entrada, opcoes);
      opcoes?.signal?.addEventListener('abort', () => {
        document.body.dataset.reconciliacaoAbortada = 'sim';
      });
      // Mantém a resposta no transporte de prova para entregar o 401 após o cancelamento.
      return fetchOriginal(entrada, { ...opcoes, signal: null }).then((resposta) => {
        document.body.dataset.reconciliacaoStatus = String(resposta.status);
        return resposta;
      });
    };
  }, caminho);
  let liberar = () => {};
  const espera = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  let reconciliacoes = 0;
  await page.route(`**${caminho}`, async (rota) => {
    reconciliacoes += 1;
    await espera;
    return rota.fulfill({ status: 401, json: criarErroPublico('nao_autenticado', id(99, 1)) });
  });

  const painel = page.locator('#ficha-painel');
  try {
    await page.goto(`${origem}/#paciente/${caso.id}/visao`);
    await expect(painel.locator('.ficha-secao')).toHaveAttribute('data-secao', 'visao');
    expect(reconciliacoes).toBe(0);

    const pedido = page.waitForRequest(
      (requisicao) => new URL(requisicao.url()).pathname === caminho,
    );
    await page.getByText('Mais seções', { exact: true }).click();
    await page.getByText('Execução e relatórios', { exact: true }).click();
    await pedido;
    const canceladaNaTroca = await page
      .getByRole('tab', { name: 'Visão do caso' })
      .evaluate((aba) => {
        if (!(aba instanceof HTMLButtonElement)) throw new Error('Aba não interativa.');
        aba.click();
        return document.body.dataset.reconciliacaoAbortada;
      });
    expect(canceladaNaTroca).toBe('sim');
    liberar();
    await expect(page.locator('body')).toHaveAttribute('data-reconciliacao-status', '401');
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await expect(painel.locator('.ficha-secao')).toHaveAttribute('data-secao', 'visao');
    await expect(page.locator('#session-actions')).toBeVisible();
  } finally {
    liberar();
  }
  expect(reconciliacoes).toBe(1);
});
