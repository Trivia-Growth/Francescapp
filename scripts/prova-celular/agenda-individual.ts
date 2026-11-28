/**
 * Bancada da prova de controles próprios sobre a agenda individual.
 *
 * Monta a mesma agenda e os controles da casca do produto.
 *
 * Nada de rede de verdade: toda requisição é para `/api/...` relativo, interceptada pelo
 * Playwright (ver o `.pw.ts` desta bancada). Dados fictícios.
 */
import { createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { Confirmacoes } from '../../web/confirmacao.js';
import { AgendaIndividual } from '../../web/agenda-individual.tsx';

sessionStorage.setItem('modo-acesso', 'google');
sessionStorage.setItem('fluxo-google', 'a'.repeat(22));

const raiz = document.getElementById('agenda-individual');
if (raiz)
  createRoot(raiz).render(
    createElement(
      Fragment,
      null,
      createElement(Confirmacoes),
      createElement(AgendaIndividual, {
        sessaoId: 'sessao-ficticia',
        usuarioId: 'usuario-ficticio',
        listarPacientes: async () => ({ itens: [], proximo_cursor: null }),
      }),
    ),
  );
