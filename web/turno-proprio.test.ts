// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { TelaTurnoProprio } from './turno-proprio.js';
import type { ServicoTurnoHttp } from './servico-turno-http.ts';
import type { Turno } from '../packages/contracts/src/turno.ts';
import { FalhaApi } from './api.ts';

function renderizarTurno(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoTurnoHttp,
  opcoes: ComponentProps<typeof TelaTurnoProprio>['opcoes'],
) {
  const painel = render(createElement(TelaTurnoProprio, { pacienteId, servico, opcoes }), {
    container: raiz,
  });
  return () => painel.rerender(null);
}

const usuario = '10000000-0000-4000-8000-000000000001';
const paciente = '20000000-0000-4000-8000-000000000001';
const turnoId = '30000000-0000-4000-8000-000000000001';
const turno: Turno = {
  turno_id: turnoId,
  paciente_id: paciente,
  profissional_usuario_id: usuario,
  aberto_em: '2026-11-18T12:00:00.000Z',
  encerrado_em: null,
  situacao: 'aberto',
  versao: 1,
  parametros: {
    duracao_padrao_minutos: 60,
    tolerancia_atraso_minutos: 0,
    tratamento_nao_encerrado: 'sinalizar_pendencia',
  },
};
const barreira = { epoca: 7, reserva: null, resultado_pendente: null };
const recibo = {
  recibo_id: usuario,
  reserva_id: usuario,
  resultado: 'confirmada' as const,
  paciente_id: paciente,
  turno_id: turnoId,
  versao_esperada: 0,
};
function preparar() {
  const servico = {
    consultarUltimo: vi.fn<ServicoTurnoHttp['consultarUltimo']>().mockResolvedValue(null),
    consultarEscala: vi.fn<ServicoTurnoHttp['consultarEscala']>(),
    criarEscala: vi.fn<ServicoTurnoHttp['criarEscala']>(),
    alterarEscala: vi.fn<ServicoTurnoHttp['alterarEscala']>(),
    consultarPassagem: vi.fn<ServicoTurnoHttp['consultarPassagem']>().mockResolvedValue({
      identidades: [],
      propria: null,
      anterior: null,
      recebimento: null,
      area_passagem: null,
    }),
    publicarPassagem: vi.fn<ServicoTurnoHttp['publicarPassagem']>(),
    registrarCiencia: vi.fn<ServicoTurnoHttp['registrarCiencia']>(),
    encerrar: vi.fn<ServicoTurnoHttp['encerrar']>(),
    consultarAtual: vi.fn<ServicoTurnoHttp['consultarAtual']>().mockResolvedValue(null),
    consultar: vi.fn<ServicoTurnoHttp['consultar']>().mockResolvedValue(turno),
    consultarBarreira: vi.fn<ServicoTurnoHttp['consultarBarreira']>().mockResolvedValue(barreira),
    reservar: vi.fn<ServicoTurnoHttp['reservar']>().mockResolvedValue({ estado: 'aberta' }),
    abrir: vi.fn<ServicoTurnoHttp['abrir']>().mockResolvedValue(turno),
    encerrarBarreira: vi
      .fn<ServicoTurnoHttp['encerrarBarreira']>()
      .mockResolvedValue({ estado: 'confirmada' }),
    reconhecer: vi
      .fn<ServicoTurnoHttp['reconhecer']>()
      .mockResolvedValue({ estado: 'reconhecido' }),
  };
  const raiz = document.createElement('div');
  document.body.append(raiz);
  return { servico, raiz, acessoPerdido: vi.fn() };
}
/* A espera precisa ceder a vez ao agendador, não só à fila de microtarefas. Medido em
   25/11/2026: o React agenda a repintura de uma atualização vinda de `then`/`await` fora
   de evento numa macrotarefa, então `await Promise.resolve()` repetido voltava com a
   tela ainda no estado anterior. Nenhuma asserção mudou. */
