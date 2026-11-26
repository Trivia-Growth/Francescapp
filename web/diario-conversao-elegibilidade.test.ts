// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { aguardarConfirmacao, responderConfirmacoes } from './confirmacao-prova.js';
import { montarDiario, type ConversaoEmTarefa } from './diario.js';
import { registroDiarioSchema, type RegistroDiario } from '../packages/contracts/src/diario.ts';

const paciente = 'c0000000-0000-4000-8000-000000000003';
const profissional = 'a0000000-0000-4000-8000-000000000001';
const familia = 'b0000000-0000-4000-8000-000000000002';
function registro(indice = 1, parcial: Partial<RegistroDiario> = {}) {
  return registroDiarioSchema.parse({
    diario_registro_id: `d0000000-0000-4000-8000-00000000000${indice}`,
    registro_id: `e0000000-0000-4000-8000-00000000000${indice}`,
    versao: 1,
    tipo: 'evolucao_profissional',
    autor_usuario_id: profissional,
    estado: 'publicado',
    audiencia: 'equipe_e_familia',
    atencao: false,
    retorno_solicitado: false,
    origem_conteudo: 'texto',
    responde_registro_id: null,
    tarefa_id: null,
    criado_em: '2026-11-18T12:00:00Z',
    consultas: 0,
    conteudo: { data: '2026-11-18', area: 'Área fictícia', atividade: 'Texto fictício' },
    ...parcial,
  });
}

it('oferece conversão atômica em relato/evolução publicados próprios ou alheios; nunca rascunho', async () => {
  const itens = [
    registro(),
    registro(2, { autor_usuario_id: familia }),
    registro(3, {
      tipo: 'relato_familiar',
      autor_usuario_id: familia,
      audiencia: 'equipe',
      conteudo: { dataAcontecimento: '2026-11-18', descricao: 'Relato fictício' },
    }),
    registro(4, { estado: 'rascunho' }),
  ];
  const montar = vi.fn<ConversaoEmTarefa>(() => ({ desmontar: vi.fn(), invalidarOrigem: vi.fn() }));
  const raiz = document.createElement('div');
  const desmontar = montarDiario(
    raiz,
    paciente,
    profissional,
    { consultar: async () => itens, salvar: vi.fn() },
    () => ['Área fictícia'],
    vi.fn(),
    vi.fn(),
    montar,
  );
  await vi.waitFor(() => expect(montar).toHaveBeenCalledTimes(3));
  expect(montar.mock.calls.map((chamada) => chamada[1].diario_registro_id)).toEqual(
    itens.slice(0, 3).map((item) => item.diario_registro_id),
  );
  desmontar();
});

it('família nunca recebe conversão mesmo que porta seja fornecida por engano', async () => {
  const montar = vi.fn<ConversaoEmTarefa>(() => ({ desmontar: vi.fn(), invalidarOrigem: vi.fn() }));
  const consultar = vi.fn(async () => [registro()]);
  const desmontar = montarDiario(
    document.createElement('div'),
    paciente,
    familia,
    { consultar, salvar: vi.fn() },
    () => [],
    vi.fn(),
    vi.fn(),
    montar,
    undefined,
    true,
  );
  await vi.waitFor(() => expect(consultar).toHaveBeenCalled());
  expect(montar).not.toHaveBeenCalled();
  desmontar();
});

it('versão alterada bloqueia montagem antiga e só descarta campos após ação explícita', async () => {
  let item = registro();
  const invalidar = vi.fn();
  const limpar = vi.fn();
  const montar = vi.fn<ConversaoEmTarefa>((raiz) => {
    const campo = document.createElement('textarea');
    campo.value = 'Motivo ainda não enviado';
    raiz.append(campo);
    return { desmontar: limpar, invalidarOrigem: invalidar };
  });
  const raiz = document.createElement('div');
  const desmontar = montarDiario(
    raiz,
    paciente,
    profissional,
    { consultar: async () => [item], salvar: vi.fn() },
    () => ['Área fictícia'],
    vi.fn(),
    vi.fn(),
    montar,
  );
  await vi.waitFor(() => expect(montar).toHaveBeenCalledTimes(1));
  montar.mock.calls[0]?.[2](true);
  item = registro(1, { versao: 2, estado: 'retificado', justificativa: 'Correção fictícia' });
  montar.mock.calls[0]?.[3]();
  await vi.waitFor(() => expect(invalidar).toHaveBeenCalled());
  expect(montar).toHaveBeenCalledTimes(1);
  expect(
    [...raiz.querySelectorAll('textarea')].some(
      (campo) => campo.value === 'Motivo ainda não enviado',
    ),
  ).toBe(true);
  const reabrir = [...raiz.querySelectorAll('button')].find(
    (botao) => botao.textContent === 'Descartar campos e usar versão atual',
  );
  const confirmacoes = responderConfirmacoes(false);
  reabrir?.click();
  await aguardarConfirmacao();
  expect(limpar).not.toHaveBeenCalled();
  confirmacoes.resposta = true;
  reabrir?.click();
  await aguardarConfirmacao();
  expect(limpar).toHaveBeenCalledTimes(1);
  expect(montar).toHaveBeenCalledTimes(2);
  expect(montar.mock.calls[1]?.[1].versao).toBe(2);
  desmontar();
  confirmacoes.encerrar();
});
