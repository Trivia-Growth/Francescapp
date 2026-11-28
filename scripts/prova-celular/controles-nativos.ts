import { type Locator, type Page, expect } from '@playwright/test';

/** Inseridos após a carga, seleção e data continuam sob o pai que os criou. */
export async function conferirControlesNativos(page: Page, seletor: string) {
  const estado = await page.locator(seletor).evaluate(async (raiz) => {
    const selecao = document.createElement('select');
    selecao.add(new Option('Valor fictício', 'teste'));
    const data = document.createElement('input');
    data.type = 'date';
    raiz.append(selecao, data);
    // Uma entrega do observador legado ocorreria antes do próximo quadro.
    await new Promise<void>((resolver) => requestAnimationFrame(() => resolver()));
    return [selecao, data].map((controle) => {
      const resultado = {
        tipo: controle.type,
        mesmoPai: controle.parentElement === raiz,
        opacidade: getComputedStyle(controle).opacity,
      };
      controle.remove();
      return resultado;
    });
  });
  expect(estado, `controles inseridos em ${seletor} devem permanecer nativos`).toEqual([
    { tipo: 'select-one', mesmoPai: true, opacidade: '1' },
    { tipo: 'date', mesmoPai: true, opacidade: '1' },
  ]);
}

/** O campo e o botão formam um controle com o mesmo eixo visual. */
export async function conferirAlinhamentoDaData(grupo: Locator) {
  const campo = grupo.locator('[data-valor-visivel]');
  const botao = grupo.getByRole('button', { name: 'Escolher no calendário' });
  await expect(campo).toBeVisible();
  await expect(botao).toBeVisible();
  const [campoCaixa, botaoCaixa] = await Promise.all([campo.boundingBox(), botao.boundingBox()]);
  if (!campoCaixa || !botaoCaixa) throw new Error('Campo de data ou calendário sem caixa visível.');
  const deslocamento =
    botaoCaixa.y + botaoCaixa.height / 2 - (campoCaixa.y + campoCaixa.height / 2);
  expect(deslocamento, 'centro vertical do botão em relação ao campo de data').toBeCloseTo(0, 0);
}
