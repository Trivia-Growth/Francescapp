/**
 * Bancada da prova de controles próprios sobre a agenda individual.
 *
 * Monta a mesma agenda e os controles da casca do produto.
 *
 * Nada de rede de verdade: toda requisição é para `/api/...` relativo, interceptada pelo
 * Playwright (ver o `.pw.ts` desta bancada). Dados fictícios.
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { AgendaIndividual } from '../../web/agenda-individual.tsx';

sessionStorage.setItem('modo-acesso', 'google');
sessionStorage.setItem('fluxo-google', 'a'.repeat(22));

const raiz = document.getElementById('agenda-individual');
if (raiz)
  createRoot(raiz).render(
    createElement(AgendaIndividual, {
      sessaoId: 'sessao-ficticia',
      usuarioId: 'usuario-ficticio',
      listarPacientes: async () => ({ itens: [], proximo_cursor: null }),
    }),
  );
