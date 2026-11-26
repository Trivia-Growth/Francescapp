import { expect, it, vi } from 'vitest';
import {
  TAMANHO_MAXIMO_DOCUMENTO,
  TAMANHO_MAXIMO_CORPO_DOCUMENTO,
} from '../../../packages/contracts/src/documento-caso.ts';
import { criarEntradaDocumentoCasoNativa } from './entrada-documento-caso-nativa.ts';
const compor = vi.hoisted(() => vi.fn());
vi.mock('./compor-documento-caso-nativo.ts', () => ({ comporDocumentoCasoNativo: compor }));
it('recusa corpo sem Content-Length acima do teto antes da composição/provider', async () => {
  compor.mockClear();
  const cancelar = vi.fn();
  const corpo = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array(TAMANHO_MAXIMO_CORPO_DOCUMENTO + 1));
    },
    cancel: cancelar,
  });
  const pedido = new Request(
    'https://example.test/api/pacientes/44000000-0000-4000-8000-000000000001/documentos',
    {
      method: 'POST',
      headers: {
        'content-type': 'multipart/form-data; boundary=ficticio',
        'x-sessao': '22000000-0000-4000-8000-000000000001',
        'x-chave-idempotencia': 'chave-ficticia-123456',
      },
      body: corpo,
      duplex: 'half',
    } as RequestInit,
  );
  const deps = {} as Parameters<typeof criarEntradaDocumentoCasoNativa>[0];
  expect((await criarEntradaDocumentoCasoNativa(deps).atender(pedido)).status).toBe(422);
  expect(compor).not.toHaveBeenCalled();
  expect(cancelar).toHaveBeenCalled();
});
it('teto público reserva margem multipart abaixo do limite binário da plataforma', () => {
  expect(TAMANHO_MAXIMO_DOCUMENTO).toBe(4 * 1024 * 1024);
  expect(TAMANHO_MAXIMO_CORPO_DOCUMENTO).toBeGreaterThan(TAMANHO_MAXIMO_DOCUMENTO);
  expect(TAMANHO_MAXIMO_CORPO_DOCUMENTO).toBeLessThan(4.5 * 1024 * 1024);
});

it.each([TAMANHO_MAXIMO_DOCUMENTO, TAMANHO_MAXIMO_DOCUMENTO + 1])(
  'multipart de %i bytes conserva teto do arquivo, incluindo overhead',
  async (tamanho) => {
    compor.mockReset().mockResolvedValue({
      ok: false,
      erro: { codigo: 'sem_permissao' },
      request_id: crypto.randomUUID(),
    });
    const form = new FormData();
    form.set('documento_id', '44000000-0000-4000-8000-000000000002');
    form.set('versao_esperada', '0');
    form.set(
      'metadado',
      JSON.stringify({
        categoria: 'Exame',
        origem: 'Instituição fictícia',
        data_documento: '2026-11-19',
        audiencia: 'equipe',
        estado: 'disponivel',
      }),
    );
    form.set(
      'conteudo',
      JSON.stringify({ nome_visivel: 'ficticio.pdf', drive_file_id: 'pendente' }),
    );
    form.set(
      'arquivo',
      new File([new Uint8Array(tamanho)], 'ficticio.pdf', { type: 'application/pdf' }),
    );
    const pedido = new Request(
      'https://example.test/api/pacientes/44000000-0000-4000-8000-000000000001/documentos',
      {
        method: 'POST',
        headers: {
          'x-sessao': '22000000-0000-4000-8000-000000000001',
          'x-chave-idempotencia': 'chave-ficticia-123456',
        },
        body: form,
      },
    );
    const deps = {} as Parameters<typeof criarEntradaDocumentoCasoNativa>[0];
    const resposta = await criarEntradaDocumentoCasoNativa(deps).atender(pedido);
    expect(resposta.status).toBe(tamanho === TAMANHO_MAXIMO_DOCUMENTO ? 403 : 422);
    expect(compor).toHaveBeenCalledTimes(tamanho === TAMANHO_MAXIMO_DOCUMENTO ? 1 : 0);
  },
);

it.each(['abort', 'length'])('cancela corpo pendente em %s sem composição', async (modo) => {
  compor.mockClear();
  const cancelar = vi.fn();
  const controlador = new AbortController();
  const corpo = new ReadableStream<Uint8Array>({ cancel: cancelar });
  const headers: Record<string, string> = {
    'content-type': 'multipart/form-data; boundary=ficticio',
    'x-sessao': '22000000-0000-4000-8000-000000000001',
    'x-chave-idempotencia': 'chave-ficticia-123456',
  };
  if (modo === 'length') headers['content-length'] = String(TAMANHO_MAXIMO_CORPO_DOCUMENTO + 1);
  const pedido = new Request(
    'https://example.test/api/pacientes/44000000-0000-4000-8000-000000000001/documentos',
    {
      method: 'POST',
      headers,
      body: corpo,
      signal: controlador.signal,
      duplex: 'half',
    } as RequestInit,
  );
  const resposta = criarEntradaDocumentoCasoNativa(
    {} as Parameters<typeof criarEntradaDocumentoCasoNativa>[0],
  ).atender(pedido);
  if (modo === 'abort') controlador.abort();
  expect((await resposta).status).toBe(422);
  expect(cancelar).toHaveBeenCalled();
  expect(compor).not.toHaveBeenCalled();
});

it.each(['length', 'bytes', 'abort', 'timeout'] as const)(
  'responde sem aguardar cancelador pendente em %s',
  async (modo) => {
    compor.mockClear();
    const cancelar = vi.fn(() => new Promise<void>(() => {}));
    const controlador = new AbortController();
    const prazo = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(prazo.signal);
    const corpo = new ReadableStream<Uint8Array>({
      start(c) {
        if (modo === 'bytes') c.enqueue(new Uint8Array(TAMANHO_MAXIMO_CORPO_DOCUMENTO + 1));
      },
      cancel: cancelar,
    });
    const headers: Record<string, string> = {
      'content-type': 'multipart/form-data; boundary=ficticio',
      'x-sessao': '22000000-0000-4000-8000-000000000001',
      'x-chave-idempotencia': 'chave-ficticia-123456',
    };
    if (modo === 'length') headers['content-length'] = String(TAMANHO_MAXIMO_CORPO_DOCUMENTO + 1);
    const pedido = new Request(
      'https://example.test/api/pacientes/44000000-0000-4000-8000-000000000001/documentos',
      {
        method: 'POST',
        headers,
        body: corpo,
        signal: controlador.signal,
        duplex: 'half',
      } as RequestInit,
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const resposta = criarEntradaDocumentoCasoNativa(
        {} as Parameters<typeof criarEntradaDocumentoCasoNativa>[0],
      ).atender(pedido);
      if (modo === 'abort') controlador.abort();
      if (modo === 'timeout') prazo.abort();
      const limite = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Cancelador bloqueou resposta.')), 250);
      });
      expect((await Promise.race([resposta, limite])).status).toBe(422);
      expect(cancelar).toHaveBeenCalled();
      expect(compor).not.toHaveBeenCalled();
    } finally {
      clearTimeout(timer);
      timeout.mockRestore();
    }
  },
);
