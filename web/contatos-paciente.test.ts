// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { responderConfirmacoes } from './confirmacao-prova.js';
import { TelaContatoPaciente } from './contatos-paciente.js';
import type { ClienteFFCM } from './api.ts';

function montarContatoPaciente(
  raiz: HTMLElement,
  pacienteId: string,
  api: ClienteFFCM,
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void,
) {
  return render(
    createElement(TelaContatoPaciente, {
      pacienteId,
      api,
      identidade,
      acessoPerdido,
      alteracaoPendente,
    }),
    { container: raiz },
  );
}

const id = '10000000-0000-4000-8000-000000000001';
const outro = '10000000-0000-4000-8000-000000000002';
const identidade = { usuario_id: id, session_id: id };
const paciente = {
  id,
  nome: 'Paciente fictício',
  nome_preferencia: null,
  data_nascimento: null,
  versao: 1,
  contatos: [{ id, tipo: 'email', valor: 'pessoa@example.test', versao: 1 }],
};
afterEach(() => vi.restoreAllMocks());
function montarApi(estado: unknown) {
  return {
    identidadeAtual: () => identidade,
    consultarBarreiraContato: vi
      .fn()
      .mockResolvedValueOnce(estado)
      .mockResolvedValue({ epoca: 2, reserva: null, resultado_pendente: null }),
    encerrarBarreiraContato: vi.fn().mockResolvedValue({ estado: 'vazia' }),
    reconhecerBarreiraContato: vi.fn().mockResolvedValue({ estado: 'reconhecido' }),
    consultarPaciente: vi.fn().mockResolvedValue(paciente),
  };
}
it('não encerra reserva aberta sem confirmação', async () => {
  const confirmacoes = responderConfirmacoes(false);
  const api = montarApi({ epoca: 1, reserva: { id, estado: 'aberta' }, resultado_pendente: null });
  const raiz = document.createElement('div');
  montarContatoPaciente(raiz, id, api as unknown as ClienteFFCM, vi.fn(), vi.fn());
  await vi.waitFor(() => expect(confirmacoes.chamadas).toHaveLength(1));
  expect(confirmacoes.chamadas[0]).toContain('Encerrar a tentativa em andamento?');
  expect(api.encerrarBarreiraContato).not.toHaveBeenCalled();
  expect(raiz.querySelector('fieldset')?.disabled).toBe(true);
  confirmacoes.encerrar();
});
it('não reconhece resultado de outro paciente', async () => {
  const api = montarApi({
    epoca: 2,
    reserva: null,
    resultado_pendente: {
      recibo_id: id,
      reserva_id: id,
      resultado: 'confirmada',
      paciente_id: outro,
      contato_id: id,
    },
  });
  const raiz = document.createElement('div');
  montarContatoPaciente(raiz, id, api as unknown as ClienteFFCM, vi.fn(), vi.fn());
  await vi.waitFor(() => expect(raiz.textContent).toContain('outro paciente'));
  expect(api.reconhecerBarreiraContato).not.toHaveBeenCalled();
  expect(raiz.textContent).not.toContain(outro);
});
it('exige conferência do contato correspondente antes de reconhecer', async () => {
  const confirmacoes = responderConfirmacoes(false);
  const api = montarApi({
    epoca: 2,
    reserva: null,
    resultado_pendente: {
      recibo_id: id,
      reserva_id: id,
      resultado: 'confirmada',
      paciente_id: id,
      contato_id: id,
    },
  });
  const raiz = document.createElement('div');
  montarContatoPaciente(raiz, id, api as unknown as ClienteFFCM, vi.fn(), vi.fn());
  await vi.waitFor(() => expect(confirmacoes.chamadas).toHaveLength(1));
  expect(api.reconhecerBarreiraContato).not.toHaveBeenCalled();
  confirmacoes.resposta = true;
  [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Conferir novamente')?.click();
  await vi.waitFor(() => expect(api.reconhecerBarreiraContato).toHaveBeenCalledOnce());
  confirmacoes.encerrar();
});
