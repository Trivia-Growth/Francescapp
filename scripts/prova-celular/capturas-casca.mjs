import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { responder } from '../../web/fixtures/despachante.ts';
import { sessaoAdministrador } from '../../web/fixtures/sessao.ts';

// Capturas da casca com o build real e dados fictícios, sem tráfego externo.
const [caminhoBuild, destino, opcao] = process.argv.slice(2);
assert.ok(caminhoBuild && destino, 'Informe o diretório do build e o destino das capturas.');
const build = resolve(caminhoBuild);
mkdirSync(destino, { recursive: true });
const html = readFileSync(join(build, 'index.html'), 'utf8');
const iniciais = [
  ...html.matchAll(/(?:type="module"|rel="modulepreload")[^>]+(?:href|src)="([^"]+\.js)"/g),
].map(([, arquivo]) => arquivo);
assert.ok(iniciais.length > 0, 'O HTML precisa referenciar o módulo de entrada.');
const bytes = iniciais.reduce(
  (total, arquivo) => total + gzipSync(readFileSync(join(build, arquivo))).length,
  0,
);
console.log(`JS no HTML inicial: ${bytes} bytes gzip em ${iniciais.length} arquivos`);

const servidor = await preview({
  root: 'web',
  preview: { host: '127.0.0.1', port: 0 },
  build: { outDir: build },
});
const achadosAxe = [];

async function verificarAxe(pagina, rotulo) {
  if (opcao !== '--axe') return;
  const { violations } = await new AxeBuilder({ page: pagina })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  for (const violacao of violations) {
    for (const no of violacao.nodes)
      achadosAxe.push(`${rotulo}: ${violacao.id} em ${no.target.join(' ')}`);
  }
}
try {
  const endereco = servidor.httpServer.address();
  assert.ok(endereco && typeof endereco === 'object');
  const origem = `http://127.0.0.1:${endereco.port}`;
  const navegador = await chromium.launch();
  try {
    for (const largura of [390, 1440]) {
      for (const [nome, fragmento, vista] of [
        ['seu-dia', '#home', '#home-view'],
        ['pessoas-acompanhadas', '#carteira', '#patients-title'],
        ['administracao', '#administracao/configuracao', '#administracao-conteudo'],
      ]) {
        const contexto = await navegador.newContext({
          viewport: { width: largura, height: largura === 390 ? 844 : 900 },
          serviceWorkers: 'block',
        });
        const pagina = await contexto.newPage();
        pagina.setDefaultTimeout(8000);
        pagina.on('pageerror', (erro) => console.error(erro));
        await pagina.addInitScript((id) => {
          sessionStorage.setItem('modo-acesso', 'tecnica');
          sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
          sessionStorage.setItem('sessao-tecnica', id);
        }, sessaoAdministrador.session_id);
        await pagina.route('**/*', (rota) => {
          const url = new URL(rota.request().url());
          if (url.origin !== origem) return rota.abort();
          if (!url.pathname.startsWith('/api/')) return rota.continue();
          const fixture = responder(url.href);
          return fixture
            ? rota.fulfill({ json: fixture })
            : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
        });
        await pagina.goto(`${origem}/${fragmento}`);
        await pagina.locator(vista).waitFor();
        if (nome === 'administracao')
          await pagina.locator('#administracao-conteudo:not([aria-busy="true"])').waitFor();
        await pagina.locator('#session-actions').waitFor();
        const folha = await pagina.evaluate(async () => {
          await document.fonts.ready;
          return Array.from(document.styleSheets).find(
            (item) => item.href?.includes('/assets/index-') && item.cssRules.length > 0,
          )?.href;
        });
        assert.ok(folha, 'A folha compilada deve estar aplicada antes de capturar.');
        const { posicao, display } = await pagina.locator('.topbar:visible').evaluate((barra) => {
          return {
            posicao: getComputedStyle(barra.closest('#casca-barra') ?? barra).position,
            display: getComputedStyle(barra).display,
          };
        });
        assert.ok(['flex', 'grid'].includes(display), `Barra sem estilo esperado: ${display}`);
        const cascaReact = (await pagina.locator('#titulo-casca').count()) === 1;
        if (cascaReact) {
          assert.equal(await pagina.locator('h1:visible').count(), 1);
          await pagina.waitForFunction(() => document.activeElement?.id === 'titulo-casca');
          const barra = await pagina.locator('.casca-topbar').boundingBox();
          assert.ok(barra && barra.height >= (largura === 390 ? 64 : 72));
          assert.equal(Math.round(barra.x), largura === 390 ? 0 : 240);
          assert.equal(posicao, 'sticky');
          if (largura === 1440) {
            const lateral = await pagina.locator('#patients-sidebar').boundingBox();
            assert.equal(lateral?.width, 240);
          }
        }
        await pagina.evaluate(() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        });
        await pagina.screenshot({
          path: join(destino, `${nome}-${largura}.png`),
          animations: 'disabled',
        });
        console.log(`${nome} ${largura}px: ${new URL(folha).pathname}, barra ${posicao}`);
        await verificarAxe(pagina, `${nome} ${largura}px`);
        if (cascaReact && nome === 'seu-dia' && largura === 390) {
          await pagina.getByRole('button', { name: 'Menu', exact: true }).click();
          const gaveta = await pagina.getByRole('dialog', { name: 'Menu' }).boundingBox();
          assert.equal(gaveta?.width, 358);
          await pagina.screenshot({
            path: join(destino, 'gaveta-390.png'),
            animations: 'disabled',
          });
          await verificarAxe(pagina, 'gaveta 390px');
        }
        await contexto.close();
      }
    }
  } finally {
    await navegador.close();
  }
} finally {
  await servidor.close();
}
if (opcao === '--axe') {
  console.log(achadosAxe.length === 0 ? 'axe: zero violações.' : achadosAxe.join('\n'));
  process.exitCode = achadosAxe.length === 0 ? 0 : 1;
}
