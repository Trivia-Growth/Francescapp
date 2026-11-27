import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { responder } from '../../web/fixtures/despachante.ts';
import { sessaoAdministrador } from '../../web/fixtures/sessao.ts';

/* Medição de base (fatia 0 do plano visual): GETs de `/api/**` por volta no catálogo
 * "Estado emocional" e em "Equipe", e capturas a 390 e 1440 px, com o build de produção.
 * Uso: node --experimental-strip-types scripts/prova-celular/medicao-base.mjs <pasta-do-web> <pasta-das-capturas>
 * Volta = sair para outra área da Administração e retornar; conta-se só a volta de retorno.
 * Dublê HTTP, dados fictícios; nada sai para a rede. */
const [raizWeb = 'web', saida = 'output/medicao'] = process.argv.slice(2);
mkdirSync(saida, { recursive: true });
const VOLTAS = 5;
const servidor = await preview({ root: raizWeb, preview: { host: '127.0.0.1', port: 0 } });
try {
  const endereco = servidor.httpServer.address();
  assert.ok(endereco && typeof endereco !== 'string');
  const origem = `http://127.0.0.1:${endereco.port}`;
  const navegador = await chromium.launch();
  try {
    for (const area of ['estado-emocional', 'equipe']) {
      const pagina = await navegador.newPage({ serviceWorkers: 'block' });
      pagina.setDefaultTimeout(8000);
      let gets = [];
      await pagina.addInitScript((id) => {
        sessionStorage.setItem('modo-acesso', 'tecnica');
        sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
        sessionStorage.setItem('sessao-tecnica', id);
      }, sessaoAdministrador.session_id);
      await pagina.route('**/*', (rota) => {
        const pedido = rota.request();
        const url = new URL(pedido.url());
        if (url.origin !== origem) return rota.abort();
        if (!url.pathname.startsWith('/api/')) return rota.continue();
        if (pedido.method() === 'GET') gets.push(url.pathname);
        const fixture = responder(url.href);
        return fixture
          ? rota.fulfill({ json: fixture })
          : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
      });
      const pronto = () =>
        pagina.locator('#administracao-conteudo:not([aria-busy="true"])').waitFor();
      await pagina.goto(`${origem}/#administracao/${area}`);
      await pronto();
      await pagina.waitForTimeout(300);
      const entrada = gets.length;
      const voltas = [];
      for (let i = 0; i < VOLTAS; i++) {
        await pagina.evaluate(() => {
          window.location.hash = '#administracao/auditoria';
        });
        await pronto();
        await pagina.waitForTimeout(200);
        gets = [];
        await pagina.evaluate((a) => {
          window.location.hash = `#administracao/${a}`;
        }, area);
        await pronto();
        await pagina.waitForTimeout(300);
        voltas.push(gets.length);
        if (i === VOLTAS - 1) console.log(`  GETs da última volta (${area}): ${gets.join(', ')}`);
      }
      console.log(`${area}: GETs na entrada fria=${entrada}; por volta=${voltas.join(',')}`);
      for (const largura of [390, 1440]) {
        await pagina.setViewportSize({ width: largura, height: largura === 390 ? 844 : 900 });
        await pagina.waitForTimeout(150);
        await pagina.screenshot({ path: `${saida}/${area}-${largura}.png`, fullPage: true });
      }
      await pagina.close();
    }
  } finally {
    await navegador.close();
  }
} finally {
  await servidor.close();
}
