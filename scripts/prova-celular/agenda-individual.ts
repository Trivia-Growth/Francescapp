/**
 * Bancada da prova de controles próprios sobre a agenda individual.
 *
 * Por que existe: `web/main.ts` aplica `aplicarControlesProprios` (MutationObserver de
 * `web/ui/controles.ts`) sobre a MESMA raiz onde `montarAgendaIndividual` monta a árvore
 * React — `agenda-individual` é uma das seis regiões vigiadas. O observador move todo
 * `<select>` e `input[type=date]`/`datetime-local` que aparece para dentro de um invólucro
 * próprio, inclusive os que o React desenha. Esta bancada reproduz a MESMA wiring de
 * `main.ts` (não uma cópia simplificada) para que a prova de navegador valha para o
 * produto: se o React tentar remover um controle vigiado de um jeito que o observador
 * invalidou, o defeito aparece aqui — e só aqui, porque o jsdom dos testes de unidade não
 * tem `MutationObserver` reagindo a controles nativos.
 *
 * Nada de rede de verdade: toda requisição é para `/api/...` relativo, interceptada pelo
 * Playwright (ver o `.pw.ts` desta bancada). Dados fictícios.
 */
import { montarAgendaIndividual } from '../../web/agenda-individual.tsx';
import { aplicarControlesProprios } from '../../web/ui/controles.js';

sessionStorage.setItem('modo-acesso', 'google');
sessionStorage.setItem('fluxo-google', 'a'.repeat(22));

const raiz = document.getElementById('agenda-individual');
if (raiz) {
  // Mesma ordem de `web/main.ts`: a região é vigiada ANTES de qualquer conteúdo existir,
  // porque lá a vigilância começa no arranque e a agenda só monta depois da sessão.
  aplicarControlesProprios(raiz);
  montarAgendaIndividual(raiz, 'sessao-ficticia', 'usuario-ficticio', async () => ({
    itens: [],
    proximo_cursor: null,
  }));
}
