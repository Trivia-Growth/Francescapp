// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { criarServicoDocumentosHttp } from './servico-documentos-http.ts';
import { montarDocumentosCaso } from './documentos-caso.tsx';
import { FalhaApi } from './api.ts';

const paciente = 'c0000000-0000-4000-8000-000000000003';
const documento = 'd0000000-0000-4000-8000-000000000004';
const identidade = {
  usuario_id: 'a0000000-0000-4000-8000-000000000001',
  session_id: 'b0000000-0000-4000-8000-000000000002',
};
afterEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each(['google', 'tecnica', 'familiar'])(
  'download usa rota do app e fluxo %s sem URL Drive',
  async (modo) => {
    sessionStorage.setItem('modo-acesso', modo);
    sessionStorage.setItem(
      modo === 'tecnica'
        ? 'fluxo-tecnico'
        : modo === 'familiar'
          ? 'fluxo-familiar'
          : 'fluxo-google',
      'a'.repeat(22),
    );
    const fetch = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1]), {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment; filename="documento"',
        },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const blob = await criarServicoDocumentosHttp(() => identidade).baixar?.(paciente, documento);
    expect(blob?.size).toBe(1);
    expect(fetch.mock.calls[0]?.[0]).toBe(
      `/api/pacientes/${paciente}/documentos/${documento}/arquivo`,
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      headers: { 'x-sessao': identidade.session_id, 'x-fluxo': 'a'.repeat(22) },
      cache: 'no-store',
      redirect: 'error',
    });
  },
);

it('troca de identidade durante download descarta bytes', async () => {
  sessionStorage.setItem('modo-acesso', 'familiar');
  sessionStorage.setItem('fluxo-familiar', 'a'.repeat(22));
  let atual: typeof identidade | null = identidade;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => {
      atual = null;
      return new Response(new Uint8Array([1]), {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment;',
        },
      });
    }),
  );
  await expect(
    criarServicoDocumentosHttp(() => atual).baixar?.(paciente, documento),
  ).rejects.toMatchObject({ codigo: 'nao_autenticado' });
});

it.each(['familia', 'equipe'])(
  'tela %s não cria link quando servidor nega download',
  async (perfil) => {
    const criar = vi.fn();
    const acessoPerdido = vi.fn();
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = criar;
        static revokeObjectURL = vi.fn();
      },
    );
    const raiz = document.createElement('div');
    const desmontar = montarDocumentosCaso(
      raiz,
      paciente,
      {
        consultar: async () => [
          {
            documento_id: documento,
            registro_id: documento,
            versao: 1,
            categoria: 'Laudo',
            audiencia: 'equipe_e_familia',
            estado: 'disponivel',
            nome_visivel: 'ficticio.pdf',
            drive_file_id: 'nunca-usado-na-ui',
          },
        ],
        gravar: async () => [],
        baixar: async () => {
          throw new FalhaApi('sem_permissao', 403);
        },
      },
      () => ['Laudo'],
      acessoPerdido,
      () => {},
      perfil === 'familia',
    );
    await vi.waitFor(() => expect(raiz.textContent).toContain('Baixar arquivo'));
    const botao = [...raiz.querySelectorAll('button')].find(
      (item) => item.textContent === 'Baixar arquivo',
    );
    botao?.click();
    await vi.waitFor(() => expect(acessoPerdido).toHaveBeenCalledTimes(1));
    expect(criar).not.toHaveBeenCalled();
    expect(raiz.querySelector('a')).toBeNull();
    desmontar();
  },
);

it('família baixa somente via Blob local e desmontagem revoga capacidade temporária', async () => {
  vi.useFakeTimers();
  const criar = vi.fn().mockReturnValue('blob:https://exemplo.test/ficticio');
  const revogar = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = criar;
      static revokeObjectURL = revogar;
    },
  );
  const clicar = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const raiz = document.createElement('div');
  const baixar = vi
    .fn()
    .mockResolvedValue(new Blob(['ficticio'], { type: 'application/octet-stream' }));
  const desmontar = montarDocumentosCaso(
    raiz,
    paciente,
    {
      consultar: async () => [
        {
          documento_id: documento,
          registro_id: documento,
          versao: 1,
          categoria: 'Laudo',
          audiencia: 'equipe_e_familia',
          estado: 'disponivel',
          nome_visivel: 'ficticio.pdf',
          drive_file_id: 'nunca-usado-na-ui',
        },
      ],
      gravar: async () => [],
      baixar,
    },
    () => [],
    () => {},
    () => {},
    true,
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Baixar arquivo'));
  const botao = raiz.querySelector('button');
  botao?.click();
  await vi.waitFor(() => expect(clicar).toHaveBeenCalledTimes(1));
  expect(baixar).toHaveBeenCalledExactlyOnceWith(paciente, documento);
  expect(criar).toHaveBeenCalledTimes(1);
  expect(raiz.querySelector('a')).toBeNull();
  desmontar();
  expect(revogar).toHaveBeenCalledWith('blob:https://exemplo.test/ficticio');
  vi.runOnlyPendingTimers();
});
