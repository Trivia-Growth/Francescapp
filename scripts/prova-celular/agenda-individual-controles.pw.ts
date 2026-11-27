/**
 * Prova de navegador real (não jsdom) de que o `<select>` de `realizacao-compromisso.tsx`
 * sobrevive ao `MutationObserver` de `web/ui/controles.ts` aplicado sobre `agenda-individual`
 * em `web/main.ts`. O observador move todo `<select>` que aparece para dentro de um
 * invólucro próprio (`aprimorarSelecao`, em `web/ui/selecao.ts`), inclusive os que o React
 * desenha — e isso já quebrou uma tela migrada (`selecao-profissional`) de um jeito que só
 * apareceu em Chromium, nunca em jsdom.
 *
 * O cenário de risco real deste bloco é o select "O que aconteceu": ele é sempre montado,
 * mas o select "Motivo" que aparece ao lado dele é DESMONTADO quando a situação muda para
 * "Realizado" — é exatamente a remoção que o observador pode invalidar. O campo de data
 * (`datetime-local`) de `agenda-operacoes.tsx` NÃO é alcançado por este observador (ele só
 * mira `input[type="date"]`, conferido em `web/ui/data.ts`), então não precisa da mesma
 * prova; o teste abaixo ainda abre aquele formulário de passagem, para flagrar qualquer
 * erro de página que apareça ao vivo.
 *
 * Nada de rede de verdade: toda rota de API é interceptada com dados fictícios; qualquer
 * outro destino é recusado.
 */
import { expect, test } from '@playwright/test';

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
  await page.route('**/api/agenda/google/vinculos/consulta', (rota) =>
    rota.fulfill({ json: { dados: [] } }),
  );
});

test('select de realização sobrevive ao observador de controles próprios ao ser montado e desmontado', async ({
  page,
}) => {
  const erros: string[] = [];
  page.on('pageerror', (erro) => erros.push(erro.message));
  page.on('console', (mensagem) => {
    if (mensagem.type() === 'error') erros.push(mensagem.text());
  });

  await page.goto('/scripts/prova-celular/agenda-individual.html');
  await expect(page.getByText('Consulta fictícia')).toBeVisible();

  await page.getByRole('button', { name: 'Registrar realização' }).click();
  const painel = page.locator('.realizacao-compromisso');
  await expect(painel).toBeVisible();

  const situacao = painel.locator('#realizacao-situacao');
  await expect(situacao).toBeVisible();
  // O observador processa de forma assíncrona (MutationObserver), mas síncrona o
  // suficiente para já ter alcançado o select ao fim do primeiro ciclo de microtarefas.
  await expect
    .poll(async () => situacao.locator('xpath=..').getAttribute('data-aprimorada'))
    .not.toBeNull();
  // Confere que `ui.css` carregou de verdade, não só que o atributo foi escrito: a regra
  // `.ui-selecao[data-aprimorada] > select { opacity: 0 }` só existe nessa folha. Sem ela,
  // o nativo continuaria visível e a prova estaria medindo uma página que não é o produto.
  await expect(situacao).toHaveCSS('opacity', '0');

  // Ciclo de montagem/desmontagem do select "Motivo": aparece em "Faltou", some em
  // "Realizado" — a remoção real que o observador pode invalidar. Repetido três vezes
  // para expor qualquer erro que só aconteça na segunda montagem do MESMO nó físico.
  for (let volta = 0; volta < 3; volta += 1) {
    await situacao.selectOption('faltou');
    const motivo = painel.locator('#realizacao-motivo');
    await expect(motivo).toBeVisible();
    await expect
      .poll(async () => motivo.locator('xpath=..').getAttribute('data-aprimorada'))
      .not.toBeNull();
    await motivo.selectOption('transporte');

    await situacao.selectOption('realizado');
    await expect(motivo)
      .toBeHidden({ timeout: 2000 })
      .catch(async () => {
        // `toBeHidden` cobre display:none; o campo pode já não existir — a asserção
        // seguinte então falha de forma clara em vez de mascarar o problema.
        await expect(motivo).toHaveCount(0);
      });
  }

  // A tela continua utilizável depois dos ciclos: fechar funciona e não há erro acumulado.
  await page.getByRole('button', { name: 'Fechar', exact: true }).first().click();
  await expect(painel).toBeHidden();

  // Formulário de alterar compromisso (datetime-local, fora do alcance deste observador):
  // só para flagrar qualquer erro de página ao abrir/fechar, já que também vive na mesma
  // região vigiada.
  await page.getByRole('button', { name: 'Alterar' }).click();
  await expect(page.locator('#agenda-inicio')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar compromisso' }).click();
  await expect(page.getByText('Confirme o cancelamento')).toBeVisible();

  expect(erros, `Erros de página/console: ${erros.join('\n')}`).toEqual([]);
});
