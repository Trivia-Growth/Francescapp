import { resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { criarErroPublico } from '../../packages/contracts/src/comum.js';
import { avisoSinalOperacional } from '../../packages/contracts/src/pendencia.js';
import { envelope } from '../../web/fixtures/comum.js';
import { responder } from '../../web/fixtures/despachante.js';
import { PACIENTE_IDS, pacientes, sessaoAdministrador } from '../../web/fixtures/sessao.js';
import { conferirAxe } from './axe.js';

let servidor: ViteDevServer | undefined;
let origem: string;

test.use({
  viewport: { width: 320, height: 844 },
  serviceWorkers: 'block',
  reducedMotion: 'reduce',
});

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

async function preparar(pagina: Page, perfil: 'profissional' | 'familia', falharUmaVez = false) {
  const modo = perfil === 'familia' ? 'familiar' : 'tecnica';
  await pagina.addInitScript(
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
  const consultadas: string[] = [];
  let falhaPendente = falharUmaVez;
  await pagina.route('**/*', (rota) => {
    const url = new URL(rota.request().url());
    if (url.origin !== origem) return rota.abort();
    if (!url.pathname.startsWith('/api/')) return rota.continue();
    consultadas.push(url.pathname + url.search);

    if (['/api/sessao', '/api/familiar/sessao'].includes(url.pathname))
      return rota.fulfill({
        json: envelope({
          ...sessaoAdministrador,
          usuario: { ...sessaoAdministrador.usuario, perfil },
          capacidades: [],
        }),
      });
    if (url.pathname === '/api/familiar/pacientes')
      return rota.fulfill({ json: envelope({ itens: [], proximo_cursor: null }) });
    if (
      url.pathname === '/api/pacientes' &&
      url.searchParams.get('filtro_pendencia') === 'abertas'
    ) {
      if (falhaPendente) {
        falhaPendente = false;
        return rota.fulfill({
          status: 503,
          json: criarErroPublico('servico_indisponivel', PACIENTE_IDS[0]),
        });
      }
      const itens = pacientes.itens.filter(
        (paciente) => paciente.sinal.estado === 'atencao_operacional',
      );
      const extra = itens[1];
      return rota.fulfill({
        json: envelope({
          itens: [itens[0], { ...extra, nome: 'NomeFicticioSemEspacos'.repeat(5) }],
          proximo_cursor: null,
        }),
      });
    }
    if (url.pathname === `/api/pacientes/${PACIENTE_IDS[0]}`)
      return rota.fulfill({
        json: envelope({ ...pacientes.itens[0], data_nascimento: null, contatos: [] }),
      });
    if (url.pathname === `/api/pacientes/${PACIENTE_IDS[0]}/pendencias`)
      return rota.fulfill({ json: envelope({ itens: [] }) });
    const resposta = responder(url.href);
    return resposta
      ? rota.fulfill({ json: resposta })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  return consultadas;
}

test('Seu dia usa a lista do Sistema e cabe a 320 px com nomes e motivos completos', async ({
  page,
}) => {
  await preparar(page, 'profissional');
  await page.goto(`${origem}/#home`);
  const home = page.locator('#home-view');
  await expect(home.getByRole('heading', { name: '2 casos precisam de você' })).toBeVisible();
  const lista = home.getByRole('list', { name: 'Casos que precisam de atenção' });
  await expect(lista.getByRole('link')).toHaveCount(2);
  await expect(lista.getByRole('link', { name: /NomeFicticioSemEspacos/ })).toContainText(
    'NomeFicticioSemEspacos'.repeat(5),
  );
  await expect(home.getByText(avisoSinalOperacional, { exact: true })).toBeVisible();
  await expect(home.getByRole('list', { name: 'Casos sem periodicidade acordada' })).toContainText(
    'Cacá',
  );
  const carteira = home.getByRole('link', { name: 'Ver a lista completa' });
  await expect(carteira).toHaveCSS('border-radius', '999px');
  await expect(carteira).toHaveCSS('min-height', '46px');

  const medidas = await home.evaluate((no) => ({
    largura: no.clientWidth,
    conteudo: no.scrollWidth,
    documento: document.documentElement.scrollWidth,
    janela: document.documentElement.clientWidth,
  }));
  expect(medidas.conteudo).toBe(medidas.largura);
  expect(medidas.documento).toBe(medidas.janela);
  await expect(
    home.locator('[class~="home"], [class^="home-"], [class*=" home-"], .list-loading'),
  ).toHaveCount(0);
  const axe = await conferirAxe(page, 'Seu dia do profissional — lista a 320 px');
  expect(axe.toleradas).toEqual([]);

  const primeiro = lista.getByRole('link', { name: /^Gela/ });
  await expect(primeiro).toHaveAttribute('href', `#paciente/${PACIENTE_IDS[0]}/pendencias`);
  await expect(primeiro).toContainText('Tarefa de cuidado vencida.');
  await primeiro.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(primeiro).toBeFocused();
  await expect(primeiro).toHaveCSS('outline-width', '2px');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`#paciente/${PACIENTE_IDS[0]}/pendencias$`));
  await expect(page.locator('#ficha-title')).toBeVisible();
  await page.goBack();
  await expect(carteira).toBeVisible();
  await carteira.click();
  await expect(page.locator('#patients-title')).toBeVisible();
});

test('a leitura que falha mantém a outra e pode ser refeita', async ({ page }) => {
  await preparar(page, 'profissional', true);
  await page.goto(`${origem}/#home`);
  const home = page.locator('#home-view');
  await expect(home.getByRole('alert')).toContainText('Esta leitura não foi carregada.');
  await expect(home.getByRole('heading', { name: 'Esperando combinar' })).toBeVisible();
  await expect(home.getByText(/Você acompanha mais de 5 pessoas/)).toBeVisible();
  const tentar = home.getByRole('button', { name: 'Tentar novamente' });
  await expect(tentar).toHaveCSS('border-radius', '999px');
  const axe = await conferirAxe(page, 'Seu dia do profissional — erro a 320 px');
  expect(axe.toleradas).toEqual([]);
  await tentar.click();
  await expect(home.getByRole('heading', { name: '2 casos precisam de você' })).toBeVisible();
  await expect(home.getByRole('alert')).toHaveCount(0);
});

test('Família não abre o Seu dia do profissional nem consulta seu resumo', async ({ page }) => {
  const consultadas = await preparar(page, 'familia');
  await page.goto(`${origem}/#home`);
  await expect(page.locator('#patients-title')).toBeVisible();
  await expect(page.locator('#home-view')).toBeHidden();
  expect(consultadas.some((rota) => /^\/api\/pacientes(?:\?|$)/.test(rota))).toBe(false);
});

for (const largura of [390, 1440]) {
  test(`títulos em NFC e circunflexos proporcionais a ${largura} px`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await preparar(page, 'profissional');
    await page.goto(`${origem}/#home`);
    const titulo = page.locator('#home-saudacao');
    await expect(titulo).toContainText('2 casos precisam de');
    const texto = (await titulo.textContent()) ?? '';
    expect(texto, 'texto do título em NFC').toBe(texto.normalize('NFC'));
    expect(texto).toBe('2 casos precisam de você');

    const titulos = page.locator(
      '#titulo-casca, #home-saudacao, [data-bloco="Precisa de você agora"] > :is(h2, h3)',
    );
    await expect(titulos).toHaveCount(3);
    const resultados = await titulos.evaluateAll(async (nos) => {
      await document.fonts.ready;
      const escala = 3;
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 200;
      const contexto = canvas.getContext('2d');
      if (!contexto) throw new Error('Canvas indisponível.');

      const medir = (texto: string, ate: number) => {
        contexto.clearRect(0, 0, canvas.width, canvas.height);
        contexto.fillText(texto, 12, 180);
        const tinta = contexto.getImageData(0, 0, canvas.width, ate).data;
        let esquerda = canvas.width;
        let direita = -1;
        let topo = ate;
        let fim = -1;

        for (let y = 0; y < ate; y++) {
          for (let x = 0; x < canvas.width; x++) {
            if (tinta[(y * canvas.width + x) * 4 + 3] <= 127) continue;
            esquerda = Math.min(esquerda, x);
            direita = Math.max(direita, x);
            topo = Math.min(topo, y);
            fim = Math.max(fim, y);
          }
        }
        return { topo, fim, centro: (esquerda + direita) / 2, largura: direita - esquerda + 1 };
      };

      return nos.map((no) => {
        const { fontFamily, fontWeight, fontSize } = getComputedStyle(no);
        const tamanho = Number.parseFloat(fontSize);
        contexto.font = `${fontWeight} ${tamanho * escala}px ${fontFamily}`;
        return {
          titulo: no.textContent,
          face: fontFamily,
          tamanho,
          peso: fontWeight,
          circunflexos: [
            ['a', 'â'],
            ['e', 'ê'],
            ['o', 'ô'],
          ].map(([base, letra]) => {
            const corpo = medir(base, canvas.height);
            const acento = medir(letra, corpo.topo);
            return {
              letra,
              altura: acento.fim - acento.topo + 1,
              largura: acento.largura,
              intervalo: (corpo.topo - acento.fim - 1) / escala,
              desalinhamento: Math.abs(acento.centro - corpo.centro) / escala,
            };
          }),
        };
      });
    });

    for (const { titulo, face, tamanho, peso, circunflexos } of resultados) {
      expect(face).toContain('Cormorant Garamond');
      for (const { letra, altura, largura, intervalo, desalinhamento } of circunflexos) {
        const amostra = `${titulo}, ${letra} em ${tamanho} px, peso ${peso}`;
        expect(altura, amostra).toBeGreaterThan(0);
        expect.soft(largura, `forma do circunflexo em ${amostra}`).toBeGreaterThanOrEqual(altura);
        expect.soft(intervalo, `distância do circunflexo em ${amostra}`).toBeLessThanOrEqual(1.4);
        expect.soft(desalinhamento, `centro do circunflexo em ${amostra}`).toBeLessThanOrEqual(1);
      }
    }
  });
}

test('título da casca mantém o foco e mostra contorno após navegação por teclado', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await preparar(page, 'profissional');
  await page.goto(`${origem}/#home`);
  const titulo = page.locator('#titulo-casca');
  await expect(titulo).toBeFocused();
  await expect(titulo).toHaveCSS('outline-style', 'none');

  const carteira = page.getByRole('link', { name: 'Pessoas acompanhadas', exact: true });
  await carteira.press('Enter');
  await expect(titulo).toHaveText('Pessoas acompanhadas');
  await expect(titulo).toBeFocused();
  await expect(titulo).toHaveCSS('outline-style', 'solid');
  await expect(titulo).toHaveCSS('outline-width', '2px');

  await page.getByRole('link', { name: 'Seu dia', exact: true }).click();
  await expect(titulo).toHaveText('Seu dia');
  await expect(titulo).toBeFocused();
  await expect(titulo).toHaveCSS('outline-style', 'none');
});
