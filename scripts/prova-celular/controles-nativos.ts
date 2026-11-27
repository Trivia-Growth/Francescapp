import { type Page, expect } from '@playwright/test';

/** Mede um select inserido depois da carga. O produtor do nó escolhe seu controle. */
export async function conferirSelecaoNativa(page: Page, seletor: string) {
  const semInvólucro = await page.locator(seletor).evaluate(async (raiz) => {
    const nativo = document.createElement('select');
    nativo.add(new Option('Valor fictício', 'teste'));
    raiz.append(nativo);
    // Uma entrega do observador legado ocorreria antes do próximo quadro.
    await new Promise<void>((resolver) => requestAnimationFrame(() => resolver()));
    const intacto = nativo.parentElement === raiz;
    nativo.remove();
    return intacto;
  });
  expect(semInvólucro, `select inserido em ${seletor} deve permanecer nativo`).toBe(true);
}
