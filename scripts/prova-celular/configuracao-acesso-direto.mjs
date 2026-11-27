import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
import { responder } from '../../web/fixtures/despachante.ts';
import { sessaoAdministrador } from '../../web/fixtures/sessao.ts';

/* Prova de navegador, com o build de produção, do acesso DIRETO a `#administracao/configuracao`
 * (link salvo, recarga da página). A área é carregada por importação dinâmica: o módulo da tela
 * e o do serviço HTTP descem sob demanda.
 *
 * Cenário 1: o acesso direto monta a tela.
 * Cenário 2: o chunk do serviço falha ao baixar (rede caiu). A casca não pode travar em
 *   `aria-busy` nem ficar muda: precisa avisar e continuar navegável (outra área abre).
 *
 * Dublê HTTP; nada sai para a rede. Dados fictícios. */
const servidor = await preview({ root: 'web', preview: { host: '127.0.0.1', port: 0 } });
try {
  const endereco = servidor.httpServer.address();
  assert.ok(endereco && typeof endereco !== 'string');
  const origem = `http://127.0.0.1:${endereco.port}`;
  const navegador = await chromium.launch();
  try {
    const abrir = async (falharChunk) => {
      const pagina = await navegador.newPage({ serviceWorkers: 'block' });
      pagina.setDefaultTimeout(8000);
      await pagina.addInitScript((id) => {
        sessionStorage.setItem('modo-acesso', 'tecnica');
        sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
        sessionStorage.setItem('sessao-tecnica', id);
      }, sessaoAdministrador.session_id);
      await pagina.route('**/*', (rota) => {
        const url = new URL(rota.request().url());
        if (url.origin !== origem) return rota.abort();
        if (falharChunk && /\/assets\/servico-configuracao-sistema-http-/.test(url.pathname))
          return rota.abort();
        if (!url.pathname.startsWith('/api/')) return rota.continue();
        if (url.pathname === '/api/admin/configuracao-sistema')
          return rota.fulfill({ json: { dados: [], request_id: sessaoAdministrador.session_id } });
        const fixture = responder(url.href);
        return fixture
          ? rota.fulfill({ json: fixture })
          : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
      });
      return pagina;
    };

    const normal = await abrir(false);
    await normal.goto(`${origem}/#administracao/configuracao`);
    await expect(normal.getByText('Configuração do sistema', { exact: true })).toBeVisible();
    await expect(normal.locator('#administracao-conteudo')).not.toHaveAttribute(
      'aria-busy',
      'true',
    );
    await normal.close();

    const comFalha = await abrir(true);
    await comFalha.goto(`${origem}/#administracao/configuracao`);
    await expect(comFalha.locator('#workspace-feedback')).toContainText(
      'Tente abrir a área de novo',
    );
    await expect(comFalha.locator('#administracao-conteudo')).not.toHaveAttribute(
      'aria-busy',
      'true',
    );
    // A casca segue viva: outra área da Administração abre normalmente.
    await comFalha
      .locator('a[href="#administracao/equipe"], a[href="#administracao/regras"]')
      .first()
      .click();
    await expect(comFalha.locator('#administracao-conteudo')).not.toBeEmpty();
    await comFalha.close();
    console.log('Acesso direto a Configuração passou: normal e com falha de import.');
  } finally {
    await navegador.close();
  }
} finally {
  await servidor.close();
}
