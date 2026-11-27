/**
 * Bancada da prova de controles próprios sobre a agenda individual.
 *
 * A raiz recebe o mesmo observador de main.ts antes da montagem da agenda. Ele ainda
 * processa selects e input[type=date] legados enquanto os campos React já nascem
 * marcados e são montados e desmontados depois da carga.
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
