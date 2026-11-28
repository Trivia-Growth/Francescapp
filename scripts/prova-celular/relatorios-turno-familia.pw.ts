import { expect, test } from '@playwright/test';
import { envelope } from '../../web/fixtures/comum.js';
import { PACIENTE_IDS, sessaoAdministrador } from '../../web/fixtures/sessao.js';

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

test('Família consulta relatórios sem exportação de caso e cancela a leitura ao sair da seção', async ({
  page,
}) => {
  const pacienteId = PACIENTE_IDS[0];
  const caminho = `/api/pacientes/${pacienteId}/execucao-turno/relatorio`;
  await page.addInitScript(
    ({ sessaoId, caminho }) => {
      sessionStorage.setItem('modo-acesso', 'familiar');
      sessionStorage.setItem('fluxo-familiar', 'AAAAAAAAAAAAAAAAAAAAAA');
      sessionStorage.setItem('sessao-familiar', sessaoId);
      const fetchOriginal = window.fetch.bind(window);
      window.fetch = (entrada, opcoes) => {
        if (typeof entrada === 'string' && new URL(entrada, location.href).pathname === caminho)
          opcoes?.signal?.addEventListener('abort', () => {
            document.body.dataset.consultaRelatorioAbortada = 'sim';
          });
        return fetchOriginal(entrada, opcoes);
      };
    },
    { sessaoId: sessaoAdministrador.session_id, caminho },
  );
  let liberar = () => {};
  const espera = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  const paciente = { id: pacienteId, nome: 'Pessoa fictícia', nome_preferencia: null, versao: 1 };
  let consultas = 0;
  await page.route('**/api/**', async (rota) => {
    const url = new URL(rota.request().url());
    if (url.pathname === '/api/familiar/sessao')
      return rota.fulfill({
        json: envelope({
          ...sessaoAdministrador,
          usuario: { ...sessaoAdministrador.usuario, perfil: 'familia' },
          capacidades: [],
        }),
      });
    if (url.pathname === '/api/familiar/pacientes')
      return rota.fulfill({ json: envelope({ itens: [paciente], proximo_cursor: null }) });
    if (url.pathname === `/api/familiar/pacientes/${pacienteId}`)
      return rota.fulfill({ json: envelope(paciente) });
    if (url.pathname === caminho) {
      consultas += 1;
      if (consultas === 1) await espera;
      return rota.fulfill({
        json: envelope({
          consulta_id: PACIENTE_IDS[1],
          paciente_id: pacienteId,
          tipo: 'diario',
          inicio: url.searchParams.get('inicio'),
          fim: url.searchParams.get('fim'),
          instante_corte: '2026-11-27T12:00:00.000Z',
          rotulos_atuais: true,
          itens: [],
          lacunas: [],
          proximo_cursor: null,
        }),
      });
    }
    return rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
  });
  const painel = page.locator('#ficha-painel');
  const consultar = painel.getByRole('button', { name: 'Consultar relatório' });
  try {
    await page.goto(`/web/index.html#paciente/${pacienteId}/relatorios-turno`);
    await expect(consultar).toBeVisible();
    await expect(painel.locator('option[value="caso"]')).toHaveCount(0);
    const pedido = page.waitForRequest(
      (requisicao) => new URL(requisicao.url()).pathname === caminho,
    );
    await consultar.click();
    await pedido;
    await page.getByRole('tab', { name: 'Dados do paciente' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-consulta-relatorio-abortada', 'sim');
    await expect(painel.locator('.ficha-secao')).toHaveAttribute('data-secao', 'dados');
  } finally {
    liberar();
  }
  await page.getByRole('tab', { name: 'Relatórios do cuidado' }).click();
  await consultar.click();
  await expect(painel.getByText('Nenhum registro neste período')).toBeVisible();
  expect(consultas).toBe(2);
});
