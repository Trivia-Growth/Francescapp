// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarExecucaoTurno } from './turno-execucao.js';
import { montarEditorExecucao } from './turno-execucao-editor.js';
import { apresentarRegistroTurno } from './turno-execucao-leitura.js';
import type { ServicoTurnoExecucao } from './servico-turno-execucao-http.ts';
import type { RegistroExecucaoPublico } from '../packages/contracts/src/turno-execucao-http.ts';
import { FalhaApi } from './api.ts';
const usuario = '10000000-0000-4000-8000-000000000001';
const paciente = '20000000-0000-4000-8000-000000000001';
const turnoId = '30000000-0000-4000-8000-000000000001';
const id = '40000000-0000-4000-8000-000000000001';
const turno = {
  turno_id: turnoId,
  paciente_id: paciente,
  profissional_usuario_id: usuario,
  aberto_em: '2026-11-19T12:00:00Z',
  encerrado_em: null,
  situacao: 'aberto' as const,
  versao: 1,
  parametros: {
    duracao_padrao_minutos: 60,
    tolerancia_atraso_minutos: 0,
    tratamento_nao_encerrado: 'sinalizar_pendencia' as const,
  },
};
const registro: RegistroExecucaoPublico = {
  paciente_id: paciente,
  turno_id: turnoId,
  registro_id: id,
  versao: 1,
  registrador_usuario_id: usuario,
  registrador_nome: 'Registrador fictício',
  criado_em: '2026-11-19T12:30:00Z',
  instante_ocorrencia: '2026-11-19T12:20:00Z',
  retificada: false,
  conteudo: {
    classe: 'afericao',
    dados: {
      turno_id: turnoId,
      tipo: 'temperatura',
      valor: 36,
      unidade: '°C',
      instante_afericao: '2026-11-19T12:20:00Z',
    },
  },
};
const catalogo = [
  {
    tipo: 'temperatura',
    unidade: '°C',
    ativo: true,
    observacao: false,
    referencia_informativa: null,
  },
];
/* O rótulo mora dentro do controle na camada imperativa ainda em uso por
 * `turno-execucao.ts` (o filtro de série), e como IRMÃO do controle no envelope React de
 * `turno-execucao-editor.tsx` (`EnvelopeCampo`, em `web/componentes/ui/campo.tsx`) — a
 * mesma estrutura que os outros módulos já migrados desta área usam. Esta prova exercita
 * as duas camadas no mesmo arquivo, então o auxiliar confere a aninhada primeiro e cai
 * para o irmão quando não encontra. */
