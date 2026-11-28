// @vitest-environment jsdom
import { fireEvent } from '@testing-library/dom';
import { expect, it, vi } from 'vitest';
import type { ClienteFFCM } from './api.ts';
import { createElement, type ComponentProps } from 'react';
import { render } from '@testing-library/react';
import { TelaConvidarEquipe } from './convidar-equipe.js';
import { responderConfirmacoes } from './confirmacao-prova.js';
import { chaveDaSessao, clienteConsultas, esquecerConsultas, RECURSO_EQUIPE } from './consultas.js';

function montarConvidarEquipe(
  raiz: HTMLElement,
  api: ComponentProps<typeof TelaConvidarEquipe>['api'],
) {
  return render(createElement(TelaConvidarEquipe, { api }), { container: raiz }).unmount;
}

const ator = '11111111-1111-4111-8111-111111111111';
const reserva = '22222222-2222-4222-8222-222222222222';
const recibo = '33333333-3333-4333-8333-333333333333';
const concessao = '44444444-4444-4444-8444-444444444444';
const vazia = { epoca: 2, reserva: null, resultado_pendente: null };

it('recupera resultado confirmado após recarga antes de permitir nova solicitação', async () => {
  const raiz = document.createElement('div');
  const confirmacoes = responderConfirmacoes(true);
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
  montarConvidarEquipe(raiz, api);
  await vi.waitFor(() => expect(raiz.textContent).toContain('Tudo conferido'));
  expect(confirmacoes.chamadas.join(' ')).toContain('revogada');
  expect(api.reconhecerBarreiraEquipe).toHaveBeenCalledWith({ comando_id: recibo });
  expect(raiz.querySelector('fieldset')?.disabled).toBe(false);
  confirmacoes.encerrar();
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
  montarConvidarEquipe(raiz, api);
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Não foi possível concluir a conferência'),
  );
  expect(api.reconhecerBarreiraEquipe).not.toHaveBeenCalled();
  expect(raiz.querySelector('fieldset')?.disabled).toBe(true);
});

/** API de dublê já liberada: a conferência volta vazia e `criar` registra o que seria
 *  enviado. Só prova o comportamento local da tela; quem autoriza é o servidor. */
function apiLiberada() {
  const criar = vi.fn().mockImplementation(async (entrada: { perfil: string }) => ({
    id: concessao,
    perfil: entrada.perfil,
    metodo: 'google_workspace',
    estado: 'pendente',
    usuario_id: null,
    versao: 1,
  }));
  const api = {
    identidadeAtual: () => ({ usuario_id: ator, session_id: ator }),
    consultarBarreiraEquipe: vi.fn().mockResolvedValue(vazia),
    encerrarBarreiraEquipe: vi.fn().mockResolvedValue({ estado: 'vazia' }),
    reservarBarreiraEquipe: vi.fn().mockResolvedValue({ estado: 'aberta' }),
    criarConcessaoEquipe: criar,
  } as unknown as ClienteFFCM;
  return { api, criar };
}

async function montarLiberada() {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const { api, criar } = apiLiberada();
  const desmontar = montarConvidarEquipe(raiz, api);
  await vi.waitFor(() => expect(raiz.textContent).toContain('Tudo conferido'));
  const campo = (id: string) => raiz.querySelector(`#${id}`) as HTMLInputElement;
  return { raiz, criar, desmontar, campo, form: raiz.querySelector('form') as HTMLFormElement };
}

/** Fronteira de confiança no cliente: envio inválido NÃO chega ao servidor, foca o primeiro
 *  campo inválido NA ORDEM DO DOCUMENTO e mostra um erro por campo. */
