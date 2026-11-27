import { expect, test } from '@playwright/test';
import { criarErroPublico } from '../../packages/contracts/src/comum.ts';
import { conferirSelecaoNativa } from './controles-nativos.js';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const UUID = '00000000-0000-4000-8000-000000000000';

test.beforeEach(async ({ context, page }) => {
  await context.route('**/*', (rota) => {
    const destino = new URL(rota.request().url());
    const local = destino.hostname === '127.0.0.1' || destino.hostname === 'localhost';
    return local ? rota.continue() : rota.abort('blockedbyclient');
  });
  await page.route('**/api/agenda/google/conexao', (rota) =>
    rota.fulfill({
      json: {
        estado: 'conectado',
        versao: '1',
        operacao_id: UUID,
        autorizacao: 'comprovante-ficticio',
      },
    }),
  );
  await page.route('**/api/agenda/google/pendencia', (rota) =>
    rota.fulfill({ json: { estado: 'nenhuma' } }),
  );
  await page.route('**/api/agenda/google/compromissos**', (rota) =>
    rota.fulfill({
      json: {
        dados: [
          {
            id: 'evt-1',
            titulo: 'Consulta fictícia',
            inicio: '2026-12-01T10:00:00Z',
            fim: '2026-12-01T11:00:00Z',
            etag: 'etag-1',
          },
        ],
      },
    }),
  );
  await page.route('**/api/agenda/realizacao/consulta', (rota) =>
    rota.fulfill({
      json: { dados: { agenda_usuario_id: UUID, compromissos: [] }, request_id: UUID },
    }),
  );
  await page.route('**/api/agenda/realizacao', (rota) =>
    rota.fulfill({ status: 403, json: criarErroPublico('sem_permissao', UUID) }),
  );
  await page.route('**/api/agenda/google/vinculos/consulta', (rota) =>
    rota.fulfill({ json: { dados: [] } }),
  );
});

test('agenda monta a seleção React depois da carga', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (erro) => erros.push(erro.message));
  page.on('console', (mensagem) => {
    const recusaEsperada =
      mensagem.text().includes('403') && mensagem.location().url.endsWith('/api/agenda/realizacao');
    if (recusaEsperada) return;
    if (mensagem.type() === 'error') erros.push(mensagem.text());
  });

  await page.goto('/scripts/prova-celular/agenda-individual.html');
  await expect(page.getByText('Consulta fictícia')).toBeVisible();

  await conferirSelecaoNativa(page, '#agenda-individual');

  await page.getByRole('button', { name: 'Registrar realização' }).click();
  const painel = page.locator('.realizacao-compromisso');
  const situacao = painel.getByRole('combobox', { name: 'O que aconteceu' });

  async function conferirControle(id: string) {
    const nativo = painel.locator(`#${id}`);
    const medicao = await nativo.evaluate((controle) => ({
      opacidade: getComputedStyle(controle).opacity,
      paiMarcado: controle.parentElement?.matches('.ui-selecao[data-aprimorada]'),
      invólucros: controle.parentElement
        ?.closest('.ui-selecao')
        ?.parentElement?.closest('.ui-selecao')
        ? 2
        : 1,
      gatilhos: controle.parentElement?.querySelectorAll(':scope > [role="combobox"]').length,
    }));
    expect(medicao.opacidade, `CSS de tema para #${id}`).toBe('0');
    expect(medicao).toMatchObject({ paiMarcado: true, invólucros: 1, gatilhos: 1 });
    return nativo;
  }

  const recusa = page.waitForResponse((resposta) =>
    resposta.url().endsWith('/api/agenda/realizacao'),
  );
  await painel.getByRole('button', { name: 'Registrar', exact: true }).click();
  expect((await recusa).status()).toBe(403);
  await expect(painel.getByRole('status')).toHaveText(
    'Você não pode registrar a realização nesta agenda.',
  );

  const situacaoNativa = await conferirControle('realizacao-situacao');
  await expect(situacao).toBeVisible();
  await situacao.press('ArrowDown');
  await expect(situacao).toHaveAttribute('aria-expanded', 'true');
  await situacao.press('Escape');
  await expect(situacao).toBeFocused();
  await expect(situacaoNativa).toHaveValue('realizado');

  // Motivo entra num commit posterior e é removido quando a situação volta a Realizado.
  for (let volta = 0; volta < 3; volta += 1) {
    await situacao.click();
    await painel.getByRole('option', { name: 'Faltou' }).click();
    const motivo = painel.getByRole('combobox', { name: 'Motivo da falta (barreira de acesso)' });
    await expect(motivo).toBeVisible();
    const motivoNativo = await conferirControle('realizacao-motivo');
    await motivo.click();
    await painel.getByRole('option', { name: 'Transporte' }).click();
    await expect(motivo).toHaveText('Transporte');
    expect(
      await painel
        .locator('form')
        .evaluate((formulario: HTMLFormElement) => Object.fromEntries(new FormData(formulario))),
    ).toMatchObject({ situacao: 'faltou', motivo: 'transporte' });

    await situacao.click();
    await painel.getByRole('option', { name: 'Realizado', exact: true }).click();
    await expect(motivoNativo).toHaveCount(0);
  }

  await painel.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(painel).toBeHidden();

  await page.getByRole('button', { name: 'Alterar' }).click();
  for (const id of ['agenda-inicio', 'agenda-fim']) {
    const data = page.locator(`#${id}`);
    await expect(data).toBeVisible();
    await expect(data).toHaveAttribute('type', 'datetime-local');
    expect(await data.evaluate((campo) => campo.closest('[data-aprimorada]') === null)).toBe(true);
  }
  await page.getByRole('button', { name: 'Cancelar compromisso' }).click();
  await expect(page.getByText('Confirme o cancelamento')).toBeVisible();

  expect(erros, `Erros de página/console: ${erros.join('\n')}`).toEqual([]);
});