const campo = (raiz: HTMLElement, nome: string) => {
  const rotulo = [...raiz.querySelectorAll('label')].find(
    (item) => item.firstChild?.textContent === nome,
  );
  const controle =
    rotulo?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input,textarea,select',
    ) ??
    rotulo?.parentElement?.querySelector<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >('input,textarea,select');
  if (!controle) throw new Error(`Campo ausente: ${nome}`);
  return controle;
};
const botao = (raiz: HTMLElement, nome: string) => {
  const controle = [...raiz.querySelectorAll('button')].find((item) => item.textContent === nome);
  if (!controle) throw new Error(`Botão ausente: ${nome}`);
  return controle;
};
function servico() {
  return {
    reconciliar: vi
      .fn<ServicoTurnoExecucao['reconciliar']>()
      .mockResolvedValue({ epoca: 1, resultado_pendente: null }),
    reconhecer: vi
      .fn<ServicoTurnoExecucao['reconhecer']>()
      .mockResolvedValue({ epoca: 1, resultado_pendente: null }),
    catalogo: vi.fn<ServicoTurnoExecucao['catalogo']>().mockResolvedValue(catalogo),
    consultar: vi
      .fn<ServicoTurnoExecucao['consultar']>()
      .mockResolvedValue({ itens: [], proximo_cursor: null }),
    gravar: vi.fn<ServicoTurnoExecucao['gravar']>().mockImplementation(async (entrada) => ({
      ...registro,
      recibo_id: id,
      registro_id: entrada.registro_id,
      versao: entrada.versao_esperada + 1,
      conteudo: entrada.conteudo,
    })),
  };
}
it('resposta perdida exige reconciliar; consulta anterior vazia não permite retry antigo nem nova intenção automática', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const api = servico();
  api.gravar.mockRejectedValueOnce(new FalhaApi('pendencia_externa', 0, true));
  api.reconciliar
    .mockResolvedValueOnce({ epoca: 1, resultado_pendente: null })
    .mockResolvedValue({ epoca: 2, resultado_pendente: null });
  const desmontar = montarExecucaoTurno(raiz, paciente, turno, api as ServicoTurnoExecucao, {
    usuarioId: usuario,
    administrador: false,
    acessoPerdido: vi.fn(),
    alteracaoPendente: vi.fn(),
  });
  await vi.waitFor(() => expect(raiz.textContent).toContain('Catálogo consultado'));
  botao(raiz, 'Registrar aferição').click();
  await vi.waitFor(() => expect(raiz.querySelector('.turno-execucao__editor')).not.toBeNull());
  campo(raiz, 'Tipo de aferição').value = 'temperatura';
  campo(raiz, 'Valor aferido').value = '36';
  campo(raiz, 'Data e horário da aferição').value = '2026-11-19T12:20';
  raiz.querySelector<HTMLFormElement>('.turno-execucao__editor')?.requestSubmit();
  await vi.waitFor(() => expect(api.gravar).toHaveBeenCalledOnce());
  expect(api.gravar.mock.calls[0]?.[0].epoca).toBe(1);
  expect(botao(raiz, 'Registrar aferição').disabled).toBe(true);
  botao(raiz, 'Conferir registro enviado').click();
  await vi.waitFor(() => expect(api.reconciliar).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(botao(raiz, 'Registrar aferição').disabled).toBe(false));
  expect(api.gravar).toHaveBeenCalledOnce();
  expect(raiz.querySelector('.turno-execucao__editor')).toBeNull();
  desmontar();
});
it('reload preserva barreira durável de outro caso; somente reconhecimento explícito libera intenção', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const api = servico();
  api.reconciliar.mockResolvedValue({
    epoca: 3,
    resultado_pendente: {
      recibo_id: id,
      paciente_id: '20000000-0000-4000-8000-000000000099',
      classe: 'ocorrencia',
      registro_id: id,
      versao: 1,
      registrado_em: '2026-11-19T13:00:00Z',
    },
  });
  api.reconhecer.mockResolvedValue({ epoca: 3, resultado_pendente: null });
  const desmontar = montarExecucaoTurno(raiz, paciente, turno, api as ServicoTurnoExecucao, {
    usuarioId: usuario,
    administrador: false,
    acessoPerdido: vi.fn(),
    alteracaoPendente: vi.fn(),
  });
  await vi.waitFor(() => expect(raiz.textContent).toContain('Outro caso'));
  expect(botao(raiz, 'Registrar aferição').disabled).toBe(true);
  expect(api.consultar).not.toHaveBeenCalled();
  expect(api.gravar).not.toHaveBeenCalled();
  botao(raiz, 'Reconhecer recibo conferido e liberar novo registro').click();
  await vi.waitFor(() =>
    expect(api.reconhecer).toHaveBeenCalledWith({ epoca: 3, recibo_id: id }, expect.any(String)),
  );
  await vi.waitFor(() => expect(botao(raiz, 'Registrar aferição').disabled).toBe(false));
  desmontar();
});
it('última versão2 continua retificável para versão3 e prescrição admite profissional distinto', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const api = servico();
  const atual = { ...registro, versao: 2, retificada: true };
  api.consultar.mockResolvedValue({ itens: [atual], proximo_cursor: null });
  const desmontar = montarExecucaoTurno(raiz, paciente, turno, api as ServicoTurnoExecucao, {
    usuarioId: usuario,
    administrador: false,
    acessoPerdido: vi.fn(),
    alteracaoPendente: vi.fn(),
  });
  await vi.waitFor(() => expect(raiz.textContent).toContain('Catálogo consultado'));
  botao(raiz, 'Consultar série').click();
  await vi.waitFor(() => expect(botao(raiz, 'Retificar preservando o original')).toBeTruthy());
  botao(raiz, 'Retificar preservando o original').click();
  await vi.waitFor(() => expect(campo(raiz, 'Motivo da retificação')).toBeTruthy());
  campo(raiz, 'Motivo da retificação').value = 'Correção de transcrição';
  raiz.querySelector<HTMLFormElement>('.turno-execucao__editor')?.requestSubmit();
  await vi.waitFor(() => expect(api.gravar).toHaveBeenCalled());
  expect(api.gravar.mock.calls[0]?.[0].versao_esperada).toBe(2);
  desmontar();
});
it('sem turno aberto oferece séries/prescrição e mantém novas aferições indisponíveis', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const api = servico();
  const desmontar = montarExecucaoTurno(raiz, paciente, null, api as ServicoTurnoExecucao, {
    usuarioId: usuario,
    administrador: false,
    acessoPerdido: vi.fn(),
    alteracaoPendente: vi.fn(),
  });
  await vi.waitFor(() => expect(raiz.textContent).toContain('Catálogo consultado'));
  expect(botao(raiz, 'Registrar aferição').disabled).toBe(true);
  expect(botao(raiz, 'Registrar medicação prescrita').disabled).toBe(false);
  desmontar();
});
it('retificação de administração conserva prescrição histórica travada e executor declarado', () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const enviar = vi.fn();
  const original: RegistroExecucaoPublico = {
    ...registro,
    conteudo: {
      classe: 'administracao',
      dados: {
        turno_id: turnoId,
        item_id: id,
        versao: 2,
        executor: { nome: 'Executor externo original', vinculo: 'Enfermagem declarada' },
        situacao: 'administrado',
      },
    },
  };
  montarEditorExecucao(
    raiz,
    'administracao',
    { turnoId, catalogo, prescricoes: [], atual: original },
    { enviar, cancelar: vi.fn(), alteracaoPendente: vi.fn() },
  );
  expect(campo(raiz, 'Item prescrito e versão').disabled).toBe(true);
  expect(campo(raiz, 'Quem administrou — nome declarado').value).toBe('Executor externo original');
  campo(raiz, 'Motivo da retificação').value = 'Correção humana';
  raiz.querySelector('form')?.requestSubmit();
  expect(enviar).toHaveBeenCalledWith(original.conteudo, 'Correção humana');
  const historico = document.createElement('div');
  historico.append(
    apresentarRegistroTurno(original),
    apresentarRegistroTurno({ ...original, versao: 2, motivo: 'Correção humana' }),
  );
  expect(historico.textContent).toContain(
    'Executor declarado — quem administrou: Executor externo original',
  );
  expect(historico.textContent).toContain('Registrador: Registrador fictício');
});
it('registro de rotina não preenche valor a partir de histórico e rejeita conjunto adulterado', () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const enviar = vi.fn();
  montarEditorExecucao(
    raiz,
    'rotina',
    { turnoId, catalogo, prescricoes: [] },
    { enviar, cancelar: vi.fn(), alteracaoPendente: vi.fn() },
  );
  const tipo = campo(raiz, 'Observação de rotina');
  tipo.value = 'hidratacao';
  tipo.dispatchEvent(new Event('change'));
  expect(campo(raiz, 'Volume informado (mL)').value).toBe('');
  tipo.value = 'valor_inventado';
  raiz.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(enviar).not.toHaveBeenCalled();
});
it('revogação na consulta limpa conteúdo, sem confundir falha com vazio', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const api = servico();
  const perdido = vi.fn();
  api.consultar.mockRejectedValue(new FalhaApi('sem_permissao', 403));
  const desmontar = montarExecucaoTurno(raiz, paciente, turno, api as ServicoTurnoExecucao, {
    usuarioId: usuario,
    administrador: false,
    acessoPerdido: perdido,
    alteracaoPendente: vi.fn(),
  });
  await vi.waitFor(() => expect(raiz.textContent).toContain('Catálogo consultado'));
  botao(raiz, 'Consultar série').click();
  await vi.waitFor(() => expect(perdido).toHaveBeenCalledOnce());
  expect(raiz.textContent).toBe('');
  desmontar();
});

