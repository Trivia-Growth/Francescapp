// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarConcessaoEquipe } from './concessao-equipe.ts';
import type { ClienteFFCM } from './api.ts';

const ator = '11111111-1111-4111-8111-111111111111';
const reserva = '22222222-2222-4222-8222-222222222222';
const recibo = '33333333-3333-4333-8333-333333333333';
const concessao = '44444444-4444-4444-8444-444444444444';
const vazia = { epoca: 2, reserva: null, resultado_pendente: null };

it('recupera resultado confirmado após recarga antes de permitir nova solicitação', async () => {
  const raiz = document.createElement('div');
  const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
  const api = {
    identidadeAtual: () => ({ usuario_id: ator, session_id: ator }),
    consultarBarreiraEquipe: vi
      .fn()
      .mockResolvedValueOnce({
        epoca: 2,
        reserva: null,
        resultado_pendente: {
          recibo_id: recibo,
          reserva_id: reserva,
          resultado: 'confirmada',
          concessao_id: concessao,
        },
      })
      .mockResolvedValue(vazia),
    listarProfissionais: vi.fn().mockResolvedValue({
      itens: [
        {
          id: concessao,
          email: 'equipe@example.test',
          estado: 'revogada',
          perfil: 'profissional',
          versao: 2,
        },
      ],
      proximo_cursor: null,
    }),
    reconhecerBarreiraEquipe: vi.fn().mockResolvedValue({ estado: 'reconhecido' }),
  } as unknown as ClienteFFCM;
  montarConcessaoEquipe(raiz, api);
  await vi.waitFor(() => expect(raiz.textContent).toContain('Tudo conferido'));
  expect(confirmar).toHaveBeenCalledWith(expect.stringContaining('revogada'));
  expect(api.reconhecerBarreiraEquipe).toHaveBeenCalledWith({ comando_id: recibo });
  expect(raiz.querySelector('fieldset')?.disabled).toBe(false);
  confirmar.mockRestore();
});

it('não reconhece resultado que não foi identificado', async () => {
  const raiz = document.createElement('div');
  const api = {
    identidadeAtual: () => ({ usuario_id: ator, session_id: ator }),
    consultarBarreiraEquipe: vi.fn().mockResolvedValue({
      epoca: 2,
      reserva: null,
      resultado_pendente: {
        recibo_id: recibo,
        reserva_id: reserva,
        resultado: 'confirmada',
        concessao_id: concessao,
      },
    }),
    listarProfissionais: vi.fn().mockResolvedValue({ itens: [], proximo_cursor: null }),
    reconhecerBarreiraEquipe: vi.fn(),
  } as unknown as ClienteFFCM;
  montarConcessaoEquipe(raiz, api);
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Não foi possível concluir a conferência'),
  );
  expect(api.reconhecerBarreiraEquipe).not.toHaveBeenCalled();
  expect(raiz.querySelector('fieldset')?.disabled).toBe(true);
});

/** A área da equipe mostrava só o formulário de convite: não havia como ver quem já tem
 * acesso. A lista não concede nada — o servidor e o banco continuam autorizando cada
 * consulta —, mas sem ela a administração decidia às cegas. */
it('lista quem já tem acesso concedido, com estado por linha e caso vazio', async () => {
  const raiz = document.createElement('div');
  const api = {
    identidadeAtual: () => ({ usuario_id: ator, session_id: ator }),
    consultarBarreiraEquipe: vi.fn().mockResolvedValue(vazia),
    listarProfissionais: vi.fn().mockResolvedValue({
      itens: [
        {
          id: concessao,
          email: 'equipe@example.test',
          estado: 'pendente',
          perfil: 'administrador',
          usuario_id: null,
          ativo: false,
          versao: 1,
        },
      ],
      proximo_cursor: null,
    }),
    reconhecerBarreiraEquipe: vi.fn(),
  } as unknown as ClienteFFCM;
  montarConcessaoEquipe(raiz, api);

  const lista = raiz.querySelector('.lista-registros') as HTMLElement;
  expect(lista.getAttribute('aria-busy')).toBe('true');

  await vi.waitFor(() => expect(lista.childElementCount).toBe(1));
  expect(lista.hasAttribute('aria-busy')).toBe(false);
  const linha = lista.firstElementChild as HTMLElement;
  expect(linha.textContent).toContain('equipe@example.test');
  expect(linha.textContent).toContain('Administrador');
  expect(linha.textContent).toContain('Conta desativada');
  // A marca de estado fecha a linha para ficar sempre na mesma coluna.
  expect(linha.lastElementChild?.textContent).toBe('Convite pendente');
  expect(raiz.textContent).toContain('1 pessoas com acesso concedido.');
});

it('diz que a equipe não pôde ser carregada em vez de ficar com a lista muda', async () => {
  const raiz = document.createElement('div');
  const api = {
    identidadeAtual: () => ({ usuario_id: ator, session_id: ator }),
    consultarBarreiraEquipe: vi.fn().mockResolvedValue(vazia),
    listarProfissionais: vi.fn().mockRejectedValue(new Error('indisponível')),
    reconhecerBarreiraEquipe: vi.fn(),
  } as unknown as ClienteFFCM;
  montarConcessaoEquipe(raiz, api);
  await vi.waitFor(() => expect(raiz.textContent).toContain('Não foi possível carregar a equipe'));
  const lista = raiz.querySelector('.lista-registros') as HTMLElement;
  expect(lista.hasAttribute('aria-busy')).toBe(false);
  expect(lista.childElementCount).toBe(0);
});
