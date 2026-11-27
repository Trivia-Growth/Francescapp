// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  descreverRealizacao,
  consultarRealizacoes,
  RealizacaoAgenda,
  type PunhoRealizacao,
} from './realizacao-compromisso.tsx';
import type { RealizacaoCompromisso } from '../packages/contracts/src/realizacao-compromisso.ts';
import type { ServicoRealizacaoCompromisso } from './servico-realizacao-compromisso-http.ts';
import { FalhaApi } from './api.ts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const vazio = {
  situacao_registrada: null,
  motivo: null,
  observacao: null,
  evento_destino_id: null,
  versao: 0,
  registrado_em: null,
  autor_usuario_id: null,
  registro_id: null,
  remarcado_de: [],
} as const;

function servicoFalso(
  parcial: Partial<ServicoRealizacaoCompromisso>,
): ServicoRealizacaoCompromisso {
  return {
    consultar: async () => [],
    registrar: async () => [],
    ...parcial,
  };
}

function montar(
  servico: ServicoRealizacaoCompromisso,
  aoRegistrar: (registros: readonly RealizacaoCompromisso[]) => void = () => {},
) {
  let punho: PunhoRealizacao | null = null;
  const resultado = render(
    <RealizacaoAgenda
      servico={servico}
      aoRegistrar={aoRegistrar}
      registrar={(recebido) => {
        punho = recebido;
      }}
    />,
  );
  const atual = () => {
    if (!punho) throw new Error('Punho não registrado.');
    return punho;
  };
  return { ...resultado, punho: atual };
}

function botao(raiz: HTMLElement, texto: string): HTMLButtonElement {
  const alvo = [...raiz.querySelectorAll('button')].find((item) => item.textContent === texto);
  if (!alvo) throw new Error(`Botão ausente: ${texto}`);
  return alvo;
}

it('compromisso passado sem registro é não confirmada e nunca falta', () => {
  const registro: RealizacaoCompromisso = {
    ...vazio,
    evento_id: 'evt-a',
    situacao: 'realizacao_nao_confirmada',
  };
  const texto = descreverRealizacao(registro);
  expect(texto).toContain('Realização não confirmada');
  expect(texto).not.toContain('Faltou');
  expect(texto).toContain('isto não é uma falta');
});

it('descreve as duas direções do vínculo entre datas', () => {
  expect(
    descreverRealizacao({
      ...vazio,
      evento_id: 'evt-d',
      situacao: 'remarcado',
      situacao_registrada: 'remarcado',
      evento_destino_id: 'evt-destino',
      versao: 1,
    }),
  ).toContain('Remarcado para o compromisso evt-destino');
  expect(
    descreverRealizacao({
      ...vazio,
      evento_id: 'evt-destino',
      situacao: 'agendado',
      remarcado_de: ['evt-d'],
    }),
  ).toContain('Remarcado a partir de evt-d');
});

it('exige motivo na falta e destino na remarcação antes de enviar', async () => {
  const registrar = vi.fn(async () => []);
  const tela = montar(servicoFalso({ registrar }));
  act(() => {
    tela.punho().abrir('evt-a', 'quinta-feira, 10:00');
  });
  const situacao = tela.container.querySelector('select') as HTMLSelectElement;
  fireEvent.change(situacao, { target: { value: 'faltou' } });
  botao(tela.container, 'Registrar').click();
  await vi.waitFor(() => expect(tela.container.textContent).toContain('Informe o motivo da falta'));
  expect(registrar).not.toHaveBeenCalled();
  fireEvent.change(situacao, { target: { value: 'remarcado' } });
  botao(tela.container, 'Registrar').click();
  await vi.waitFor(() =>
    expect(tela.container.textContent).toContain(
      'Informe o identificador do compromisso na nova data',
    ),
  );
  expect(registrar).not.toHaveBeenCalled();
});