it('conferência não apaga rascunho ainda não enviado', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const api = servico();
  const desmontar = montarExecucaoTurno(raiz, paciente, turno, api as ServicoTurnoExecucao, {
    usuarioId: usuario,
    administrador: false,
    acessoPerdido: vi.fn(),
    alteracaoPendente: vi.fn(),
  });
  await vi.waitFor(() => expect(raiz.textContent).toContain('Catálogo consultado'));
  botao(raiz, 'Registrar aferição').click();
  await vi.waitFor(() => expect(campo(raiz, 'Valor aferido')).toBeTruthy());
  campo(raiz, 'Valor aferido').value = '37';
  campo(raiz, 'Valor aferido').dispatchEvent(new Event('input', { bubbles: true }));
  expect(botao(raiz, 'Conferir envios antes de novo registro').disabled).toBe(true);
  botao(raiz, 'Conferir envios antes de novo registro').click();
  expect(api.reconciliar).toHaveBeenCalledOnce();
  expect(campo(raiz, 'Valor aferido').value).toBe('37');
  desmontar();
});
it('prescrição externa corrente permite solicitar retificação por outro profissional vinculado', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const api = servico();
  const prescricao: RegistroExecucaoPublico = {
    ...registro,
    turno_id: null,
    registrador_usuario_id: '10000000-0000-4000-8000-000000000099',
    conteudo: {
      classe: 'prescricao',
      dados: {
        nome: 'Item fictício',
        dose: 'Dose transcrita',
        via: 'Via transcrita',
        horarios: ['12:00:00'],
        vigencia_inicio: '2026-11-19T12:00:00Z',
        vigencia_fim: null,
        fonte_documental: 'Documento externo fictício',
      },
    },
  };
  api.consultar.mockResolvedValue({ itens: [prescricao], proximo_cursor: null });
  const desmontar = montarExecucaoTurno(raiz, paciente, turno, api as ServicoTurnoExecucao, {
    usuarioId: usuario,
    administrador: false,
    acessoPerdido: vi.fn(),
    alteracaoPendente: vi.fn(),
  });
  await vi.waitFor(() => expect(raiz.textContent).toContain('Catálogo consultado'));
  campo(raiz, 'Tipo de registro').value = 'prescricao';
  botao(raiz, 'Consultar série').click();
  await vi.waitFor(() => expect(botao(raiz, 'Retificar preservando o original')).toBeTruthy());
  botao(raiz, 'Retificar preservando o original').click();
  await vi.waitFor(() => expect(campo(raiz, 'Motivo da retificação')).toBeTruthy());
  expect(api.gravar).not.toHaveBeenCalled();
  desmontar();
});
