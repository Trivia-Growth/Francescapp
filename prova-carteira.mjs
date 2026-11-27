import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { responder } from './web/fixtures/despachante.ts';
import { sessaoAdministrador } from './web/fixtures/sessao.ts';

const pasta = process.argv[2];
mkdirSync(pasta, { recursive: true });
const servidor = await createServer({
  root: resolve('web'),
  configFile: resolve('web/vite.config.ts'),
  server: { host: '127.0.0.1', port: 0 },
});
await servidor.listen();
const origem = `http://127.0.0.1:${servidor.httpServer.address().port}`;
const navegador = await chromium.launch();
const falhas = [];
try {
  for (const width of [390, 320]) {
    const contexto = await navegador.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
    try {
      const page = await contexto.newPage();
      await page.addInitScript((id) => {
        sessionStorage.setItem('modo-acesso', 'tecnica');
        sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
        sessionStorage.setItem('sessao-tecnica', id);
      }, sessaoAdministrador.session_id);
      await page.route('**/*', (rota) => {
        const url = new URL(rota.request().url());
        if (url.origin !== origem) return rota.abort();
        if (!url.pathname.startsWith('/api/')) return rota.continue();
        const resposta = responder(url.href);
        return resposta
          ? rota.fulfill({ json: resposta })
          : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
      });
      await page.goto(`${origem}/#carteira`);
      const carteira = page.locator('#patients-body');
      const motivo = 'Sem registro há 14 dias. · Tarefa de cuidado vencida.';
      await expect(carteira.getByText('Ângela Souza Ficcional')).toBeVisible();
      const textos = carteira.getByText(motivo, { exact: true });
      assert.ok(await textos.count(), 'fixture do motivo FR-028 ausente');
      const alvo = textos.first();
      await page.evaluate(() => document.fonts.ready);
      const medidas = await alvo.evaluate((no) => {
        const registro = no.closest('li') ?? no.closest('button') ?? no.parentElement;
        const range = document.createRange();
        range.selectNodeContents(no);
        const limites = [registro.getBoundingClientRect(), {left: 0, right: innerWidth}];
        for (let pai = no; pai; pai = pai.parentElement) {
          if (getComputedStyle(pai).overflowX !== 'visible') limites.push(pai.getBoundingClientRect());
        }
        const retangulos = [...range.getClientRects()].filter((r) => r.width > 0);
        return {
          linhas: new Set(retangulos.map((r) => r.top)).size,
          motivosInteiros: retangulos.every((r) => limites.every((limite) => r.left >= limite.left - 1 && r.right <= limite.right + 1)),
          reticencias: getComputedStyle(no).textOverflow === 'ellipsis',
          documento: document.documentElement.scrollWidth,
          larguraVisivel: document.documentElement.clientWidth,
          bordaLinha: getComputedStyle(registro).borderTopStyle,
        };
      });
      await page.screenshot({ path: `${pasta}/carteira-${width}.png`, fullPage: true, animations: 'disabled' });
      const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
      const axe = await new AxeBuilder({ page }).withTags(tags).analyze();
      const axeSinais = await new AxeBuilder({ page }).include('#patients-body .sinal-carteira').withTags(tags).analyze();
      const violacoes = axe.violations.map(({id,nodes}) => ({id, alvos: nodes.map(n => n.target)}));
      console.log(JSON.stringify({width, ...medidas, violacoes, violacoesSinais: axeSinais.violations.map(({ id }) => id)}));
      if (!medidas.motivosInteiros || medidas.linhas < 2 || medidas.reticencias)
        falhas.push(`${width}px: motivo FR-028 deve quebrar e caber por inteiro na linha`);
      if (medidas.documento !== medidas.larguraVisivel) falhas.push(`${width}px: rolagem horizontal`);
      if (axeSinais.violations.length) falhas.push(`${width}px: violações axe no sinal operacional`);
    } finally {
      await contexto.close();
    }
  }
} finally {
  await navegador.close();
  await servidor.close();
}
assert.deepEqual(falhas, []);