it('registra falta com motivo e devolve a lista atualizada', async () => {
  const registrar = vi.fn(
    async (): Promise<readonly RealizacaoCompromisso[]> => [
      {
        ...vazio,
        evento_id: 'evt-a',
        situacao: 'faltou',
        situacao_registrada: 'faltou',
        motivo: 'transporte',
        versao: 1,
      },
    ],
  );
  let recebidos: readonly RealizacaoCompromisso[] = [];
  const tela = montar(servicoFalso({ registrar }), (registros) => {
    recebidos = registros;
  });
  act(() => {
    tela.punho().abrir('evt-a', 'quinta-feira, 10:00');
  });
  const situacao = tela.container.querySelector('select') as HTMLSelectElement;
  fireEvent.change(situacao, { target: { value: 'faltou' } });
  const motivo = tela.container.querySelector('#realizacao-motivo') as HTMLSelectElement;
  fireEvent.change(motivo, { target: { value: 'transporte' } });
  botao(tela.container, 'Registrar').click();
  await vi.waitFor(() => expect(recebidos.length).toBe(1));
  expect(registrar).toHaveBeenCalledWith({
    evento_id: 'evt-a',
    situacao: 'faltou',
    versao_esperada: 0,
    motivo: 'transporte',
  });
  expect(tela.container.textContent).toContain('Situação registrada');
});

it('retificar parte da versão vigente e avisa que a anterior é preservada', async () => {
  const registrar = vi.fn(async (): Promise<readonly RealizacaoCompromisso[]> => []);
  const tela = montar(servicoFalso({ registrar }));
  act(() => {
    tela.punho().abrir('evt-a', 'quinta-feira, 10:00', {
      ...vazio,
      evento_id: 'evt-a',
      situacao: 'realizado',
      situacao_registrada: 'realizado',
      versao: 2,
    });
  });
  expect(tela.container.textContent).toContain('preserva a anterior');
  botao(tela.container, 'Registrar').click();
  await vi.waitFor(() => expect(registrar).toHaveBeenCalled());
  expect(registrar).toHaveBeenCalledWith({
    evento_id: 'evt-a',
    situacao: 'realizado',
    versao_esperada: 2,
  });
});

it('explica conflito de versão e recusa de permissão sem perder o preenchido', async () => {
  const registrar = vi
    .fn<ServicoRealizacaoCompromisso['registrar']>()
    .mockRejectedValueOnce(new FalhaApi('conflito_versao', 409))
    .mockRejectedValueOnce(new FalhaApi('sem_permissao', 403));
  const tela = montar(servicoFalso({ registrar }));
  act(() => {
    tela.punho().abrir('evt-a', 'quinta-feira, 10:00');
  });
  botao(tela.container, 'Registrar').click();
  await vi.waitFor(() =>
    expect(tela.container.textContent).toContain('mudou enquanto você preenchia'),
  );
  botao(tela.container, 'Registrar').click();
  await vi.waitFor(() =>
    expect(tela.container.textContent).toContain('não pode registrar a realização'),
  );
});

it('consulta em lotes e devolve apenas o que o servidor respondeu', async () => {
  const consultar = vi.fn(
    async (eventos: readonly { evento_id: string }[]): Promise<readonly RealizacaoCompromisso[]> =>
      eventos
        .filter((item) => item.evento_id !== 'evt-sem-resposta')
        .map((item) => ({
          ...vazio,
          evento_id: item.evento_id,
          situacao: 'realizacao_nao_confirmada' as const,
        })),
  );
  const servico = servicoFalso({ consultar });
  const pedido = Array.from({ length: 260 }, (_, indice) => ({ evento_id: `evt-${indice}` }));
  pedido.push({ evento_id: 'evt-sem-resposta' });
  const registros = await consultarRealizacoes(servico, pedido);
  expect(consultar).toHaveBeenCalledTimes(2);
  expect(registros.size).toBe(260);
  expect(registros.has('evt-sem-resposta')).toBe(false);
  expect(descreverRealizacao(registros.get('evt-999'))).toBe('Situação não consultada');
});
