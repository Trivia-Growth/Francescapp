import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mensagensErro } from '../../packages/contracts/src/erros.ts';
import { responder } from '../../web/fixtures/despachante.ts';
import { sessaoAdministrador } from '../../web/fixtures/sessao.ts';

/* Prova de navegador da fatia 9 do plano visual (leituras por família com TanStack Query),
 * contra um build de produção e a casca real. Dublê HTTP, dados fictícios; nada sai para a
 * rede. Uso:
 *   node --experimental-strip-types scripts/prova-celular/cache-catalogos.mjs <build> <capturas> [--medir]
 *
 * Para cada catálogo administrado:
 * 1. entrada fria: 1 GET; capturas a 390 e 1440 px (comparáveis byte a byte entre builds);
 * 2. 5 voltas (Auditoria → catálogo): GETs ao catálogo por volta; lista igual à da entrada;
 * 3. axe (WCAG 2.1 A/AA) na tela do catálogo: zero violação;
 * 4. 403 ao Atualizar esvazia a tela, e a volta seguinte relê (nada guardado).
 * Com `--medir` só relata contagens e capturas, sem exigir 0 GET por volta: é como se mede
 * o build de antes. Sai com código 1 na primeira conferência que falhar. */
const [caminhoBuild, saida, opcao] = process.argv.slice(2);
assert.ok(caminhoBuild && saida, 'Informe o diretório do build e o destino das capturas.');
const medir = opcao === '--medir';
mkdirSync(saida, { recursive: true });

const familias = [
  {
    area: 'estado-emocional',
    caminho: '/api/admin/estado-emocional',
    atualizar: 'Atualizar catálogo de termos',
  },
  {
    area: 'papel-declarado',
    caminho: '/api/admin/papel-declarado',
    atualizar: 'Atualizar catálogo de papéis',
  },
  {
    area: 'modelo-ficha-plantao',
    caminho: '/api/admin/campo-extra-plano',
    atualizar: 'Atualizar modelo',
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
    for (const familia of familias) {
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
      let recusar = false;
      await pagina.route('**/*', async (rota) => {
        const pedido = rota.request();
        const url = new URL(pedido.url());
        if (url.origin !== origem) return rota.abort();
        if (!url.pathname.startsWith('/api/')) return rota.continue();
        if (url.pathname === familia.caminho && pedido.method() === 'GET') {
          gets += 1;
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
      const conteudo = pagina.locator('#administracao-conteudo');
      const pronto = () =>
        pagina.locator('#administracao-conteudo:not([aria-busy="true"])').waitFor();
      const ir = async (area) => {
        await pagina.evaluate((a) => {
          window.location.hash = `#administracao/${a}`;
        }, area);
        await pronto();
      };
      const itens = conteudo.locator('details summary');

      await pagina.goto(`${origem}/#administracao/${familia.area}`);
      await pronto();
      await itens.first().waitFor();
      await pagina.waitForTimeout(300);
      assert.equal(gets, 1, `${familia.area}: entrada fria com 1 GET`);
      const listaInicial = await itens.allTextContents();
      for (const [largura, altura] of [
        [390, 844],
        [1440, 900],
      ]) {
        await pagina.setViewportSize({ width: largura, height: altura });
        await pagina.waitForTimeout(400);
        await pagina.screenshot({
          path: `${saida}/${familia.area}-${largura}.png`,
          fullPage: true,
        });
      }

      const porVolta = [];
      for (let volta = 0; volta < 5; volta += 1) {
        await ir('auditoria');
        const antes = gets;
        await ir(familia.area);
        await itens.first().waitFor();
        assert.deepEqual(await itens.allTextContents(), listaInicial, `volta ${volta + 1}: lista`);
        await pagina.waitForTimeout(300);
        porVolta.push(gets - antes);
      }
      console.log(`${familia.area}: GETs entrada=1; por volta=${porVolta.join(',')}`);
      if (!medir) assert.deepEqual(porVolta, [0, 0, 0, 0, 0], `${familia.area}: 5 voltas sem GET`);

      const { violations } = await new AxeBuilder({ page: pagina })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const achados = violations.flatMap((v) => v.nodes.map((n) => `${v.id} em ${n.target}`));
      console.log(`${familia.area}: axe ${achados.length} violação(ões)`);
      assert.deepEqual(achados, [], `${familia.area}: axe sem violação`);

      recusar = true;
      await pagina.getByRole('button', { name: familia.atualizar }).click();
      await pagina.waitForFunction(
        () => (document.querySelector('#administracao-conteudo')?.textContent ?? '') === '',
      );
      await ir('auditoria');
      const antesRecusa = gets;
      await ir(familia.area);
      await itens.first().waitFor();
      assert.equal(gets - antesRecusa, 1, `${familia.area}: após 403 a volta relê`);
      console.log(`${familia.area}: 403 esvaziou a tela; a volta seguinte fez 1 GET`);

      assert.deepEqual(errosDePagina, [], `${familia.area}: sem erro de página`);
      await contexto.close();
    }
    console.log('OK');
  } finally {
    await navegador.close();
  }
} finally {
  await servidor.close();
}
