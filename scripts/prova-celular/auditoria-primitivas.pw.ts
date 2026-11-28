import { resolve } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { envelope } from '../../web/fixtures/comum.js';
import { responder } from '../../web/fixtures/despachante.js';
import { auditoria } from '../../web/fixtures/governanca.js';
import { sessaoAdministrador } from '../../web/fixtures/sessao.js';
import { conferirAxe } from './axe.js';

const autor = 'OperadorFicticioSemEspacos'.repeat(4);
const acao = 'Consultar operacao ficticia para verificar quebra de linha';
let servidor: ViteDevServer | undefined;
let origem: string;

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

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

async function preparar(page: Page, perfil: 'administrador' | 'familia') {
  const modo = perfil === 'familia' ? 'familiar' : 'tecnica';
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
  const consultas: string[] = [];
  await page.route('**/*', (rota) => {
    const url = new URL(rota.request().url());
    if (url.origin !== origem) return rota.abort();
    if (!url.pathname.startsWith('/api/')) return rota.continue();
    consultas.push(url.pathname);
    if (url.pathname === '/api/familiar/sessao') {
      return rota.fulfill({
        json: envelope({
          ...sessaoAdministrador,
          capacidades: [],
          usuario: { ...sessaoAdministrador.usuario, perfil },
        }),
      });
    }
    if (url.pathname === '/api/familiar/pacientes')
      return rota.fulfill({ json: envelope({ itens: [], proximo_cursor: null }) });

    if (url.pathname === '/api/admin/auditoria') {
      return rota.fulfill({
        json: envelope({
          itens: [
            {
              ...auditoria.itens[0],
              ator_usuario_id: null,
              operador_restrito: autor,
              acao: 'api.consultar_operacao_ficticia_para_verificar_quebra_de_linha',
            },
          ],
          proximo_cursor: null,
        }),
      });
    }
    const resposta = responder(url.href);
    return resposta
      ? rota.fulfill({ json: resposta })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  return consultas;
}

async function conferirTextoInteiro(campo: Locator) {
  await expect(campo).toBeVisible();
  const limites = await campo.evaluate((no) => {
    const celula = no.closest('dd, th, td');
    if (!celula) throw new Error('Texto fora da célula da Auditoria.');
    const { left, right } = celula.getBoundingClientRect();
    const intervalo = document.createRange();
    intervalo.selectNodeContents(no);
    return (
      [...intervalo.getClientRects()].every(
        (rect) => rect.left >= left - 1 && rect.right <= right + 1,
      ) && getComputedStyle(celula).textOverflow !== 'ellipsis'
    );
  });
  expect(limites, 'texto inteiro dentro da célula').toBe(true);
}

for (const largura of [320, 390, 1440]) {
  test(`Auditoria mantém Quando, Quem e Operação inteiros a ${largura} px`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await preparar(page, 'administrador');
    await page.goto(`${origem}/#administracao/auditoria`);
    await expect(page.getByText('1 registro nesta página.', { exact: true })).toBeVisible();
    const painel = page.locator('[data-tela=auditoria]');
    const tabela = painel.getByRole('table', { name: 'Registros de auditoria' });
    const lista = painel.getByRole('list', { name: 'Registros de auditoria' });
    const registro =
      largura === 1440 ? tabela.getByRole('row').nth(1) : lista.getByRole('listitem').first();

    await expect(largura === 1440 ? lista : tabela).toHaveCount(0);
    await conferirTextoInteiro(registro.getByText('24/11/2026, 20:00:00', { exact: true }));
    await conferirTextoInteiro(registro.getByText(autor, { exact: true }));
    await conferirTextoInteiro(registro.getByText(acao, { exact: true }));
    const resultado = registro.getByText('Permitido', { exact: true });
    await conferirTextoInteiro(resultado);
    const linhasDoResultado = await resultado.evaluate((no) => {
      const intervalo = document.createRange();
      intervalo.selectNodeContents(no);
      return intervalo.getClientRects().length;
    });
    expect(linhasDoResultado).toBe(1);
    await expect(registro.getByText(/paciente 00000032/)).toBeVisible();

    const larguraRenderizada = await painel.evaluate((no) => ({
      painel: no.scrollWidth,
      painelVisivel: no.clientWidth,
      documento: document.documentElement.scrollWidth,
      janela: document.documentElement.clientWidth,
    }));
    expect(larguraRenderizada.painel).toBe(larguraRenderizada.painelVisivel);
    expect(larguraRenderizada.documento).toBe(larguraRenderizada.janela);
    await expect(painel.locator('[class^="auditoria__"], [class*=" auditoria__"]')).toHaveCount(0);
    const axe = await conferirAxe(page, `Auditoria — registros a ${largura} px`);
    expect(axe.toleradas).toEqual([]);
  });
}

test('Família não monta a Auditoria nem consulta seu endpoint por link direto', async ({
  page,
}) => {
  const consultas = await preparar(page, 'familia');
  await page.goto(`${origem}/#administracao/auditoria`);
  await expect(page.locator('#patients-title')).toBeVisible();
  await expect(page.locator('[data-tela=auditoria]')).toHaveCount(0);
  expect(consultas).not.toContain('/api/admin/auditoria');
});
