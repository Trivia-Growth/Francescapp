// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { montarRelatoriosTurno } from './turno-execucao-relatorios.js';
import type { ServicoTurnoExecucao } from './servico-turno-execucao-http.ts';
import { FalhaApi } from './api.ts';
const id = '10000000-0000-4000-8000-000000000001';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const botao = (raiz: HTMLElement, texto: string) => {
  const item = [...raiz.querySelectorAll('button')].find((item) => item.textContent === texto);
  if (!item) throw new Error(texto);
  return item;
};
it('família dispõe de turno/diário/semanal e não recebe opção exportação de caso ou localização', () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  montarRelatoriosTurno(raiz, {} as ServicoTurnoExecucao, {
    familia: true,
    acessoPerdido: vi.fn(),
  });
  expect([...raiz.querySelectorAll('select')][0]?.querySelector('option[value="caso"]')).toBeNull();
  expect(
    [...raiz.querySelectorAll('select')][0]?.querySelector('option[value="semanal"]'),
  ).not.toBeNull();
  expect(raiz.querySelector('input[name="latitude"]')).toBeNull();
});
it('PDF usa somente seletores/metadados e resultado perdido exige conferência sem sucesso falso', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const api = {
    relatorio: vi.fn<ServicoTurnoExecucao['relatorio']>().mockImplementation(async (entrada) => ({
      paciente_id: id,
      tipo: entrada.tipo,
      inicio: entrada.inicio ?? '',
      fim: entrada.fim ?? '',
      consulta_id: id,
      instante_corte: '2026-11-19T12:00:00Z',
      rotulos_atuais: true,
      itens: [],
      lacunas: [],
      proximo_cursor: null,
    })),
    pdf: vi
      .fn<ServicoTurnoExecucao['pdf']>()
      .mockRejectedValue(new FalhaApi('pendencia_externa', 0, true)),
    consultarPdf: vi
      .fn<ServicoTurnoExecucao['consultarPdf']>()
      .mockResolvedValue({ exportacao_id: id, registrado_em: '2026-11-19T12:00:00Z' }),
  };
  montarRelatoriosTurno(raiz, api as ServicoTurnoExecucao, { acessoPerdido: vi.fn() });
  botao(raiz, 'Consultar relatório').click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Nenhum registro neste período'));
  const forms = raiz.querySelectorAll('form');
  const campos = forms[1]?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input,textarea',
  );
  if (!campos?.[0] || !campos[1]) throw new Error('Metadados ausentes');
  campos[0].value = 'Destinatário fictício';
  campos[1].value = 'Propósito fictício';
  forms[1]?.requestSubmit();
  await vi.waitFor(() => expect(api.pdf).toHaveBeenCalledOnce());
  const corpo = api.pdf.mock.calls[0]?.[0];
  expect(corpo).not.toHaveProperty('conteudo');
  expect(corpo).not.toHaveProperty('registros');
  expect(corpo).not.toHaveProperty('identidade');
  botao(raiz, 'Conferir emissão anterior de PDF').click();
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain(
      'A emissão anterior foi confirmada, mas o arquivo não foi recebido',
    ),
  );
  expect(api.pdf).toHaveBeenCalledOnce();
  expect(raiz.textContent).not.toContain('entregue para download');
});
it('fundamento revogado limpa relatório na negativa de acesso', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const perdido = vi.fn();
  const api = { relatorio: vi.fn().mockRejectedValue(new FalhaApi('sem_permissao', 403)) };
  montarRelatoriosTurno(raiz, api as unknown as ServicoTurnoExecucao, {
    familia: true,
    acessoPerdido: perdido,
  });
  botao(raiz, 'Consultar relatório').click();
  await vi.waitFor(() => expect(perdido).toHaveBeenCalledOnce());
  expect(raiz.textContent).toBe('');
});

it('novo filtro com erro remove consulta anterior e mantém PDF desabilitado', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const api = {
    relatorio: vi
      .fn<ServicoTurnoExecucao['relatorio']>()
      .mockImplementationOnce(async (entrada) => ({
        paciente_id: id,
        tipo: entrada.tipo,
        inicio: entrada.inicio ?? '',
        fim: entrada.fim ?? '',
        consulta_id: id,
        instante_corte: '2026-11-19T12:00:00Z',
        rotulos_atuais: true,
        itens: [],
        lacunas: [],
        proximo_cursor: null,
      }))
      .mockRejectedValue(new FalhaApi('servico_indisponivel', 503)),
  };
  montarRelatoriosTurno(raiz, api as unknown as ServicoTurnoExecucao, { acessoPerdido: vi.fn() });
  botao(raiz, 'Consultar relatório').click();
  await vi.waitFor(() =>
    expect(botao(raiz, 'Emitir PDF do período consultado').closest('fieldset')?.disabled).toBe(
      false,
    ),
  );
  botao(raiz, 'Consultar relatório').click();
  await vi.waitFor(() => expect(api.relatorio).toHaveBeenCalledTimes(2));
  await vi.waitFor(() =>
    expect(botao(raiz, 'Emitir PDF do período consultado').closest('fieldset')?.disabled).toBe(
      true,
    ),
  );
  expect(raiz.textContent).not.toContain('Corte dos registros:');
});
