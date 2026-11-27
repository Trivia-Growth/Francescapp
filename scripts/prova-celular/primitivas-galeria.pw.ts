import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { type ViteDevServer, createServer } from 'vite';
import { conferirAxe } from './axe.ts';

let servidor: ViteDevServer | undefined;
let origem: string;

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

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`primitivas a ${viewport.width} px seguem o Sistema e passam no axe`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(`${origem}/demonstracao-componentes.html`);
    const campo = page.getByRole('textbox', { name: 'Nome completo obrigatório' });
    const botao = page.getByRole('button', { name: 'Ação do assunto' });
    const marca = page.getByText('Em acompanhamento', { exact: true }).first();
    for (const controle of [campo, botao]) {
      await expect(controle).toHaveCSS('min-height', '46px');
      await expect(controle).toHaveCSS('border-top-left-radius', '999px');
      await expect(controle).toHaveCSS('font-size', '16px');
      await expect(controle).toHaveCSS('line-height', '24px');
    }
    await expect(marca).toHaveCSS('border-top-left-radius', '999px');
    await expect(marca).toHaveCSS('font-size', '16px');
    await conferirAxe(
      page,
      `Galeria de primitivas · ${viewport.width} px`,
      ':is([data-peso], [data-tom], #demo-nome, #demo-email, #demo-telefone)',
    );
  });
}

test('salvamento preserva foco e largura e admite um único envio pendente', async ({ page }) => {
  await page.goto(`${origem}/demonstracao-componentes.html`);
  const formulario = page.getByRole('form', { name: 'Prévia de gravação' });
  const salvar = formulario.getByRole('button', { name: 'Salvar' });
  await expect(salvar).toBeVisible();
  const largura = await salvar.evaluate((no) => no.getBoundingClientRect().width);
  await salvar.dblclick();
  const salvando = formulario.getByRole('button', { name: 'Salvando…' });
  await expect(salvando).toBeDisabled();
  await expect(salvando).toBeFocused();
  expect(await salvando.evaluate((no) => no.getBoundingClientRect().width)).toBe(largura);
  await page.keyboard.press('Enter');
  await formulario.locator('#demo-nome').press('Enter');
  await formulario.evaluate((no: HTMLFormElement) => no.requestSubmit());
  await expect(formulario.getByText('Envios aceitos: 1')).toBeVisible();
  await expect(salvar).toBeEnabled();
  await salvar.click();
  await expect(formulario.getByText('Envios aceitos: 2')).toBeVisible();
});
