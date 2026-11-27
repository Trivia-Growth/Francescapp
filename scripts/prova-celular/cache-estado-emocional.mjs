import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mensagensErro } from '../../packages/contracts/src/erros.ts';
import { responder } from '../../web/fixtures/despachante.ts';
import { sessaoAdministrador } from '../../web/fixtures/sessao.ts';

/* Prova de navegador do piloto do cache de leituras (fatia 6 do plano visual), contra o
 * build de produção e a casca real. Dublê HTTP, dados fictícios; nada sai para a rede.
 * Uso: node --experimental-strip-types scripts/prova-celular/cache-estado-emocional.mjs <pasta-do-web> <pasta-das-capturas>
 *
 * Confere, nesta ordem:
 * 1. 5 voltas (Auditoria → Estado emocional) fazem 0 GET ao catálogo além do da entrada,
 *    e cada volta mostra a lista já desenhada, com o foco no título da Administração;
 * 2. Atualizar fica `aria-disabled` e com o foco durante a consulta, e cliques repetidos
 *    não abrem um segundo GET;
 * 3. 403 ao atualizar esvazia a tela, e a volta seguinte relê em vez de mostrar o guardado.
 * Sai com código 1 na primeira conferência que falhar. */
const [raizWeb = 'web', saida = 'output/cache-estado-emocional'] = process.argv.slice(2);
mkdirSync(saida, { recursive: true });
const CATALOGO = '/api/admin/estado-emocional';
const servidor = await preview({ root: raizWeb, preview: { host: '127.0.0.1', port: 0 } });
try {
  const endereco = servidor.httpServer.address();
  assert.ok(endereco && typeof endereco !== 'string');
  const origem = `http://127.0.0.1:${endereco.port}`;
  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage({ serviceWorkers: 'block' });
    pagina.setDefaultTimeout(8000);
    const errosDePagina = [];
    pagina.on('pageerror', (erro) => errosDePagina.push(String(erro)));
    await pagina.addInitScript((id) => {
      sessionStorage.setItem('modo-acesso', 'tecnica');
      sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
      sessionStorage.setItem('sessao-tecnica', id);
    }, sessaoAdministrador.session_id);
    let gets = 0;
    /** Próxima resposta do catálogo: atraso em ms ou recusa. */
    let proxima = { atraso: 0, recusar: false };
    await pagina.route('**/*', async (rota) => {
      const pedido = rota.request();
      const url = new URL(pedido.url());
      if (url.origin !== origem) return rota.abort();
      if (!url.pathname.startsWith('/api/')) return rota.continue();
      if (url.pathname === CATALOGO && pedido.method() === 'GET') {
        gets += 1;
        const { atraso, recusar } = proxima;
        proxima = { atraso: 0, recusar: false };
        if (atraso) await new Promise((r) => setTimeout(r, atraso));
        if (recusar)
          return rota.fulfill({
            status: 403,
            json: {
              erro: { codigo: 'sem_permissao', mensagem: mensagensErro.sem_permissao },
              request_id: sessaoAdministrador.session_id,
            },
          });
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
    const termos = conteudo.locator('details summary');
    const atualizar = pagina.getByRole('button', { name: 'Atualizar catálogo de termos' });

    await pagina.goto(`${origem}/#administracao/estado-emocional`);
    await pronto();
    await termos.first().waitFor();
    await pagina.waitForTimeout(300);
    assert.equal(gets, 1, 'entrada fria: 1 GET');
    const listaInicial = await termos.allTextContents();
    await pagina.setViewportSize({ width: 390, height: 844 });
    await pagina.waitForTimeout(400);
    await pagina.screenshot({ path: `${saida}/estado-emocional-390.png`, fullPage: true });
    await pagina.setViewportSize({ width: 1440, height: 900 });
    await pagina.waitForTimeout(400);
    await pagina.screenshot({ path: `${saida}/estado-emocional-1440.png`, fullPage: true });

    const porVolta = [];
    for (let volta = 0; volta < 5; volta += 1) {
      await ir('auditoria');
      const antes = gets;
      await ir('estado-emocional');
      // Logo após o fim do `aria-busy`, sem esperar resposta nenhuma: a lista já está lá.
      assert.deepEqual(await termos.allTextContents(), listaInicial, `volta ${volta + 1}: lista`);
      await pagina.waitForTimeout(300);
      porVolta.push(gets - antes);
      const foco = await pagina.evaluate(() => document.activeElement?.id ?? '');
      assert.equal(foco, 'titulo-casca', `volta ${volta + 1}: foco`);
    }
    console.log(`GETs ao catálogo: entrada=1; por volta=${porVolta.join(',')}`);
    assert.deepEqual(porVolta, [0, 0, 0, 0, 0], '5 voltas sem GET');

    proxima = { atraso: 1500, recusar: false };
    const antesAtualizar = gets;
    await atualizar.focus();
    await atualizar.click();
    assert.equal(await atualizar.getAttribute('aria-disabled'), 'true', 'Atualizar desabilitado');
    assert.equal(
      await pagina.evaluate(() => document.activeElement?.textContent),
      'Atualizar catálogo de termos',
      'foco continua no Atualizar',
    );
    await atualizar.click({ force: true });
    await pagina.keyboard.press('Enter');
    await pagina.waitForFunction(() =>
      document
        .querySelector('#administracao-conteudo [role="status"]')
        ?.textContent?.includes('Catálogo de termos atualizado'),
    );
    assert.equal(gets - antesAtualizar, 1, 'cliques repetidos durante a consulta: 1 GET');
    assert.equal(await atualizar.getAttribute('aria-disabled'), 'false', 'Atualizar reabilitado');
    console.log(
      'Atualizar: aria-disabled durante a consulta, foco mantido, 1 GET para 3 acionamentos',
    );

    proxima = { atraso: 0, recusar: true };
    await atualizar.click();
    await pagina.waitForFunction(
      () => !document.querySelector('#administracao-conteudo')?.textContent?.includes('agitado'),
    );
    await ir('auditoria');
    const antesRecusa = gets;
    await ir('estado-emocional');
    await termos.first().waitFor();
    assert.equal(gets - antesRecusa, 1, 'após 403 a volta relê');
    console.log('403 ao atualizar: tela esvaziada; a volta seguinte fez 1 GET (nada guardado)');

    assert.deepEqual(errosDePagina, [], 'sem erro de página');
    console.log('OK');
  } finally {
    await navegador.close();
  }
} finally {
  await servidor.close();
}
