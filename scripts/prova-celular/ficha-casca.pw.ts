import { expect, test } from '@playwright/test';
import { envelope, id } from '../../web/fixtures/comum.js';
import { responder } from '../../web/fixtures/despachante.js';
import { PACIENTE_IDS, sessaoAdministrador } from '../../web/fixtures/sessao.js';

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

test('documento continua baixando enquanto um novo anexo atualiza a lista', async ({ page }) => {
  await page.addInitScript((sessaoId) => {
    sessionStorage.setItem('modo-acesso', 'tecnica');
    sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
    sessionStorage.setItem('sessao-tecnica', sessaoId);
  }, sessaoAdministrador.session_id);
  const documento = {
    documento_id: id(18, 1),
    registro_id: id(18, 2),
    versao: 1,
    categoria: 'Laudo',
    audiencia: 'equipe',
    estado: 'disponivel',
    nome_visivel: 'origem-ficticia.pdf',
    drive_file_id: 'arquivo-ficticio',
  };
  const novo = {
    ...documento,
    documento_id: id(18, 3),
    registro_id: id(18, 4),
    nome_visivel: 'novo-ficticio.pdf',
  };
  const base = `/api/pacientes/${PACIENTE_IDS[0]}/documentos`;
  const arquivo = `${base}/${documento.documento_id}/arquivo`;
  let liberar = () => {};
  const esperaDownload = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  let liberarCategorias = () => {};
  const esperaCategorias = new Promise<void>((resolver) => {
    liberarCategorias = resolver;
  });
  await page.route('**/api/**', async (rota) => {
    const url = new URL(rota.request().url());
    if (url.pathname === '/api/documentos/disponibilidade') {
      await rota.fulfill({ json: envelope({ disponivel: true, categorias: ['Laudo'] }) });
      liberarCategorias();
      return;
    }
    if (url.pathname === base) {
      await esperaCategorias;
      return rota.fulfill({
        json: envelope({
          documentos: rota.request().method() === 'GET' ? [documento] : [documento, novo],
        }),
      });
    }
    if (url.pathname === arquivo) {
      await esperaDownload;
      return rota.fulfill({
        body: 'Arquivo fictício',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment; filename="origem-ficticia.pdf"',
        },
      });
    }
    const fixture = responder(url.href);
    return fixture
      ? rota.fulfill({ json: fixture })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  await page.goto(`/web/index.html#paciente/${PACIENTE_IDS[0]}/documentos`);
  const painel = page.locator('#ficha-painel');
  const baixar = painel.getByRole('button', { name: 'Baixar origem-ficticia.pdf' });
  const pedido = page.waitForRequest((req) => new URL(req.url()).pathname === arquivo);
  const download = page.waitForEvent('download');
  try {
    await baixar.click();
    await pedido;
    await painel.locator('#documento-arquivo').setInputFiles({
      name: 'novo-ficticio.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('Anexo fictício'),
    });
    await painel.locator('#documento-categoria').selectOption('Laudo');
    await painel.locator('#documento-audiencia').selectOption('equipe');
    await painel.getByRole('button', { name: 'Anexar', exact: true }).click();
    await expect(painel.getByText('novo-ficticio.pdf', { exact: true })).toBeVisible();
    await expect(baixar).toBeDisabled();
    await expect(painel.getByText('Preparando arquivo…')).toBeVisible();
  } finally {
    liberar();
  }
  expect((await download).suggestedFilename()).toBe('origem-ficticia.pdf');
  await expect(painel.getByText('Arquivo enviado ao navegador para download.')).toBeVisible();
});

for (const secao of ['anamnese', 'diario', 'documentos']) {
  test(`módulo antigo de ${secao} não substitui a seção que permaneceu aberta`, async ({
    page,
  }) => {
    await page.addInitScript((id) => {
      sessionStorage.setItem('modo-acesso', 'tecnica');
      sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
      sessionStorage.setItem('sessao-tecnica', id);
    }, sessaoAdministrador.session_id);
    let liberarModulo = () => {};
    const espera = new Promise<void>((resolver) => {
      liberarModulo = resolver;
    });
    const moduloDaSecao = secao === 'documentos' ? 'documentos-caso' : secao;
    await page.route(`**/web/${moduloDaSecao}.tsx`, async (rota) => {
      await espera;
      await rota.continue();
    });
    let leiturasDaSecao = 0;
    await page.route('**/api/**', (rota) => {
      if (new URL(rota.request().url()).pathname === `/api/pacientes/${PACIENTE_IDS[0]}/${secao}`)
        leiturasDaSecao += 1;
      const fixture = responder(rota.request().url());
      return fixture
        ? rota.fulfill({ json: fixture })
        : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
    });
    const modulo = page.waitForRequest(`**/web/${moduloDaSecao}.tsx`);
    await page.goto(`/web/index.html#paciente/${PACIENTE_IDS[0]}/${secao}`);
    const painel = page.locator('#ficha-painel');
    try {
      await modulo;
      await expect(painel.locator(`[data-secao="${secao}"]`)).toHaveAttribute('aria-busy', 'true');
      await page.locator('#ficha-aba-plano').click();
      await expect(painel.locator('.ficha-secao')).toHaveAttribute('data-secao', 'plano');
    } finally {
      liberarModulo();
    }
    await page.evaluate(async (caminho) => {
      await import(caminho);
      await new Promise(requestAnimationFrame);
    }, `/web/${moduloDaSecao}.tsx`);
    await expect(painel.locator('.ficha-secao')).toHaveCount(1);
    await expect(painel.locator('.ficha-secao')).toHaveAttribute('data-secao', 'plano');
    await expect(page.locator('#ficha-aba-plano')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeVisible();
    expect(leiturasDaSecao).toBe(0);
  });
}

test('primeira renderização da ficha pode ser recuperada pelo mesmo link', async ({ page }) => {
  await page.addInitScript((id) => {
    sessionStorage.setItem('modo-acesso', 'tecnica');
    sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
    sessionStorage.setItem('sessao-tecnica', id);
  }, sessaoAdministrador.session_id);
  await page.route('**/web/ficha.tsx', (rota) =>
    rota.fulfill({
      contentType: 'application/javascript',
      body: `export const secaoInicialDaFicha = () => undefined;
        export function TelaFicha() {
          if (!window.fichaRecuperada) throw new Error('Falha fictícia ao desenhar a ficha');
          return 'Ficha fictícia recuperada';
        }`,
    }),
  );
  await page.route('**/api/**', (rota) => {
    const fixture = responder(rota.request().url());
    return fixture
      ? rota.fulfill({ json: fixture })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  await page.goto(`/web/index.html#paciente/${PACIENTE_IDS[0]}/visao`);
  await expect(page.getByText('Tente abrir a área de novo.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeVisible();
  await page.evaluate(() => Reflect.set(window, 'fichaRecuperada', true));
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByText('Ficha fictícia recuperada')).toBeVisible();
});

for (const permiteCadastro of [true, false]) {
  test(`link antigo do Cadastro respeita a capacidade (${permiteCadastro})`, async ({ page }) => {
    await page.addInitScript((id) => {
      sessionStorage.setItem('modo-acesso', 'tecnica');
      sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
      sessionStorage.setItem('sessao-tecnica', id);
    }, sessaoAdministrador.session_id);
    const consultasDosContatos: string[] = [];
    await page.route('**/api/**', (rota) => {
      const { pathname } = new URL(rota.request().url());
      if (pathname === '/api/contatos/barreira') consultasDosContatos.push(pathname);
      if (pathname === '/api/sessao' && !permiteCadastro)
        return rota.fulfill({
          json: envelope({
            ...sessaoAdministrador,
            capacidades: sessaoAdministrador.capacidades.filter(
              (capacidade) => capacidade !== 'administrar_cadastro',
            ),
          }),
        });
      if (pathname === `/api/pacientes/${PACIENTE_IDS[0]}`)
        return rota.fulfill({
          json: envelope({
            id: PACIENTE_IDS[0],
            nome: 'Paciente fictício',
            nome_preferencia: null,
            data_nascimento: null,
            versao: 1,
            contatos: [],
            acompanhamento: [],
          }),
        });
      const fixture = responder(rota.request().url());
      return fixture
        ? rota.fulfill({ json: fixture })
        : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
    });
    await page.goto(`/web/index.html#paciente/${PACIENTE_IDS[0]}/cadastro`);
    const painel = page.locator('#ficha-painel');
    if (permiteCadastro) {
      await expect(painel.getByText('Confira o cadastro para começar a editar.')).toBeVisible();
      await expect(painel.getByRole('heading', { name: 'Contatos cadastrados' })).toBeVisible();
      await expect(painel.getByRole('button', { name: 'Adicionar contato' })).toBeEnabled();
      expect(consultasDosContatos).toHaveLength(2);
    } else {
      await expect(painel.locator('.ficha-secao')).toHaveAttribute('data-secao', 'visao');
      await expect(page.locator('#ficha-aba-cadastro')).toHaveCount(0);
      expect(consultasDosContatos).toEqual([]);
    }
  });
}

test('Tarefas abre em leitura quando o servidor recusa escrita', async ({ page }) => {
  await page.addInitScript((id) => {
    sessionStorage.setItem('modo-acesso', 'tecnica');
    sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
    sessionStorage.setItem('sessao-tecnica', id);
  }, sessaoAdministrador.session_id);
  const tarefas = `/api/pacientes/${PACIENTE_IDS[0]}/tarefas`;
  await page.route('**/api/**', (rota) => {
    const url = new URL(rota.request().url());
    if (url.pathname === '/api/sessao')
      return rota.fulfill({
        json: envelope({
          ...sessaoAdministrador,
          usuario: { ...sessaoAdministrador.usuario, perfil: 'profissional' },
          capacidades: [],
        }),
      });
    if (url.pathname === `${tarefas}/disponibilidade`)
      return rota.fulfill({ json: envelope({ escrita_disponivel: false }) });
    if (url.pathname === tarefas) return rota.fulfill({ json: envelope([]) });
    const fixture = responder(url.href);
    return fixture
      ? rota.fulfill({ json: fixture })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  await page.goto(`/web/index.html#paciente/${PACIENTE_IDS[0]}/tarefas`);
  const painel = page.locator('#ficha-painel');
  await expect(
    painel.getByText('Criação e edição de tarefas indisponíveis neste caso.'),
  ).toBeVisible();
  await expect(painel.getByText('Nenhuma tarefa encontrada para este paciente.')).toBeVisible();
  await expect(painel.getByText('Nova tarefa')).toHaveCount(0);
  await page.locator('#ficha-aba-plano').click();
  await expect(painel.locator('.ficha-secao')).toHaveAttribute('data-secao', 'plano');
});
