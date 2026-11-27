/**
 * Conforto no celular da ficha de plantão e do consolidado diário no formato da ficha
 * (mudança OpenSpec `diario-de-plantao`, FR-073 e FR-080).
 *
 * Por que existe: jsdom não calcula layout. Largura renderizada, rolagem horizontal e área
 * de toque só têm valor medidas por um motor de layout; afirmá-las a partir de jsdom seria
 * evidência falsa. O que é medido aqui soma aos testes de interface já existentes e não
 * substitui nenhum teste de autorização de servidor ou de banco.
 *
 * Nada de rede: toda requisição para fora de 127.0.0.1 é recusada, os serviços têm dublê e
 * os dados são fictícios.
 */
import { expect, type Page, test } from '@playwright/test';
import { type Alvo, medirAlvos, medirCampos, medirLargura, percorrerFoco } from './medidas.ts';

const VIEWPORTS = [
  { nome: '360x640', width: 360, height: 640 },
  { nome: '390x844', width: 390, height: 844 },
] as const;

/** Mínimo de área de toque adotado pelo projeto (`AGENTS.md — Qualidade e experiência`). */
const ALVO_MINIMO = 44;

function registrar(titulo: string, dados: unknown): void {
  console.log(`\n[medição] ${titulo}\n${JSON.stringify(dados, null, 2)}`);
}

function pequenos(alvos: Alvo[]): Alvo[] {
  return alvos.filter((alvo) => alvo.largura < ALVO_MINIMO || alvo.altura < ALVO_MINIMO);
}

test.beforeEach(async ({ context }) => {
  // Dublê de rede: só o servidor local responde. Qualquer outro destino é recusado.
  await context.route('**/*', (rota) => {
    const destino = new URL(rota.request().url());
    const local = destino.hostname === '127.0.0.1' || destino.hostname === 'localhost';
    return local ? rota.continue() : rota.abort('blockedbyclient');
  });
});

for (const viewport of VIEWPORTS) {
  test.describe(`ficha de plantão no celular (${viewport.nome})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('ficha e consolidado — largura, alvos, foco e rótulos', async ({ page }) => {
      await page.goto('/scripts/prova-celular/ficha-plantao.html');
      await expect(page.getByText('Ficha em branco')).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Consolidado diário no formato da ficha' }),
      ).toBeVisible();

      const largura = await medirLargura(page);
      const alvos = await medirAlvos(page);
      const campos = await medirCampos(page);
      const foco = await percorrerFoco(page, 60);
      registrar(`ficha de plantão ${viewport.nome}`, {
        largura,
        alvos,
        campos,
        foco: foco.map((parada) => ({
          descricao: parada.descricao,
          contorno: `${parada.contorno} ${parada.espessura}px ${parada.cor}`,
          visivel: parada.visivel,
        })),
        alvosAbaixoDoMinimo: pequenos(alvos),
      });

      expect(largura.maisLargos, 'elementos passando da largura da janela').toEqual([]);
      expect(largura.documentoScrollWidth).toBeLessThanOrEqual(largura.janelaInnerWidth);
      expect(pequenos(alvos), `alvos de toque menores que ${ALVO_MINIMO}px`).toEqual([]);
      expect(
        campos.filter((campo) => !campo.temRotulo),
        'campos sem rótulo',
      ).toEqual([]);
      expect(foco.length).toBeGreaterThan(0);
      expect(
        foco.filter((parada) => !parada.visivel),
        'paradas sem foco visível',
      ).toEqual([]);
    });

    test('ficha — audiência por campo e medicação sem texto livre cabem na tela', async ({
      page,
    }) => {
      await page.goto('/scripts/prova-celular/ficha-plantao.html');
      const medicacao = page.locator('fieldset').filter({ hasText: 'Medicação' }).first();
      await expect(medicacao).toBeVisible();
      // Medicação é prescrição e administração, não linha de texto: não há campo aqui.
      await expect(medicacao.locator('textarea, input')).toHaveCount(0);
      const caixa = await medicacao.boundingBox();
      const atividades = page.locator('fieldset').filter({ hasText: 'Atividades' }).first();
      await expect(atividades.getByText('A família autorizada pode ler este campo.')).toBeVisible();
      const observacoes = page.locator('fieldset').filter({ hasText: 'Observações' }).first();
      await expect(
        observacoes.getByText('Nota interna da equipe. A família não lê este campo.'),
      ).toBeVisible();
      const largura = await medirLargura(page);
      registrar(`ficha — audiência e medicação ${viewport.nome}`, { caixa, largura });
      expect(caixa?.width ?? 0).toBeLessThanOrEqual(viewport.width);
      expect(largura.documentoScrollWidth).toBeLessThanOrEqual(largura.janelaInnerWidth);
    });
  });
}

/* Interação com o observador de controles (27/11/2026). `main.ts` instala
 * `aplicarControlesProprios`, que move os `<select>` e datas do React para um grupo criado
 * à mão; quando o React remove um nó que já não está onde ele o pôs, a ilha cai com
 * `NotFoundError`. A bancada passa a instalar o observador (#25). Este teste troca seleções
 * e recarrega a ficha conferindo erros de página a cada passo. Sem o observador na bancada
 * ele usa o `<select>` nativo; com ele, o combobox da aplicação. */
async function escolher(page: Page, rotulo: RegExp, opcao: string) {
  const aprimorada = (await page.locator('[data-aprimorada]').count()) > 0;
  if (aprimorada) {
    await page.getByRole('combobox', { name: rotulo }).click();
    await page.getByRole('option', { name: opcao, exact: true }).click();
  } else await page.getByRole('combobox', { name: rotulo }).selectOption({ label: opcao });
}

test('ficha — trocar seleções e recarregar não derruba a tela', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (erro) => erros.push(String(erro)));
  const semErros = async () => {
    await page.waitForTimeout(50);
    expect(erros, 'erros de página').toEqual([]);
  };
  await page.goto('/scripts/prova-celular/ficha-plantao.html');
  await expect(page.getByText('Ficha em branco')).toBeVisible();
  const declarar = /^Preenchi fora do horário do plantão/;
  await escolher(page, declarar, 'Sim — declarar a janela real que cumpri');
  await semErros();
  await escolher(page, declarar, 'Não');
  await semErros();
  await escolher(page, /^Plantão/, 'Noturno');
  await semErros();
  await page.getByRole('button', { name: 'Recarregar a ficha' }).click();
  await expect(page.getByText('Ficha em branco')).toBeVisible();
  await semErros();
});
