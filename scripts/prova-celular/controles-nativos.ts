import { type Page, expect } from '@playwright/test';

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