it('envio inválido foca o primeiro campo inválido e não chama o servidor', async () => {
  const { raiz, criar, campo, form, desmontar } = await montarLiberada();
  fireEvent.submit(form);
  expect(document.activeElement).toBe(campo('equipe-email'));
  expect(campo('equipe-email').getAttribute('aria-invalid')).toBe('true');
  expect(campo('equipe-motivo').getAttribute('aria-invalid')).toBe('true');
  expect(raiz.querySelector('#equipe-email-erro')?.textContent).toContain('e-mail válido');
  expect(raiz.querySelector('#equipe-motivo-erro')?.textContent).toContain('motivo');
  expect(criar).not.toHaveBeenCalled();
  desmontar();
  raiz.remove();
});

/** Anúncio único: a frase do erro existe uma só vez no documento e fora de qualquer região
 *  viva; o foco, via `aria-describedby`, é o que a entrega ao leitor de tela. */
it('anuncia o erro uma única vez: pelo foco, sem repetir em região viva', async () => {
  const { raiz, campo, form, desmontar } = await montarLiberada();
  fireEvent.submit(form);
  const frase = raiz.querySelector('#equipe-email-erro')?.textContent ?? '';
  expect(frase).not.toBe('');
  expect(campo('equipe-email').getAttribute('aria-describedby')).toContain('equipe-email-erro');
  const vivas = [...raiz.querySelectorAll('[aria-live], [role="alert"], [role="status"]')];
  expect(vivas.some((regiao) => regiao.textContent?.includes(frase))).toBe(false);
  expect(raiz.textContent?.split(frase).length).toBe(2);
  desmontar();
  raiz.remove();
});

it('corrigir o campo limpa o erro dele e mantém o dos outros', async () => {
  const { raiz, campo, form, desmontar } = await montarLiberada();
  fireEvent.submit(form);
  fireEvent.input(campo('equipe-email'), { target: { value: 'pessoa@example.test' } });
  await vi.waitFor(() => expect(campo('equipe-email').hasAttribute('aria-invalid')).toBe(false));
  expect(raiz.querySelector('#equipe-email-erro')?.textContent).toBe('');
  expect(campo('equipe-motivo').getAttribute('aria-invalid')).toBe('true');
  desmontar();
  raiz.remove();
});

it('o payload enviado é exatamente o do contrato, com o e-mail aparado', async () => {
  const { raiz, criar, campo, form, desmontar } = await montarLiberada();
  fireEvent.change(campo('equipe-email'), { target: { value: '  pessoa@example.test ' } });
  fireEvent.change(campo('equipe-motivo'), { target: { value: 'Plantão de sábado' } });
  fireEvent.submit(form);
  await vi.waitFor(() => expect(criar).toHaveBeenCalledTimes(1));
  expect(criar.mock.calls[0]?.[0]).toEqual({
    email: 'pessoa@example.test',
    perfil: 'profissional',
    metodo: 'google_workspace',
    motivo: 'Plantão de sábado',
  });
  desmontar();
  raiz.remove();
});

/** Fatia 9b: convidar envelhece a lista da Equipe guardada. A volta à Equipe não pode
 *  mostrá-la nem pelo instante da releitura. */
it('convidar descarta a lista da Equipe guardada', async () => {
  esquecerConsultas();
  const identidade = { usuario_id: ator, session_id: ator };
  clienteConsultas.setQueryData(chaveDaSessao(identidade, ...RECURSO_EQUIPE), {
    itens: [],
    proximo_cursor: null,
  });
  const { raiz, criar, campo, form, desmontar } = await montarLiberada();
  fireEvent.change(campo('equipe-email'), { target: { value: 'pessoa@example.test' } });
  fireEvent.change(campo('equipe-motivo'), { target: { value: 'Plantão de sábado' } });
  fireEvent.submit(form);
  await vi.waitFor(() => expect(criar).toHaveBeenCalledTimes(1));
  await vi.waitFor(() =>
    expect(
      clienteConsultas.getQueryData(chaveDaSessao(identidade, ...RECURSO_EQUIPE)),
    ).toBeUndefined(),
  );
  desmontar();
  raiz.remove();
});
