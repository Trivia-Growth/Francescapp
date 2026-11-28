// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { createElement, createRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { aguardarConfirmacao, responderConfirmacoes } from './confirmacao-prova.js';
import {
  TelaConversaoDiario,
  type ComandoConversaoDiario,
  type PortasConversaoDiario,
} from './conversao-diario.js';
import { criarCicloTarefaCuidado } from './ciclo-tarefa-cuidado.ts';
import { registroDiarioSchema } from '../packages/contracts/src/diario.ts';
import type { consultaBarreiraTarefaSchema } from '../packages/contracts/src/barreira-tarefa-cuidado.ts';
import type { ReciboConversaoDiarioTarefa } from '../packages/contracts/src/conversao-diario-tarefa.ts';

const paciente = 'c0000000-0000-4000-8000-000000000003';
const usuario = 'a0000000-0000-4000-8000-000000000001';
const sessao = 'b0000000-0000-4000-8000-000000000002';
const origem = registroDiarioSchema.parse({
  diario_registro_id: 'd0000000-0000-4000-8000-000000000004',
  registro_id: 'e0000000-0000-4000-8000-000000000005',
  versao: 1,
  tipo: 'evolucao_profissional',
  autor_usuario_id: usuario,
  estado: 'publicado',
  audiencia: 'equipe_e_familia',
  atencao: false,
  retorno_solicitado: false,
  origem_conteudo: 'texto',
  responde_registro_id: null,
  tarefa_id: null,
  criado_em: '2026-11-18T12:00:00Z',
  consultas: 0,
  conteudo: {
    data: '2026-11-18',
    area: 'Área fictícia',
    atividade: 'Conteúdo original que não será copiado.',
  },
});
const recibo: ReciboConversaoDiarioTarefa = {
  conversao_id: 'f0000000-0000-4000-8000-000000000006',
  paciente_id: paciente,
  origem_id: origem.diario_registro_id,
  origem_versao: 1,
  tarefa_id: '10000000-0000-4000-8000-000000000007',
  evolucao_id: '20000000-0000-4000-8000-000000000008',
  ator_usuario_id: usuario,
  registrado_em: '2026-11-18T12:00:00Z',
};
function montarConversaoDiario(
  raiz: HTMLElement,
  pacienteId: string,
  registro: typeof origem,
  portas: PortasConversaoDiario,
  pendente: (valor: boolean) => void,
  aoConcluir: () => void,
) {
  const comando = createRef<ComandoConversaoDiario>();
  const painel = render(
    createElement(TelaConversaoDiario, {
      pacienteId,
      origem: registro,
      portas,
      pendente,
      aoConcluir,
      comando,
    }),
    { container: raiz },
  );
  return {
    desmontar: () => painel.rerender(null),
    invalidarOrigem: () => act(() => comando.current?.invalidarOrigem()),
  };
}

let desmontar: (() => void) | undefined;
afterEach(() => {
  desmontar?.();
  desmontar = undefined;
  vi.restoreAllMocks();
});

