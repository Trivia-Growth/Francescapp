import { resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import type { RegistroDiario } from '../../packages/contracts/src/diario.js';
import { envelope, id } from '../../web/fixtures/comum.js';
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

const caso = PACIENTE_IDS[0];
const caminhoDiario = `/api/pacientes/${caso}/diario`;
const texto = `Registro fictício de acompanhamento.\n${'IdentificadorSemEspacos'.repeat(12)}`;
const registro: RegistroDiario = {
  diario_registro_id: id(20, 1),
  registro_id: id(21, 1),
  versao: 1,
  tipo: 'evolucao_profissional',
  autor_usuario_id: sessaoAdministrador.usuario.id,
  estado: 'publicado',
  audiencia: 'equipe',
  atencao: false,
  retorno_solicitado: false,
  origem_conteudo: 'texto',
  responde_registro_id: null,
  tarefa_id: null,
  criado_em: '2026-11-18T12:00:00Z',
  consultas: 0,
  conteudo: { data: '2026-11-18', area: 'Cuidado', atividade: texto },
};

async function preparar(pagina: Page, perfil: 'profissional' | 'familia') {
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
  const caminhoPaciente = modo === 'familiar' ? '/api/familiar/pacientes' : '/api/pacientes';
  await pagina.route('**/*', (rota) => {
    const { origin, pathname } = new URL(rota.request().url());
    if (origin !== origem) return rota.abort();
    if (!pathname.startsWith('/api/')) return rota.continue();
    if (['/api/sessao', '/api/familiar/sessao'].includes(pathname))
      return rota.fulfill({
        json: envelope({
          ...sessaoAdministrador,
          usuario: { ...sessaoAdministrador.usuario, perfil },
          capacidades: [],
        }),
      });
    if (pathname === `${caminhoPaciente}/${caso}`)
      return rota.fulfill({
        json: envelope({ ...pacientes.itens[0], data_nascimento: null, contatos: [] }),
      });
    if (pathname === '/api/familiar/pacientes') return rota.fulfill({ json: envelope(pacientes) });
    if (pathname === '/api/diario/disponibilidade')
      return rota.fulfill({ json: envelope({ disponivel: true, areas: [] }) });
    if (pathname === caminhoDiario) {
      const dados = perfil === 'profissional' ? [registro] : [];
      return rota.fulfill({
        json: rota.request().method() === 'POST' ? envelope(registro) : envelope(dados),
      });
    }
    const resposta = responder(rota.request().url());
    return resposta
      ? rota.fulfill({ json: resposta })
      : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  await pagina.goto(`${origem}/#paciente/${caso}/diario`);
}

test('Diário exibe prosa inteira a 320 px e publica a data e a audiência visíveis', async ({
  page,
}) => {
  await preparar(page, 'profissional');
  const diario = page.locator('[data-secao=diario]');
  const registroPublicado = diario.getByRole('article');
  await expect(registroPublicado.getByText('Publicado', { exact: true })).toHaveCSS(
    'border-radius',
    '999px',
  );
  const atividadePublicada = registroPublicado.getByText('Registro fictício de acompanhamento.', {
    exact: false,
  });
  expect(await atividadePublicada.textContent()).toBe(texto);
  await expect(atividadePublicada).toHaveCSS('white-space', 'pre-wrap');

  for (const regiao of [page.locator('html'), diario, registroPublicado, atividadePublicada]) {
    const largura = await regiao.evaluate((no) => ({
      visivel: no.clientWidth,
      conteudo: no.scrollWidth,
    }));
    expect(largura.conteudo, 'todo o conteúdo cabe na largura disponível').toBe(largura.visivel);
  }
  await expect(diario.locator('[class^=diario-], [class*=" diario-"], .list-loading')).toHaveCount(
    0,
  );
  const publicar = diario.getByRole('button', { name: 'Publicar', exact: true });
  await expect(publicar).toHaveCSS('border-radius', '999px');
  expect((await conferirAxe(page, 'Diário profissional a 320 px')).toleradas).toEqual([]);

  await diario.getByRole('textbox', { name: 'Área (obrigatória)' }).fill('Cuidado');
  await diario
    .getByRole('textbox', { name: 'Data do atendimento (obrigatória)' })
    .fill('18/11/2026');
  await diario
    .getByRole('textbox', { name: 'Atividade (obrigatória para publicar)' })
    .fill('Relato fictício');
  await diario.getByRole('combobox', { name: 'Quem verá este registro' }).click();
  await diario.getByRole('option', { name: 'Equipe do caso e família' }).click();
  const envio = page.waitForRequest(
    (req) => req.method() === 'POST' && new URL(req.url()).pathname === caminhoDiario,
  );
  await publicar.click();
  expect((await envio).postDataJSON()).toMatchObject({
    tipo: 'evolucao_profissional',
    audiencia: 'equipe_e_familia',
    conteudo: { data: '2026-11-18', atividade: 'Relato fictício' },
  });
});

test('Diário da Família mantém rótulos dos campos e não oferece comandos da equipe', async ({
  page,
}) => {
  await preparar(page, 'familia');
  const diario = page.locator('[data-secao=diario]');
  await expect(diario.getByRole('heading', { name: 'Registrar no diário' })).toBeVisible();
  const categoria = diario.getByRole('textbox', { name: 'Categoria (opcional)' });
  await expect(categoria).toHaveCSS('border-radius', '999px');
  await expect(
    diario.getByRole('checkbox', { name: 'Gostaria de um retorno da coordenação' }),
  ).toBeVisible();
  await expect(diario.getByRole('combobox', { name: 'Quem verá este registro' })).toHaveCount(0);
  await expect(diario.getByRole('button', { name: 'Gravar áudio' })).toHaveCount(0);
  await expect(diario.getByRole('button', { name: /converter em tarefa/ })).toHaveCount(0);
  expect((await conferirAxe(page, 'Diário da Família a 320 px')).toleradas).toEqual([]);
});
