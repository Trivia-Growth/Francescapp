/**
 * Prova de que `financeiro.ts` — avulso migrado de `web/ui/` — continua funcionando sob
 * `aplicarControlesProprios`, o observador de `main.ts:275-283` que vigia `ficha-view` e
 * `administracao-conteudo`, as duas regiões onde `financeiro.ts` é montado de verdade
 * (`secoesDaFicha` e a área "financeiro" de Administração).
 *
 * Por que existe: o achado de outro agente é que o observador move (`replaceWith` +
 * `append`) todo `<select>`/`input[type=date]` que aparece dentro da região vigiada,
 * inclusive o que chega depois, de dentro de React — e que isso derruba uma ilha React se
 * o nó movido era dela. `financeiro.ts` tem `input[type=date]` de verdade (Início da
 * vigência, Data, Início/Fim do período), mas é 100% imperativo: nenhum desses nós é
 * React. Esta prova mede exatamente essa fronteira, em Chromium real — jsdom não tem o
 * observador e não provaria nada aqui (mesma lição do combobox de `selecao-profissional`).
 *
 * O rótulo ("Início da vigência") fica FORA de `.ui-data`: `aprimorarData` substitui só o
 * `<input>` pelo grupo, na posição dele dentro de `financeiro__campo`; o `<label>` é irmão
 * do grupo, não ancestral. `page.getByLabel` resolve certo porque segue `aria-labelledby`
 * (que `aprimorarData` repõe para o campo visível), não a árvore do DOM.
 *
 * Nada de rede: toda requisição para fora de 127.0.0.1 é recusada, o serviço tem dublê.
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route('**/*', (rota) => {
    const destino = new URL(rota.request().url());
    const local = destino.hostname === '127.0.0.1' || destino.hostname === 'localhost';
    return local ? rota.continue() : rota.abort('blockedbyclient');
  });
});

test('o campo de data de financeiro.ts é aprimorado pelo observador e continua funcional', async ({
  page,
}) => {
  const erros: string[] = [];
  page.on('pageerror', (erro) => erros.push(erro.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') erros.push(msg.text());
  });

  await page.goto('/scripts/prova-celular/financeiro.html');
  await page.getByRole('tab', { name: 'Valor por turno' }).click();

  // Antes do aprimoramento, `getByLabel` resolveria o próprio `<input type=date>` — o
  // `aria-labelledby` só aponta para o campo de texto DEPOIS que `aprimorarData` roda.
  // Resolver um `type=text` com esse rótulo já é a prova de que o observador agiu.
  const visivel = page.getByLabel('Início da vigência');
  await expect(visivel).toHaveAttribute('type', 'text');
  await expect(visivel).toHaveAttribute('placeholder', 'dd/mm/aaaa');

  // O nativo continua no documento, dono do valor, só escondido (`.ui-data[data-aprimorada]
  // > input[type=date]` em `ui.css`) — é ele que o formulário vai enviar.
  const nativo = page.locator('input[type="date"]');
  await expect(nativo).toHaveCount(1);
  await expect(nativo).toHaveAttribute('aria-hidden', 'true');
  // `ui.css` encolhe para 1x1px em vez de `display:none` (precisa continuar focável por
  // script e enviável pelo form); por isso a caixa, não `toBeHidden`, prova que sumiu de
  // vista — `toBeHidden` aceitaria um elemento de 1px como "visível" e não provaria nada.
  const caixa = await nativo.boundingBox();
  expect(
    caixa?.width,
    'nativo deveria estar encolhido, não ocupando a largura do campo',
  ).toBeLessThanOrEqual(1);

  await visivel.fill('15/03/2026');
  await expect(nativo).toHaveValue('2026-03-15');

  // Trocar de aba e voltar: `abrir()` faz `painel.replaceChildren()` e remonta a aba do
  // zero (`web/financeiro.ts:109`), então aparece um `input[type=date]` NOVO — o caso real
  // que o comentário de `aplicarControlesProprios` descreve ("o <select> que chega depois
  // da resposta"). O observador reage a `childList`/`subtree`, não só à primeira passada;
  // se a segunda rodada não aprimorasse o campo novo, é aqui que apareceria.
  await page.getByRole('tab', { name: 'Despesas do caso' }).click();
  await page.getByRole('tab', { name: 'Valor por turno' }).click();
  const visivelDeNovo = page.getByLabel('Início da vigência');
  await expect(visivelDeNovo).toHaveAttribute('type', 'text');
  await visivelDeNovo.fill('02/04/2026');
  await expect(page.locator('input[type="date"]')).toHaveValue('2026-04-02');

  expect(erros, `console/página sem erro: ${JSON.stringify(erros)}`).toEqual([]);
});