function preparar() {
  let atual = true;
  let resultado: ReciboConversaoDiarioTarefa | null = null;
  let situacao: ReturnType<typeof consultaBarreiraTarefaSchema.parse> = {
    epoca: 1,
    reserva: null,
    resultado_pendente: null,
  };
  const contexto = vi.fn(async () => ({ escrita_disponivel: true, areas: ['Área fictícia'] }));
  const consultar = vi.fn(async () => resultado);
  const converter = vi.fn<PortasConversaoDiario['converter']>(async () => {
    resultado = recibo;
    return recibo;
  });
  const encerrar = vi.fn(async () => {
    situacao = { epoca: situacao.epoca + 1, reserva: null, resultado_pendente: null };
    return 'cancelada';
  });
  const reconhecer = vi.fn(async () => {
    situacao = { ...situacao, resultado_pendente: null };
    return 'reconhecido';
  });
  const pendente = vi.fn();
  const concluido = vi.fn();
  const portas: PortasConversaoDiario = {
    atual: () => atual,
    contexto,
    consultar,
    converter,
    acessoPerdido: vi.fn(),
    desmontar: vi.fn(),
    criarCiclo: (gravar) =>
      criarCicloTarefaCuidado({
        identidadeAtual: () => (atual ? { usuario_id: usuario, session_id: sessao } : null),
        consultar: async () => situacao,
        reservar: async (entrada) => {
          situacao = { ...situacao, reserva: { id: entrada.reserva_id, estado: 'aberta' } };
          return 'aberta';
        },
        encerrar,
        reconhecer,
        gravar,
      }),
  };
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const montagem = montarConversaoDiario(raiz, paciente, origem, portas, pendente, concluido);
  desmontar = montagem.desmontar;
  return {
    raiz,
    montagem,
    portas,
    contexto,
    consultar,
    converter,
    encerrar,
    reconhecer,
    pendente,
    concluido,
    alterarConta: () => {
      atual = false;
    },
    reciboExistente: () => {
      resultado = recibo;
    },
    resultadoAnterior: () => {
      situacao = {
        ...situacao,
        resultado_pendente: {
          recibo_id: recibo.conversao_id,
          reserva_id: recibo.evolucao_id,
          resultado: 'confirmada',
          paciente_id: paciente,
          tarefa_id: recibo.tarefa_id,
          versao_esperada: 0,
        },
      };
    },
  };
}
function botao(raiz: HTMLElement, texto: string) {
  const encontrado = [...raiz.querySelectorAll('button')].find(
    (item) => item.textContent === texto,
  );
  if (!encontrado) throw new Error(`Botão ausente: ${texto}`);
  return encontrado;
}
function campo(raiz: HTMLElement, texto: string) {
  const label = [...raiz.querySelectorAll('label')].find((item) =>
    item.textContent?.startsWith(texto),
  );
  const controle = label?.querySelector('input,textarea,select');
  if (
    !(
      controle instanceof HTMLInputElement ||
      controle instanceof HTMLTextAreaElement ||
      controle instanceof HTMLSelectElement
    )
  )
    throw new Error('Campo ausente');
  return controle;
}
function preencher(raiz: HTMLElement) {
  for (const [nome, valor] of [
    ['Motivo', 'Motivo fictício'],
    ['Data da atenção', '2026-11-18'],
    ['Encaminhamento', 'Ação fictícia'],
    ['Responsável', 'Profissional fictício'],
    ['Prazo', '2026-11-20'],
    ['Prioridade', 'media'],
    ['Área', 'Área fictícia'],
  ]) {
    const controle = campo(raiz, nome);
    controle.value = valor;
    controle.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
async function abrir(raiz: HTMLElement) {
  botao(raiz, 'Sinalizar atenção e converter em tarefa').click();
  await vi.waitFor(() => expect(raiz.querySelector('form')?.hidden).toBe(false));
}

it('exige campos explícitos, sem prioridade/área padrão, e chama só porta atômica', async () => {
  const p = preparar();
  await abrir(p.raiz);
  expect(campo(p.raiz, 'Prioridade').value).toBe('');
  expect(campo(p.raiz, 'Área').value).toBe('');
  p.raiz.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(p.converter).not.toHaveBeenCalled();
  preencher(p.raiz);
  botao(p.raiz, 'Criar ação e evolução interna').click();
  await vi.waitFor(() => expect(p.concluido).toHaveBeenCalledTimes(1));
  expect(p.converter).toHaveBeenCalledTimes(1);
  expect(p.converter.mock.calls[0]?.[0]).toMatchObject({
    motivo: 'Motivo fictício',
    data_atencao: '2026-11-18',
    encaminhamento: 'Ação fictícia',
    responsavel: 'Profissional fictício',
    prioridade: 'media',
    area: 'Área fictícia',
    origem_versao: 1,
    geracao_reserva: expect.any(Number),
  });
  expect(JSON.stringify(p.converter.mock.calls)).not.toContain('Conteúdo original');
  expect(p.raiz.textContent).toContain('Isto não envia retorno à família');
  expect(p.pendente).toHaveBeenLastCalledWith(false);
});

it('recibo existente mostra ação sem criar ou cercar tarefa nova', async () => {
  const p = preparar();
  p.reciboExistente();
  botao(p.raiz, 'Sinalizar atenção e converter em tarefa').click();
  await vi.waitFor(() => expect(p.raiz.textContent).toContain('já foi convertido'));
  expect(p.encerrar).not.toHaveBeenCalled();
  expect(p.converter).not.toHaveBeenCalled();
});

it('ausência após falha não libera repetição antes de encerrar e consultar de novo', async () => {
  const p = preparar();
  await abrir(p.raiz);
  preencher(p.raiz);
  p.converter.mockRejectedValueOnce(new Error('resposta perdida'));
  botao(p.raiz, 'Criar ação e evolução interna').click();
  await vi.waitFor(() => expect(p.raiz.textContent).toContain('Não repita'));
  expect(botao(p.raiz, 'Criar ação e evolução interna').disabled).toBe(true);
  const antes = p.encerrar.mock.calls.length;
  botao(p.raiz, 'Conferir envio anterior').click();
  await vi.waitFor(() =>
    expect(botao(p.raiz, 'Criar ação e evolução interna').disabled).toBe(false),
  );
  expect(p.encerrar).toHaveBeenCalledTimes(antes + 1);
  expect(p.consultar.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
    p.encerrar.mock.invocationCallOrder.at(-1) ?? 0,
  );
  expect(p.converter).toHaveBeenCalledTimes(1);
});

it('resultado de Tarefas anterior requer reconhecimento sem atribuí-lo à origem', async () => {
  const p = preparar();
  p.resultadoAnterior();
  botao(p.raiz, 'Sinalizar atenção e converter em tarefa').click();
  await vi.waitFor(() => expect(p.raiz.textContent).toContain('Um envio anterior foi salvo'));
  expect(p.raiz.textContent).not.toContain('Este registro já foi convertido');
  botao(p.raiz, 'Entendi, conferir e liberar').click();
  await vi.waitFor(() => expect(p.raiz.querySelector('form')?.hidden).toBe(false));
  expect(p.reconhecer).toHaveBeenCalledTimes(1);
  expect(p.converter).not.toHaveBeenCalled();
});

it.each(['capacidade', 'areas'] as const)('bloqueia contexto ausente: %s', async (tipo) => {
  const p = preparar();
  p.contexto.mockResolvedValue({
    escrita_disponivel: tipo !== 'capacidade',
    areas: tipo === 'areas' ? [] : ['Área fictícia'],
  });
  botao(p.raiz, 'Sinalizar atenção e converter em tarefa').click();
  await vi.waitFor(() => expect(p.contexto).toHaveBeenCalled());
  expect(p.raiz.querySelector('form')?.hidden).toBe(true);
  expect(p.converter).not.toHaveBeenCalled();
});

it('troca de conta descarta resposta tardia e desmontagem limpa formulário', async () => {
  const p = preparar();
  let resolver!: (recibo: ReciboConversaoDiarioTarefa | null) => void;
  p.consultar.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolver = resolve;
      }),
  );
  botao(p.raiz, 'Sinalizar atenção e converter em tarefa').click();
  await vi.waitFor(() => expect(p.consultar).toHaveBeenCalled());
  p.alterarConta();
  resolver(recibo);
  await Promise.resolve();
  await Promise.resolve();
  expect(p.raiz.textContent).not.toContain('Este registro já foi convertido');
  desmontar?.();
  desmontar = undefined;
  expect(p.raiz.textContent).toBe('');
  expect(p.portas.desmontar).toHaveBeenCalled();
});

