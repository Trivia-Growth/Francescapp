import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mensagensErro } from '../../packages/contracts/src/erros.ts';
import { responder } from '../../web/fixtures/despachante.ts';
import { sessaoAdministrador } from '../../web/fixtures/sessao.ts';

/* Prova de navegador da fatia 9b do plano visual (Equipe, Plano de cuidado e Auditoria,
 * com política própria), contra um build de produção e a casca real. Dublê HTTP, dados
 * fictícios; nada sai para a rede. Uso:
 *   node --experimental-strip-types scripts/prova-celular/cache-equipe-auditoria.mjs <build> <capturas> [--medir]
 *
 * Para cada tela:
 * 1. entrada fria (GETs relatados); capturas a 390 e 1440 px (comparáveis byte a byte entre builds);
 * 2. 5 voltas (Papéis declarados → tela), com a resposta da tela atrasada 800 ms: GETs por
 *    volta, e se a lista já está à vista no primeiro quadro, antes da resposta;
 * 3. axe (WCAG 2.1 A/AA) na tela: zero violação;
 * 4. 403 na releitura: o guardado some, e a volta seguinte não o mostra.
 * Na Auditoria, também: dois envios iguais seguidos de "Aplicar filtros" → GETs.
 * Com `--medir` só relata os números, sem exigir a política: é como se mede o build de
 * antes. Sai com código 1 na primeira conferência que falhar. */
const [caminhoBuild, saida, opcao] = process.argv.slice(2);
assert.ok(caminhoBuild && saida, 'Informe o diretório do build e o destino das capturas.');
const medir = opcao === '--medir';
mkdirSync(saida, { recursive: true });

const telas = [
  {
    area: 'equipe',
    caminho: '/api/admin/concessoes-equipe',
    amostra: '#administracao-conteudo li',
    politica: { getsPorVolta: 1, visivelNaVolta: true },
    recusar: (pagina) =>
      pagina.getByRole('button', { name: 'Atualizar lista', exact: true }).first().click(),
  },
  {
    area: 'plano-cuidado',
    caminho: '/api/admin/campo-extra-plano',
    amostra: '#administracao-conteudo details summary',
    politica: { getsPorVolta: 1, visivelNaVolta: true },
    recusar: (pagina) =>
      pagina.getByRole('button', { name: 'Atualizar catálogo e aprovadores' }).click(),
  },
  {
    area: 'auditoria',
    caminho: '/api/admin/auditoria',
    amostra: '#administracao-conteudo ul[aria-label="Registros de auditoria"] > li',
    politica: { getsPorVolta: 1, visivelNaVolta: false },
    recusar: (pagina) => pagina.getByRole('button', { name: 'Aplicar filtros' }).click(),
  },
];

