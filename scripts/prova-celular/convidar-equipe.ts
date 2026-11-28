/**
 * Bancada de "Convidar alguém da equipe" (fatia 7 do plano visual). Monta o código real da
 * tela com as folhas reais e uma API de dublê: nenhuma requisição sai daqui e os dados são
 * fictícios. O dublê só deixa a tela chegar ao estado liberado e REGISTRA o que seria
 * enviado (`window.__enviados`); ele não autoriza nada e não substitui as provas de
 * servidor e de banco da concessão.
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { TelaConcessaoEquipe } from '../../web/concessao-equipe.js';
import { TelaConvidarEquipe } from '../../web/convidar-equipe.js';
import type { ClienteFFCM } from '../../web/api.js';

const ator = '11111111-1111-4111-8111-111111111111';
const vazia = { epoca: 2, reserva: null, resultado_pendente: null };
const enviados: unknown[] = [];
(window as unknown as { __enviados: unknown[] }).__enviados = enviados;

const api = {
  identidadeAtual: () => ({ usuario_id: ator, session_id: ator }),
  consultarBarreiraEquipe: async () => vazia,
  encerrarBarreiraEquipe: async () => ({ estado: 'vazia' }),
  reservarBarreiraEquipe: async () => ({ estado: 'aberta' }),
  reconhecerBarreiraEquipe: async () => ({ estado: vazia }),
  listarProfissionais: async () => ({
    itens: [
      {
        id: ator,
        email: 'equipe.ficticia@example.test',
        estado: 'vinculada',
        perfil: 'profissional',
        usuario_id: ator,
        ativo: true,
        versao: 1,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        email: 'admin.ficticio@example.test',
        estado: 'pendente',
        perfil: 'administrador',
        usuario_id: null,
        ativo: false,
        versao: 1,
      },
    ],
    proximo_cursor: null,
  }),
  criarConcessaoEquipe: async (entrada: { perfil: string }) => {
    enviados.push(entrada);
    return {
      id: '33333333-3333-4333-8333-333333333333',
      perfil: entrada.perfil,
      metodo: 'google_workspace',
      estado: 'pendente',
      usuario_id: null,
      versao: 1,
    };
  },
} as unknown as ClienteFFCM;

const raiz = document.getElementById('tela');
if (!raiz) throw new Error('Bancada sem raiz.');
// `?tela=equipe` monta a lista; o padrão é a página própria de convite.
if (new URLSearchParams(location.search).get('tela') === 'equipe')
  createRoot(raiz).render(createElement(TelaConcessaoEquipe, { api: api }));
else createRoot(raiz).render(createElement(TelaConvidarEquipe, { api: api }));
