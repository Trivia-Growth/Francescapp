// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { montarCascaParaTeste } from './teste-casca.js';

const pacienteId = '10000000-0000-4000-8000-00000000000a';
const sessionId = '20000000-0000-4000-8000-000000000001';
const usuarioId = '30000000-0000-4000-8000-000000000001';
const envelope = (dados: unknown) => Response.json({ dados, request_id: pacienteId });

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
  window.history.replaceState(null, '', '/');
});

/** Fim a fim (não só o componente): a família alcança o Diário da própria ficha e a
 * chamada HTTP real (`servico-diario-http.ts`) passa pela pinagem de fluxo sem ser
 * barrada por exigir modo 'tecnica'/'google' — mesma classe de achado já corrigida em
 * `servico-regras-atendimento-http.ts`. A ficha some sem "Mais seções": as 3 seções da
 * família (dados, diário, plano) aparecem direto, sem dividir em faixa primária/secundária
 * (`destinosPrimarios` exige "visao" para dividir e família não tem). */
it('família abre o Diário na própria ficha (6 seções, sem "Mais seções")', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('modo-acesso', 'familiar');
  sessionStorage.setItem('fluxo-familiar', 'AAAAAAAAAAAAAAAAAAAAAA');
  sessionStorage.setItem('sessao-familiar', sessionId);
  let consultasDiario = 0;
  vi.stubGlobal('fetch', async (entrada: URL | string) => {
    const caminho = typeof entrada === 'string' ? entrada.split('?')[0] : entrada.pathname;
    if (caminho === '/api/familiar/sessao')
      return envelope({
        session_id: sessionId,
        usuario: { id: usuarioId, perfil: 'familia', ativo: true, versao: 1 },
        capacidades: [],
      });
    if (caminho === '/api/familiar/pacientes')
      return envelope({
        itens: [{ id: pacienteId, nome: 'Paciente Vinculado', nome_preferencia: null, versao: 1 }],
        proximo_cursor: null,
      });
    if (caminho === `/api/familiar/pacientes/${pacienteId}`)
      return envelope({ id: pacienteId, nome: 'Paciente Vinculado', nome_preferencia: null });
    if (caminho === `/api/pacientes/${pacienteId}/diario`) {
      consultasDiario += 1;
      return envelope([]);
    }
    throw new Error(`Rota inesperada: ${caminho}`);
  });
  window.history.replaceState(null, '', `/#paciente/${pacienteId}/diario`);
  await montarCascaParaTeste();
  await vi.waitFor(() => expect(consultasDiario).toBe(1));

  const abas = document.querySelectorAll('[role="tab"]');
  expect([...abas].map((aba) => aba.textContent)).toEqual([
    'Dados do paciente',
    'Diário',
    'Relatórios do cuidado',
    'Plano de cuidado',
    'Documentos',
    'Orientações',
  ]);
  expect(document.querySelector('.ficha-mais')).toBeNull();
  expect(document.getElementById('ficha-painel')?.querySelector('h3')?.textContent).toBe(
    'Registrar no diário',
  );
});