const servidor = await preview({
  root: 'web',
  preview: { host: '127.0.0.1', port: 0 },
  build: { outDir: resolve(caminhoBuild) },
});
try {
  const endereco = servidor.httpServer.address();
  assert.ok(endereco && typeof endereco !== 'string');
  const origem = `http://127.0.0.1:${endereco.port}`;
  const navegador = await chromium.launch();
  try {
    for (const tela of telas) {
      const contexto = await navegador.newContext({
        viewport: { width: 1440, height: 900 },
        serviceWorkers: 'block',
      });
      const pagina = await contexto.newPage();
      pagina.setDefaultTimeout(8000);
      const errosDePagina = [];
      pagina.on('pageerror', (erro) => errosDePagina.push(String(erro)));
      await pagina.addInitScript((id) => {
        sessionStorage.setItem('modo-acesso', 'tecnica');
        sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
        sessionStorage.setItem('sessao-tecnica', id);
      }, sessaoAdministrador.session_id);
      let gets = 0;
      let atraso = 0;
      let recusar = false;
      await pagina.route('**/*', async (rota) => {
        const pedido = rota.request();
        const url = new URL(pedido.url());
        if (url.origin !== origem) return rota.abort();
        if (!url.pathname.startsWith('/api/')) return rota.continue();
        if (url.pathname === tela.caminho && pedido.method() === 'GET') {
          gets += 1;
          if (atraso) await new Promise((r) => setTimeout(r, atraso));
          if (recusar) {
            recusar = false;
            return rota.fulfill({
              status: 403,
              json: {
                erro: { codigo: 'sem_permissao', mensagem: mensagensErro.sem_permissao },
                request_id: sessaoAdministrador.session_id,
              },
            });
          }
        }
        const fixture = responder(url.href);
        return fixture
          ? rota.fulfill({ json: fixture })
          : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
      });
      const pronto = () =>
        pagina.locator('#administracao-conteudo:not([aria-busy="true"])').waitFor();
      const ocioso = () =>
        pagina.waitForFunction(
          () => !document.querySelector('#administracao-conteudo [aria-busy="true"]'),
        );
      const ir = async (area) => {
        await pagina.evaluate((a) => {
          window.location.hash = `#administracao/${a}`;
        }, area);
        await pronto();
      };
      const amostra = pagina.locator(tela.amostra);

      await pagina.goto(`${origem}/#administracao/${tela.area}`);
      await pronto();
      await amostra.first().waitFor({ state: 'attached' });
      await ocioso();
      await pagina.waitForTimeout(300);
      // Na Equipe a entrada conta também o catálogo compartilhado da casca (mesma rota,
      // lido uma vez por sessão para o cadastro); por isso só é relatada.
      const entrada = gets;
      for (const [largura, altura] of [
        [390, 844],
        [1440, 900],
      ]) {
        await pagina.setViewportSize({ width: largura, height: altura });
        await pagina.waitForTimeout(400);
        await pagina.screenshot({ path: `${saida}/${tela.area}-${largura}.png`, fullPage: true });
      }

      const porVolta = [];
      const visivel = [];
      atraso = 800;
      for (let volta = 0; volta < 5; volta += 1) {
        await ir('papel-declarado');
        const antes = gets;
        await ir(tela.area);
        // Logo após a casca montar a tela, com a resposta ainda a caminho.
        visivel.push((await amostra.count()) > 0);
        await ocioso();
        await pagina.waitForTimeout(200);
        porVolta.push(gets - antes);
      }
      atraso = 0;
      console.log(
        `${tela.area}: GETs entrada=${entrada}; por volta=${porVolta.join(',')}; lista no 1º quadro da volta=${visivel.join(',')}`,
      );
      if (!medir) {
        assert.deepEqual(porVolta, Array(5).fill(tela.politica.getsPorVolta), `${tela.area}: GETs`);
        assert.deepEqual(
          visivel,
          Array(5).fill(tela.politica.visivelNaVolta),
          `${tela.area}: volta`,
        );
      }

      if (tela.area === 'auditoria') {
        atraso = 800;
        const antes = gets;
        const aplicar = pagina.getByRole('button', { name: 'Aplicar filtros' });
        await aplicar.click();
        await aplicar.click({ force: true });
        await ocioso();
        await pagina.waitForTimeout(300);
        atraso = 0;
        console.log(`auditoria: dois "Aplicar filtros" iguais seguidos → ${gets - antes} GET(s)`);
        if (!medir) assert.equal(gets - antes, 1, 'auditoria: dedupe em voo');
      }

      const { violations } = await new AxeBuilder({ page: pagina })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const achados = violations.flatMap((v) => v.nodes.map((n) => `${v.id} em ${n.target}`));
      console.log(`${tela.area}: axe ${achados.length} violação(ões)`);
      assert.deepEqual(achados, [], `${tela.area}: axe sem violação`);

      recusar = true;
      await tela.recusar(pagina);
      await pagina.waitForFunction((seletor) => !document.querySelector(seletor), tela.amostra);
      await ir('papel-declarado');
      atraso = 800;
      await ir(tela.area);
      const reapareceu = (await amostra.count()) > 0;
      await ocioso();
      atraso = 0;
      console.log(`${tela.area}: após 403 a volta mostrou o guardado=${reapareceu}`);
      assert.equal(reapareceu, false, `${tela.area}: após 403 nada guardado`);

      assert.deepEqual(errosDePagina, [], `${tela.area}: sem erro de página`);
      await contexto.close();
    }
    console.log('OK');
  } finally {
    await navegador.close();
  }
} finally {
  await servidor.close();
}
