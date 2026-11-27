// @vitest-environment jsdom
/* O módulo não tinha prova nenhuma antes da migração. Estas duas cobrem o que custaria
 * caro se regredisse: a perda de acesso precisa esvaziar a superfície (nenhuma foto de
 * outro caso fica na tela), e um envio de resultado incerto só pode ser repetido IGUAL —
 * mesmo `anexo_id`, mesma chave — e nunca antes de consultar todas as páginas. */
import { expect, it, vi } from 'vitest';
import type { RegistroExecucaoPublico } from '../packages/contracts/src/turno-execucao-http.ts';
import { FalhaApi } from './api.ts';
import type { ServicoTurnoExecucao } from './servico-turno-execucao-http.ts';
import { montarAnexosOcorrencia } from './turno-execucao-arquivos.js';

const id = '40000000-0000-4000-8000-000000000001';
const registro = {
  registro_id: id,
  versao: 1,
  conteudo: { classe: 'ocorrencia' },
} as unknown as RegistroExecucaoPublico;

const botao = (raiz: HTMLElement, texto: string) => {
  const achado = [...raiz.querySelectorAll('button')].find((item) => item.textContent === texto);
  if (!achado) throw new Error(`Botão ausente: ${texto}`);
  return achado;
};

it('perda de acesso na consulta esvazia a superfície e avisa quem hospeda', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const perdido = vi.fn();
  const api = { anexos: vi.fn().mockRejectedValue(new FalhaApi('sem_permissao', 403)) };
  montarAnexosOcorrencia(raiz, registro, api as unknown as ServicoTurnoExecucao, {
    podeAnexar: true,
    acessoPerdido: perdido,
  });
  botao(raiz, 'Consultar fotos').click();
  await vi.waitFor(() => expect(perdido).toHaveBeenCalledOnce());
  expect(raiz.textContent).toBe('');
});

it('envio incerto só se repete igual, e só depois de consultar todas as páginas', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const pendente = vi.fn();
  const api = {
    enviarAnexo: vi
      .fn<ServicoTurnoExecucao['enviarAnexo']>()
      .mockRejectedValueOnce(new FalhaApi('pendencia_externa', 0, true))
      .mockResolvedValue(undefined as never),
    anexos: vi
      .fn<ServicoTurnoExecucao['anexos']>()
      .mockResolvedValue({ itens: [], proximo_cursor: null }),
  };
  montarAnexosOcorrencia(raiz, registro, api as unknown as ServicoTurnoExecucao, {
    podeAnexar: true,
    acessoPerdido: vi.fn(),
    alteracaoPendente: pendente,
  });
  const arquivo = raiz.querySelector<HTMLInputElement>('input[type="file"]');
  const audiencia = raiz.querySelector<HTMLSelectElement>('select[name="audiencia"]');
  if (!arquivo || !audiencia) throw new Error('Formulário ausente');
  const foto = new File([new Uint8Array([1, 2, 3])], 'foto.png', { type: 'image/png' });
  // O jsdom não implementa `Blob.arrayBuffer`; o navegador implementa.
  Object.defineProperty(foto, 'arrayBuffer', {
    value: async () => new Uint8Array([1, 2, 3]).buffer,
  });
  Object.defineProperty(arquivo, 'files', { value: [foto] });
  audiencia.value = 'equipe';
  // `required` no arquivo: o jsdom não considera `files` substituído, então o envio vai direto.
  raiz.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(api.enviarAnexo).toHaveBeenCalledOnce());
  const repetir = botao(raiz, 'Repetir o mesmo envio de foto');
  await vi.waitFor(() => expect(repetir.hidden).toBe(false));
  expect(repetir.disabled).toBe(true);
  botao(raiz, 'Consultar fotos').click();
  await vi.waitFor(() => expect(repetir.disabled).toBe(false));
  repetir.click();
  await vi.waitFor(() => expect(api.enviarAnexo).toHaveBeenCalledTimes(2));
  const [primeiro, segundo] = api.enviarAnexo.mock.calls;
  expect(segundo?.[0]).toEqual(primeiro?.[0]);
  expect(segundo?.[1]).toBe(primeiro?.[1]);
  await vi.waitFor(() => expect(pendente).toHaveBeenLastCalledWith(false));
});
