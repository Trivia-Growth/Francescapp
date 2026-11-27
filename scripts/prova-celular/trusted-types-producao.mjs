import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { responder } from '../../web/fixtures/despachante.ts';
import { pacientes, sessaoAdministrador } from '../../web/fixtures/sessao.ts';

const servidor = await preview({ root: 'web', preview: { host: '127.0.0.1', port: 0 } });
try {
  const endereco = servidor.httpServer.address();
  assert.ok(endereco && typeof endereco !== 'string');
  const origem = `http://127.0.0.1:${endereco.port}`;
  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage({ serviceWorkers: 'block' });
    const erros = [];
    pagina.on('pageerror', (erro) => erros.push(erro.message));
    await pagina.addInitScript((sessao) => {
      sessionStorage.setItem('modo-acesso', 'tecnica');
      sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
      sessionStorage.setItem('sessao-tecnica', sessao);
      window.violacoesDaProva = [];
      document.addEventListener('securitypolicyviolation', (evento) => {
        window.violacoesDaProva.push({
          diretiva: evento.effectiveDirective,
          amostra: evento.sample,
          fonte: evento.sourceFile,
          disposicao: evento.disposition,
        });
      });
    }, sessaoAdministrador.session_id);
    let pacienteInvalido = false;
    await pagina.route('**/*', async (rota) => {
      const url = new URL(rota.request().url());
      if (url.origin !== origem) return rota.abort();
      if (!url.pathname.startsWith('/api/')) return rota.continue();
      const fixture = responder(url.href);
      if (!fixture) return rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
      if (pacienteInvalido && url.pathname === '/api/pacientes') {
        return rota.fulfill({
          json: { ...fixture, dados: { itens: 'lista inválida', proximo_cursor: null } },
        });
      }
      return rota.fulfill({ json: fixture });
    });

    await pagina.goto(`${origem}/#carteira`);
    const csp = await pagina
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    assert.match(csp, /require-trusted-types-for 'script'/);
    assert.match(csp, /style-src 'self';/);
    await pagina.getByText(pacientes.itens[0].nome, { exact: true }).first().waitFor();
    const violacoes = await pagina.evaluate(() => window.violacoesDaProva);
    assert.ok(
      violacoes.some(
        ({ diretiva, amostra, fonte, disposicao }) =>
          diretiva === 'require-trusted-types-for' &&
          /^Function/.test(amostra) &&
          fonte.startsWith(`${origem}/assets/`) &&
          disposicao === 'enforce',
      ),
      JSON.stringify(violacoes),
    );

    pacienteInvalido = true;
    await pagina.reload();
    await pagina.getByText(/Use “Atualizar lista” para tentar novamente/).waitFor();
    assert.equal(await pagina.getByText(pacientes.itens[0].nome, { exact: true }).count(), 0);
    assert.deepEqual(erros, []);
    process.stdout.write(
      'Trusted Types em produção: Function bloqueada, carteira válida exibida e inválida recusada.\n',
    );
  } finally {
    await navegador.close();
  }
} finally {
  await servidor.close();
}
