/**
 * Prova de navegador real do diálogo de cadastro (`web/painel-cadastro.ts`): abre pelo
 * botão, Tab e Shift+Tab não saem dele, Esc e "Fechar" fecham, e sem permissão de cadastro
 * ele não abre. Ancorada em abertura e foco, não na aparência dos controles do formulário:
 * `#cadastro` é região vigiada por `aplicarControlesProprios`, que tem substituição em
 * andamento, e esta prova não deve mudar de cor por causa dela.
 *
 * Contraprova feita ao escrever (registrada no PR): com `prenderFoco` desligado no
 * painel, o caso do Tab falha por foco fora do diálogo, não por tempo esgotado.
 *
 * Nada de rede além do servidor local; nenhuma API é chamada.
 */
import { expect, type Page, test } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route('**/*', (rota) => {
    const destino = new URL(rota.request().url());
    const local = destino.hostname === '127.0.0.1' || destino.hostname === 'localhost';
    return local ? rota.continue() : rota.abort('blockedbyclient');
  });
});

function vigiarErros(page: Page): string[] {
  const erros: string[] = [];
  page.on('pageerror', (erro) => erros.push(erro.message));
  page.on('console', (mensagem) => {
    if (mensagem.type() === 'error') erros.push(mensagem.text());
  });
  return erros;
}

async function abrirBancada(page: Page, consulta = '') {
  await page.goto(`/scripts/prova-celular/painel-cadastro.html${consulta}`);
  await expect(page.locator('body[data-pronta]')).toHaveCount(1);
}

const focoNoDialogo = (page: Page) =>
  page.evaluate(() => {
    const ativo = document.activeElement;
    return {
      dentro: Boolean(ativo && document.getElementById('cadastro-dialogo')?.contains(ativo)),
      onde: ativo ? `${ativo.tagName.toLowerCase()}#${ativo.id}` : 'nenhum',
    };
  });

test('abre pelo botão com o foco no título do formulário', async ({ page }) => {
  const erros = vigiarErros(page);
  await abrirBancada(page);
  const dialogo = page.locator('#cadastro-dialogo');
  await expect(dialogo).not.toHaveAttribute('open', '');

  await page.getByRole('link', { name: 'Novo paciente' }).click();

  await expect(dialogo).toHaveAttribute('open', '');
  await expect(page.locator('#create-title')).toBeFocused();
  expect(erros).toEqual([]);
});

test('Tab e Shift+Tab percorrem o diálogo inteiro e nunca saem dele', async ({ page }) => {
  const erros = vigiarErros(page);
  await abrirBancada(page);
  await page.getByRole('link', { name: 'Novo paciente' }).click();
  await expect(page.locator('#create-title')).toBeFocused();

  // Mais voltas do que há controles no formulário: se houver saída, ela aparece.
  const voltas =
    2 * (await page.locator('#cadastro-dialogo :is(a, button, input, select, textarea)').count());
  for (const tecla of ['Tab', 'Shift+Tab']) {
    for (let volta = 0; volta < voltas; volta += 1) {
      await page.keyboard.press(tecla);
      const foco = await focoNoDialogo(page);
      expect(foco.dentro, `${tecla} nº ${volta + 1} levou o foco para ${foco.onde}`).toBe(true);
    }
  }
  expect(erros).toEqual([]);
});

test('Esc e "Fechar" fecham o diálogo', async ({ page }) => {
  const erros = vigiarErros(page);
  await abrirBancada(page);
  const dialogo = page.locator('#cadastro-dialogo');
  const abrir = page.getByRole('link', { name: 'Novo paciente' });

  await abrir.click();
  await expect(dialogo).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(dialogo).not.toHaveAttribute('open', '');

  await abrir.click();
  await expect(dialogo).toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Fechar' }).click();
  await expect(dialogo).not.toHaveAttribute('open', '');
  expect(erros).toEqual([]);
});

test('sem permissão de cadastro o diálogo não abre, nem com o botão acionado à força', async ({
  page,
}) => {
  const erros = vigiarErros(page);
  await abrirBancada(page, '?sem-permissao');
  const botao = page.locator('#new-patient-link');
  await expect(botao).toBeHidden();

  // O botão oculto não se clica pela interface; `click()` no elemento dispara mesmo assim
  // e exercita a defesa do próprio painel, não só o `hidden` de quem o esconde.
  await botao.evaluate((elemento: HTMLElement) => elemento.click());

  await expect(page.locator('#cadastro-dialogo')).not.toHaveAttribute('open', '');
  await expect(page.locator('#cadastro')).toBeHidden();
  expect(erros).toEqual([]);
});
