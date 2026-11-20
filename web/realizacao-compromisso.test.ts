// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { descreverRealizacao, montarRealizacaoAgenda } from './realizacao-compromisso.ts';
import type { RealizacaoCompromisso } from '../packages/contracts/src/realizacao-compromisso.ts';
import type { ServicoRealizacaoCompromisso } from './servico-realizacao-compromisso-http.ts';
import { FalhaApi } from './api.ts';

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

/** O formulário precisa estar no documento: só assim o clique no botão de envio dispara
 * `submit`, como acontece na tela de verdade. */
function montarNoDocumento(): HTMLElement {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  return raiz;
}

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
  const raiz = montarNoDocumento();
  const tela = montarRealizacaoAgenda(raiz, servicoFalso({ registrar }), () => {});
  tela.abrir('evt-a', 'quinta-feira, 10:00');
  const situacao = raiz.querySelector('select') as HTMLSelectElement;
  situacao.value = 'faltou';
  situacao.dispatchEvent(new Event('change'));
  botao(raiz, 'Registrar').click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Informe o motivo da falta'));
  expect(registrar).not.toHaveBeenCalled();
  situacao.value = 'remarcado';
  situacao.dispatchEvent(new Event('change'));
  botao(raiz, 'Registrar').click();
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Informe o identificador do compromisso na nova data'),
  );
  expect(registrar).not.toHaveBeenCalled();
  tela.desmontar();
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
  const raiz = montarNoDocumento();
  let recebidos: readonly RealizacaoCompromisso[] = [];
  const tela = montarRealizacaoAgenda(raiz, servicoFalso({ registrar }), (registros) => {
    recebidos = registros;
  });
  tela.abrir('evt-a', 'quinta-feira, 10:00');
  const situacao = raiz.querySelector('select') as HTMLSelectElement;
  situacao.value = 'faltou';
  situacao.dispatchEvent(new Event('change'));
  const motivo = raiz.querySelector('#realizacao-motivo') as HTMLSelectElement;
  motivo.value = 'transporte';
  botao(raiz, 'Registrar').click();
  await vi.waitFor(() => expect(recebidos.length).toBe(1));
  expect(registrar).toHaveBeenCalledWith({
    evento_id: 'evt-a',
    situacao: 'faltou',
    versao_esperada: 0,
    motivo: 'transporte',
  });
  expect(raiz.textContent).toContain('Situação registrada');
  tela.desmontar();
});

it('retificar parte da versão vigente e avisa que a anterior é preservada', async () => {
  const registrar = vi.fn(async (): Promise<readonly RealizacaoCompromisso[]> => []);
  const raiz = montarNoDocumento();
  const tela = montarRealizacaoAgenda(raiz, servicoFalso({ registrar }), () => {});
  tela.abrir('evt-a', 'quinta-feira, 10:00', {
    ...vazio,
    evento_id: 'evt-a',
    situacao: 'realizado',
    situacao_registrada: 'realizado',
    versao: 2,
  });
  expect(raiz.textContent).toContain('preserva a anterior');
  botao(raiz, 'Registrar').click();
  await vi.waitFor(() => expect(registrar).toHaveBeenCalled());
  expect(registrar).toHaveBeenCalledWith({
    evento_id: 'evt-a',
    situacao: 'realizado',
    versao_esperada: 2,
  });
  tela.desmontar();
});

it('explica conflito de versão e recusa de permissão sem perder o preenchido', async () => {
  const registrar = vi
    .fn<ServicoRealizacaoCompromisso['registrar']>()
    .mockRejectedValueOnce(new FalhaApi('conflito_versao', 409))
    .mockRejectedValueOnce(new FalhaApi('sem_permissao', 403));
  const raiz = montarNoDocumento();
  const tela = montarRealizacaoAgenda(raiz, servicoFalso({ registrar }), () => {});
  tela.abrir('evt-a', 'quinta-feira, 10:00');
  botao(raiz, 'Registrar').click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('mudou enquanto você preenchia'));
  botao(raiz, 'Registrar').click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('não pode registrar a realização'));
  tela.desmontar();
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
  const raiz = montarNoDocumento();
  const tela = montarRealizacaoAgenda(raiz, servicoFalso({ consultar }), () => {});
  const pedido = Array.from({ length: 260 }, (_, indice) => ({ evento_id: `evt-${indice}` }));
  pedido.push({ evento_id: 'evt-sem-resposta' });
  const registros = await tela.consultar(pedido);
  expect(consultar).toHaveBeenCalledTimes(2);
  expect(registros.size).toBe(260);
  expect(registros.has('evt-sem-resposta')).toBe(false);
  expect(descreverRealizacao(registros.get('evt-999'))).toBe('Situação não consultada');
  tela.desmontar();
});