const aguardar = async () => {
  for (let i = 0; i < 15; i++) await new Promise((resolver) => setTimeout(resolver, 0));
};
const botao = (raiz: HTMLElement, texto: string) => {
  const encontrado = [...raiz.querySelectorAll('button')].find(
    (item) => item.textContent === texto,
  );
  if (!encontrado) throw new Error(`Botão ausente no teste: ${texto}`);
  return encontrado;
};
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('apresenta carregamento e vazio confirmado; abertura exige confirmação explícita', async () => {
  const { raiz, servico, acessoPerdido } = preparar();
  renderizarTurno(raiz, paciente, servico, { acessoPerdido });
  expect(raiz.textContent).toContain('Consultando seu turno');
  await aguardar();
  expect(raiz.textContent).toContain('Você não tem turno aberto neste caso');
  expect(botao(raiz, 'Abrir meu turno').disabled).toBe(true);
  expect(servico.abrir).not.toHaveBeenCalled();
});
it('erro não apresenta vazio nem dados de exemplo e permite atualizar', async () => {
  const { raiz, servico, acessoPerdido } = preparar();
  servico.consultarAtual.mockRejectedValueOnce(new Error());
  renderizarTurno(raiz, paciente, servico, { acessoPerdido });
  await aguardar();
  expect(raiz.textContent).toContain('Não foi possível consultar');
  expect(raiz.textContent).not.toContain('Você não tem turno');
  expect(botao(raiz, 'Atualizar turno').disabled).toBe(false);
});
it('desmontagem ignora resposta tardia e limpa conteúdo', async () => {
  const { raiz, servico, acessoPerdido } = preparar();
  let resolver!: (valor: Turno) => void;
  servico.consultarAtual.mockReturnValueOnce(
    new Promise((resolve) => {
      resolver = resolve;
    }),
  );
  const desmontar = renderizarTurno(raiz, paciente, servico, { acessoPerdido });
  await aguardar();
  desmontar();
  resolver(turno);
  await aguardar();
  expect(raiz.textContent).toBe('');
});
it('perda de acesso limpa seção e chama descarte da ficha', async () => {
  const { raiz, servico, acessoPerdido } = preparar();
  servico.consultarAtual.mockRejectedValueOnce(new FalhaApi('sem_permissao', 403));
  renderizarTurno(raiz, paciente, servico, { acessoPerdido });
  await aguardar();
  expect(raiz.textContent).toBe('');
  expect(acessoPerdido).toHaveBeenCalledOnce();
});
it('não reconhece resultado confirmado antes de consulta real bem-sucedida', async () => {
  const { raiz, servico, acessoPerdido } = preparar();
  servico.consultarBarreira.mockResolvedValue({ ...barreira, resultado_pendente: recibo });
  servico.consultar.mockRejectedValueOnce(new Error());
  renderizarTurno(raiz, paciente, servico, { acessoPerdido });
  await aguardar();
  botao(raiz, 'Recuperar operação pendente').click();
  await aguardar();
  expect(servico.reconhecer).not.toHaveBeenCalled();
  expect(raiz.textContent).toContain('Recupere a operação');
});
it('pendência de outro caso preserva recibo e não consulta conteúdo', async () => {
  const { raiz, servico, acessoPerdido } = preparar();
  servico.consultarBarreira.mockResolvedValue({
    ...barreira,
    resultado_pendente: { ...recibo, paciente_id: usuario },
  });
  renderizarTurno(raiz, paciente, servico, { acessoPerdido });
  await aguardar();
  botao(raiz, 'Recuperar operação pendente').click();
  await aguardar();
  expect(servico.consultar).not.toHaveBeenCalled();
  expect(servico.reconhecer).not.toHaveBeenCalled();
  expect(raiz.textContent).toContain('ficha de origem');
});
it('consulta turno próprio real e mantém encerramento indisponível', async () => {
  const { raiz, servico, acessoPerdido } = preparar();
  servico.consultarAtual.mockResolvedValue(turno);
  renderizarTurno(raiz, paciente, servico, { acessoPerdido });
  await aguardar();
  expect(raiz.textContent).toContain('Aberto');
  expect(raiz.textContent).toContain('60 minutos');
  expect(raiz.textContent).toContain('Encerrar exige síntese de passagem publicada');
  expect(botao(raiz, 'Abrir meu turno').hidden).toBe(true);
});
it('recuperação confirmada consulta antes de reconhecer e recarrega turno atual', async () => {
  const { raiz, servico, acessoPerdido } = preparar();
  const ordem: string[] = [];
  servico.consultarBarreira
    .mockResolvedValueOnce({ ...barreira, resultado_pendente: recibo })
    .mockResolvedValueOnce({ ...barreira, resultado_pendente: recibo })
    .mockResolvedValue(barreira);
  servico.consultar.mockImplementation(async () => {
    ordem.push('consultar');
    return turno;
  });
  servico.reconhecer.mockImplementation(async () => {
    ordem.push('reconhecer');
    return { estado: 'reconhecido' };
  });
  servico.consultarAtual.mockResolvedValueOnce(null).mockResolvedValue(turno);
  renderizarTurno(raiz, paciente, servico, { acessoPerdido });
  await aguardar();
  botao(raiz, 'Recuperar operação pendente').click();
  await aguardar();
  expect(ordem).toEqual(['consultar', 'reconhecer']);
  expect(raiz.textContent).toContain('Resultado recuperado');
  expect(raiz.textContent).toContain('Aberto');
});
it('recuperação cancelada não fabrica turno confirmado', async () => {
  const { raiz, servico, acessoPerdido } = preparar();
  const cancelada = {
    ...barreira,
    resultado_pendente: { ...recibo, resultado: 'cancelada' as const },
  };
  servico.consultarBarreira
    .mockResolvedValueOnce(cancelada)
    .mockResolvedValueOnce(cancelada)
    .mockResolvedValue(barreira);
  renderizarTurno(raiz, paciente, servico, { acessoPerdido });
  await aguardar();
  botao(raiz, 'Recuperar operação pendente').click();
  await aguardar();
  expect(servico.consultar).not.toHaveBeenCalled();
  expect(servico.reconhecer).toHaveBeenCalledWith({ comando_id: recibo.recibo_id });
  expect(raiz.textContent).toContain('cancelada sem abrir turno');
  expect(raiz.textContent).toContain('Você não tem turno aberto');
});
it('usa geração recebida do servidor e não repete abertura após resposta perdida', async () => {
  const { raiz, servico, acessoPerdido } = preparar();
  servico.abrir.mockRejectedValueOnce(new FalhaApi('pendencia_externa', 0, true));
  renderizarTurno(raiz, paciente, servico, { acessoPerdido });
  await aguardar();
  const caixa = raiz.querySelector<HTMLInputElement>('input');
  if (!caixa) throw new Error('Confirmação de abertura ausente no teste');
  caixa.checked = true;
  caixa.dispatchEvent(new Event('change'));
  botao(raiz, 'Abrir meu turno').click();
  await aguardar();
  expect(servico.abrir).toHaveBeenCalledWith(
    paciente,
    expect.objectContaining({ geracao_reserva: 7 }),
    expect.any(String),
  );
  expect(raiz.textContent).toContain('Recupere a operação');
  botao(raiz, 'Abrir meu turno').click();
  await aguardar();
  expect(servico.abrir).toHaveBeenCalledTimes(1);
});
it('recarga recupera passagem do último turno encerrado e mantém abertura separada', async () => {
  const { raiz, servico, acessoPerdido } = preparar();
  servico.consultarUltimo.mockResolvedValue({
    ...turno,
    situacao: 'encerrado',
    encerrado_em: '2026-11-18T13:00:00Z',
  });
  renderizarTurno(raiz, paciente, servico, { acessoPerdido });
  await aguardar();
  expect(servico.consultarAtual).toHaveBeenCalledWith(paciente);
  expect(servico.consultarUltimo).toHaveBeenCalledWith(paciente);
  expect(servico.consultarPassagem).toHaveBeenCalledWith(paciente, turnoId);
  expect(raiz.textContent).toContain('Encerrado');
  expect(botao(raiz, 'Abrir meu turno').hidden).toBe(false);
  expect(botao(raiz, 'Abrir meu turno').disabled).toBe(true);
});
