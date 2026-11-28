import { expect, test } from '@playwright/test';
import { conferirAxe } from './axe.ts';

test.beforeEach(async ({ context }) => {
  await context.route('**/*', (rota) => {
    const destino = new URL(rota.request().url());
    const local = destino.hostname === '127.0.0.1' || destino.hostname === 'localhost';
    return local ? rota.continue() : rota.abort('blockedbyclient');
  });
});

test('as quatro datas do Financeiro funcionam em ilhas durante a troca de abas', async ({
  page,
}) => {
  const erros: string[] = [];
  page.on('pageerror', (erro) => erros.push(erro.message));
  page.on('console', (mensagem) => {
    if (mensagem.type() === 'error') erros.push(mensagem.text());
  });
  await page.goto('/scripts/prova-celular/financeiro.html');
  await conferirAxe(page, 'financeiro-controles-proprios — aba inicial');

  async function preencher(rotulo: string, dia: string) {
    const visivel = page.getByLabel(rotulo, { exact: true });
    await expect(visivel).toHaveAttribute('type', 'text');
    await expect(visivel).toHaveAttribute('placeholder', 'dd/mm/aaaa');
    const grupo = page.locator('[data-aprimorada=data]').filter({ has: visivel });
    const nativo = grupo.locator(':scope > input[type="date"]');
    await expect(nativo).toHaveAttribute('aria-hidden', 'true');
    const medidas = await nativo.evaluate((campo) => ({
      opacidade: getComputedStyle(campo).opacity,
      soUmGrupo: campo.parentElement?.parentElement?.closest('[data-aprimorada=data]') === null,
    }));
    expect(medidas).toEqual({ opacidade: '0', soUmGrupo: true });
    await visivel.fill(`${dia}/03/2026`);
    await expect(nativo).toHaveValue(`2026-03-${dia}`);
  }

  await preencher('Início da vigência', '15');
  await page.getByRole('tab', { name: 'Despesas do caso' }).click();
  await preencher('Data', '16');
  await page.getByRole('tab', { name: 'Apuração' }).click();
  await preencher('Início do período', '17');
  await preencher('Fim do período', '18');
  await page.getByRole('tab', { name: 'Valor por turno' }).click();
  await expect(page.getByLabel('Início da vigência', { exact: true })).toHaveValue('');
  await preencher('Início da vigência', '19');

  expect(erros).toEqual([]);
});
