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
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { conferirAxe } from './axe.ts';

/* O servidor é o Vite COM a configuração da aplicação (`web/vite.config.ts`: React e
   Tailwind), como na galeria de primitivas. `prova-celular-vite.config.mjs` não compila as
   utilitárias do Tailwind: nele esta bancada saía sem estilo e as capturas eram inúteis
   (achado de 27/11/2026). */
let servidor: ViteDevServer | undefined;
let origem: string;

test.beforeAll(async () => {
  servidor = await createServer({
    root: resolve('.'),
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

const PAGINA = '/scripts/prova-celular/convidar-equipe.html';

/** Falha se a folha de estilo não carregou: sem ela a captura e o axe de contraste mentem.
 *  O botão do SISTEMA é pílula (999px) e tem 46px; o principal tem o fundo de ação (#475436). */
async function folhaCarregou(page: Page, botao: string, principal = true) {
  const alvo = page.getByRole('button', { name: botao });
  if (principal) await expect(alvo).toHaveCSS('background-color', 'rgb(71, 84, 54)');
  await expect(alvo).toHaveCSS('border-top-left-radius', '999px');
  await expect(alvo).toHaveCSS('min-height', '46px');
}

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
      await page.goto(`${origem}${PAGINA}`);
      await expect(page.getByText('Tudo conferido')).toBeVisible();
      await folhaCarregou(page, 'Pré-conceder acesso');
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
      await page.goto(`${origem}${PAGINA}`);
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

/** Capturas para o PR (só com `CAPTURAS=<pasta>`), tiradas com a folha COMPROVADA. */
test('capturas com a folha carregada', async ({ page }) => {
  const pasta = process.env.CAPTURAS;
  test.skip(!pasta, 'Sem CAPTURAS, não há o que gravar.');
  const lado = process.env.LADO ?? 'depois';
  for (const tela of (process.env.TELAS ?? 'convidar,equipe').split(','))
    for (const largura of [390, 1440]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(`${origem}${PAGINA}?tela=${tela}`);
      await page
        .getByText(tela === 'equipe' ? /pessoas com acesso/ : 'Tudo conferido')
        .first()
        .waitFor();
      await folhaCarregou(
        page,
        tela === 'equipe' ? 'Atualizar lista' : 'Pré-conceder acesso',
        tela !== 'equipe',
      );
      await page.screenshot({ path: `${pasta}/${lado}-${tela}-${largura}.png`, fullPage: true });
    }
});
