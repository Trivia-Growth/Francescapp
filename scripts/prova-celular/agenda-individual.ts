/**
 * Bancada da prova de controles próprios sobre a agenda individual.
 *
 * Monta a mesma agenda e os controles da casca do produto.
 *
 * Nada de rede de verdade: toda requisição é para `/api/...` relativo, interceptada pelo
 * Playwright (ver o `.pw.ts` desta bancada). Dados fictícios.
 */
import { montarAgendaIndividual } from '../../web/agenda-individual.tsx';

sessionStorage.setItem('modo-acesso', 'google');
sessionStorage.setItem('fluxo-google', 'a'.repeat(22));

const raiz = document.getElementById('agenda-individual');
if (raiz) {
  montarAgendaIndividual(raiz, 'sessao-ficticia', 'usuario-ficticio', async () => ({
    itens: [],
    proximo_cursor: null,
  }));
}