it('invalidação da origem preserva campos mas impede envio da versão antiga', async () => {
  const p = preparar();
  await abrir(p.raiz);
  preencher(p.raiz);
  p.montagem.invalidarOrigem();
  expect(campo(p.raiz, 'Motivo').value).toBe('Motivo fictício');
  expect(botao(p.raiz, 'Criar ação e evolução interna').disabled).toBe(true);
  expect(p.raiz.textContent).toContain('O registro de origem mudou');
  p.raiz.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(p.converter).not.toHaveBeenCalled();
});

it('resposta perdida com ledger confirmado recupera recibo sem segunda conversão', async () => {
  const p = preparar();
  await abrir(p.raiz);
  preencher(p.raiz);
  p.converter.mockImplementationOnce(async () => {
    p.reciboExistente();
    throw new Error('resposta perdida');
  });
  botao(p.raiz, 'Criar ação e evolução interna').click();
  await vi.waitFor(() => expect(p.raiz.textContent).toContain('Não repita'));
  botao(p.raiz, 'Conferir envio anterior').click();
  await vi.waitFor(() => expect(p.raiz.textContent).toContain('Este registro já foi convertido'));
  expect(p.converter).toHaveBeenCalledTimes(1);
});

it('recarga sem ledger cerca reserva anterior e não recupera texto pelo navegador', async () => {
  const p = preparar();
  await abrir(p.raiz);
  preencher(p.raiz);
  p.converter.mockRejectedValueOnce(new Error('resposta perdida'));
  botao(p.raiz, 'Criar ação e evolução interna').click();
  await vi.waitFor(() => expect(p.raiz.textContent).toContain('Não repita'));
  p.montagem.desmontar();
  const escreverStorage = vi.spyOn(Storage.prototype, 'setItem');
  const antes = p.encerrar.mock.calls.length;
  const nova = montarConversaoDiario(p.raiz, paciente, origem, p.portas, p.pendente, p.concluido);
  desmontar = nova.desmontar;
  await abrir(p.raiz);
  expect(p.encerrar).toHaveBeenCalledTimes(antes + 1);
  expect(campo(p.raiz, 'Motivo').value).toBe('');
  expect(campo(p.raiz, 'Prioridade').value).toBe('');
  expect(p.converter).toHaveBeenCalledTimes(1);
  expect(escreverStorage).not.toHaveBeenCalled();
});

it('fechar formulário sujo exige confirmação e preserva texto quando recusada', async () => {
  const p = preparar();
  await abrir(p.raiz);
  preencher(p.raiz);
  const confirmacoes = responderConfirmacoes(false);
  botao(p.raiz, 'Fechar conversão').click();
  await aguardarConfirmacao();
  expect(confirmacoes.chamadas).toHaveLength(1);
  expect(campo(p.raiz, 'Motivo').value).toBe('Motivo fictício');
  confirmacoes.resposta = true;
  botao(p.raiz, 'Fechar conversão').click();
  await aguardarConfirmacao();
  expect(campo(p.raiz, 'Motivo').value).toBe('');
  expect(p.pendente).toHaveBeenLastCalledWith(false);
  confirmacoes.encerrar();
});
