// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { montarDocumentosCaso } from './documentos-caso.ts';
import { criarServicoDocumentosHttp, type ServicoDocumentos } from './servico-documentos-http.ts';
import { FalhaApi } from './api.ts';
import type { DocumentoCaso } from '../packages/contracts/src/documento-caso.ts';
function exigir<T>(valor: T | null | undefined): T {
  if (valor === null || valor === undefined) throw new Error('Pré-condição do teste ausente.');
  return valor;
}
const paciente = 'c0000000-0000-4000-8000-000000000003';
const atual: DocumentoCaso = {
  documento_id: 'd0000000-0000-4000-8000-000000000004',
  registro_id: 'e0000000-0000-4000-8000-000000000005',
  versao: 2,
  categoria: 'Laudo',
  origem: 'Origem fictícia',
  data_documento: '2026-11-01',
  audiencia: 'equipe_e_familia',
  estado: 'disponivel',
  nome_visivel: 'ficticio.pdf',
  drive_file_id: 'arquivo-ficticio',
  descricao: 'Descrição preservada',
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
async function montar(gravar: ServicoDocumentos['gravar'], familiar = false) {
  const raiz = document.createElement('div');
  const acessoPerdido = vi.fn();
  const consultar = vi.fn(async () => [atual]);
  const desmontar = montarDocumentosCaso(
    raiz,
    paciente,
    { consultar, gravar },
    () => ['Laudo'],
    acessoPerdido,
    () => {},
    familiar,
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('ficticio.pdf'));
  return { raiz, acessoPerdido, consultar, desmontar };
}
it('edita audiência, estado e metadados da versão atual sem arquivo nem perda do conteúdo', async () => {
  const gravar = vi
    .fn<ServicoDocumentos['gravar']>()
    .mockResolvedValue([{ ...atual, versao: 3, audiencia: 'equipe', estado: 'indisponivel' }]);
  const { raiz, desmontar } = await montar(gravar);
  const editor = exigir(raiz.querySelector('details form'));
  const selects = editor.querySelectorAll('select');
  exigir(selects[1]).value = 'equipe';
  exigir(selects[2]).value = 'indisponivel';
  editor.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(gravar).toHaveBeenCalledTimes(1));
  const entrada = exigir(gravar.mock.calls[0])[1];
  expect(entrada).toMatchObject({
    documento_id: atual.documento_id,
    versao_esperada: 2,
    chave_idempotencia: expect.any(String),
    metadado: {
      categoria: atual.categoria,
      origem: atual.origem,
      data_documento: atual.data_documento,
      audiencia: 'equipe',
      estado: 'indisponivel',
    },
    conteudo: {
      nome_visivel: atual.nome_visivel,
      drive_file_id: atual.drive_file_id,
      descricao: atual.descricao,
    },
  });
  expect(entrada.arquivo).toBeUndefined();
  expect(editor.querySelector('input[type=file]')).toBeNull();
  desmontar();
});
it('família não recebe controles de edição de metadados', async () => {
  const gravar = vi.fn<ServicoDocumentos['gravar']>();
  const { raiz, desmontar } = await montar(gravar, true);
  expect(raiz.querySelector('details')).toBeNull();
  expect(gravar).not.toHaveBeenCalled();
  desmontar();
});
it('resultado incerto preserva mesma chave, comando e versão para replay sem arquivo', async () => {
  const gravar = vi
    .fn<ServicoDocumentos['gravar']>()
    .mockRejectedValueOnce(new FalhaApi('servico_indisponivel', 0))
    .mockResolvedValueOnce([{ ...atual, versao: 3 }]);
  const { raiz, desmontar } = await montar(gravar);
  const form = exigir(raiz.querySelector('details form'));
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(raiz.textContent).toContain('Repetir mesma alteração'));
  expect(
    [...form.querySelectorAll('input,select')].every(
      (campo) => (campo as HTMLInputElement).disabled,
    ),
  ).toBe(true);
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(gravar).toHaveBeenCalledTimes(2));
  expect(exigir(gravar.mock.calls[1])[1]).toEqual(exigir(gravar.mock.calls[0])[1]);
  expect(exigir(gravar.mock.calls[1])[1].arquivo).toBeUndefined();
  desmontar();
});
it('negativa do servidor durante edição descarta acesso e dados da tela', async () => {
  const gravar = vi
    .fn<ServicoDocumentos['gravar']>()
    .mockRejectedValue(new FalhaApi('sem_permissao', 403));
  const { raiz, acessoPerdido, desmontar } = await montar(gravar);
  exigir(raiz.querySelector('details form')).dispatchEvent(
    new Event('submit', { cancelable: true }),
  );
  await vi.waitFor(() => expect(acessoPerdido).toHaveBeenCalledTimes(1));
  expect(raiz.childElementCount).toBe(0);
  desmontar();
});
it('HTTP preserva chave explícita e classifica resposta perdida de edição como incerta', async () => {
  sessionStorage.setItem('modo-acesso', 'interno');
  sessionStorage.setItem('fluxo-interno', 'a'.repeat(22));
  const fetch = vi.fn().mockRejectedValue(new Error('resposta perdida'));
  vi.stubGlobal('fetch', fetch);
  const servico = criarServicoDocumentosHttp(() => ({
    usuario_id: atual.documento_id,
    session_id: atual.registro_id,
  }));
  const entrada = {
    documento_id: atual.documento_id,
    versao_esperada: atual.versao,
    chave_idempotencia: 'chave-edicao-ficticia',
    metadado: { categoria: atual.categoria, audiencia: atual.audiencia, estado: atual.estado },
    conteudo: { nome_visivel: atual.nome_visivel, drive_file_id: atual.drive_file_id },
  };
  await expect(servico.gravar(paciente, entrada)).rejects.toMatchObject({
    codigo: 'servico_indisponivel',
    status: 0,
  });
  expect((exigir(fetch.mock.calls[0])[1].headers as Headers).get('x-chave-idempotencia')).toBe(
    entrada.chave_idempotencia,
  );
});

it('categoria do editor vem do catálogo e preserva categoria histórica retirada', async () => {
  const gravar = vi.fn<ServicoDocumentos['gravar']>();
  const raiz = document.createElement('div');
  const desmontar = montarDocumentosCaso(
    raiz,
    paciente,
    { consultar: async () => [atual], gravar },
    () => ['Receita'],
    () => {},
    () => {},
    false,
  );
  await vi.waitFor(() => expect(raiz.querySelector('details form select')).not.toBeNull());
  const categoria = exigir(raiz.querySelector<HTMLSelectElement>('details form select'));
  expect([...categoria.options].map((o) => [o.value, o.text])).toEqual([
    ['Laudo', 'Laudo (categoria anterior, preservada)'],
    ['Receita', 'Receita'],
  ]);
  expect(categoria.value).toBe('Laudo');
  expect(raiz.querySelector('details form input[required]')).toBeNull();
  desmontar();
});

it('upload acima de4MiB é recusado na interface antes do serviço', async () => {
  const gravar = vi.fn<ServicoDocumentos['gravar']>();
  const { raiz, desmontar } = await montar(gravar);
  const arquivo = exigir(raiz.querySelector<HTMLInputElement>('input[type="file"]'));
  Object.defineProperty(arquivo, 'files', {
    value: [new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'ficticio.pdf')],
  });
  const form = exigir(arquivo.closest('form'));
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  expect(raiz.textContent).toContain('até 4 MiB');
  expect(gravar).not.toHaveBeenCalled();
  desmontar();
});
