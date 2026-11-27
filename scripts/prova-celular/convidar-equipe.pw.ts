/**
 * "Convidar alguém da equipe" em navegador real (fatia 7 do plano visual). jsdom não move
 * foco de verdade nem calcula a árvore de acessibilidade; aqui o motor é o Chromium.
 *
 * Prova: (1) envio inválido foca o primeiro campo na ordem do documento; (2) o erro é
 * anunciado UMA vez — descrição do campo focado, nenhuma região viva repete a frase;
 * (3) o payload é o do contrato; (4) axe sem violação, no estado inicial e no de erro.
 * O dublê de API só registra o que seria enviado: não autoriza nada e não substitui as
 * provas de servidor e de banco da concessão. Dados fictícios, nada sai para a rede.
 */
import { expect, test } from '@playwright/test';
import { conferirAxe } from './axe.ts';

const VIEWPORTS = [
  { nome: '390x844', width: 390, height: 844 },
  { nome: '1440x900', width: 1440, height: 900 },
] as const;

test.beforeEach(async ({ context }) => {
  await context.route('**/*', (rota) => {
    const destino = new URL(rota.request().url());
    const local = destino.hostname === '127.0.0.1' || destino.hostname === 'localhost';
    return local ? rota.continue() : rota.abort('blockedbyclient');
  });
});

for (const viewport of VIEWPORTS) {
  test.describe(`convidar alguém (${viewport.nome})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('envio inválido foca o primeiro campo e o erro é anunciado uma vez', async ({ page }) => {
      await page.goto('/scripts/prova-celular/convidar-equipe.html');
      await expect(page.getByText('Tudo conferido')).toBeVisible();
      await conferirAxe(page, `convidar-equipe — inicial ${viewport.nome}`);

      // Observa toda região viva: se a frase do erro entrar em alguma, o leitor a diria
      // duas vezes (uma ali, outra no foco).
      await page.evaluate(() => {
        const w = window as unknown as { __vivas: string[] };
        w.__vivas = [];
        new MutationObserver(() => {
          for (const r of document.querySelectorAll('[aria-live], [role="alert"], [role="status"]'))
            if (r.textContent) w.__vivas.push(r.textContent);
        }).observe(document.body, { subtree: true, childList: true, characterData: true });
      });

      await page.getByRole('button', { name: 'Pré-conceder acesso' }).click();

      const email = page.getByRole('textbox', { name: /E-mail/ });
      await expect(email).toBeFocused();
      await expect(email).toHaveAttribute('aria-invalid', 'true');
      await expect(email).toHaveAccessibleDescription(/e-mail válido/);
      await expect(page.getByRole('textbox', { name: /Motivo/ })).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      const frase = (await page.locator('#equipe-email-erro').textContent()) ?? '';
      expect(frase).not.toBe('');
      await expect(page.getByText(frase)).toHaveCount(1);
      const vivas = await page.evaluate(() => (window as unknown as { __vivas: string[] }).__vivas);
      expect(vivas.some((texto) => texto.includes(frase))).toBe(false);
      expect(
        await page.evaluate(() => (window as unknown as { __enviados: unknown[] }).__enviados),
      ).toEqual([]);

      // Segundo envio inválido com o foco JÁ no campo (Enter dentro dele): o foco sai e
      // volta, senão o erro ficaria mudo para o leitor.
      await page.evaluate(() => {
        const w = window as unknown as { __focos: number };
        w.__focos = 0;
        document.getElementById('equipe-email')?.addEventListener('focus', () => w.__focos++);
      });
      await email.press('Enter');
      await expect(email).toBeFocused();
      expect(await page.evaluate(() => (window as unknown as { __focos: number }).__focos)).toBe(1);
      await conferirAxe(page, `convidar-equipe — com erros ${viewport.nome}`);
    });

    test('payload igual ao contrato, e o formulário limpa depois do envio', async ({ page }) => {
      await page.goto('/scripts/prova-celular/convidar-equipe.html');
      await expect(page.getByText('Tudo conferido')).toBeVisible();
      await page.getByRole('textbox', { name: /E-mail/ }).fill('  pessoa.ficticia@example.test ');
      await page.getByRole('textbox', { name: /Motivo/ }).fill('Plantão de sábado');
      await page.getByRole('button', { name: 'Pré-conceder acesso' }).click();
      await expect(page.getByText(/Convite pendente/)).toBeVisible();
      expect(
        await page.evaluate(() => (window as unknown as { __enviados: unknown[] }).__enviados),
      ).toEqual([
        {
          email: 'pessoa.ficticia@example.test',
          perfil: 'profissional',
          metodo: 'google_workspace',
          motivo: 'Plantão de sábado',
        },
      ]);
      await expect(page.getByRole('textbox', { name: /E-mail/ })).toHaveValue('');
    });
  });
}
