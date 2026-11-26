import { afterEach, expect, it, vi } from 'vitest';
import * as composicao from './compor-segredos-integracoes-nativo.ts';
import { criarEntradaSegredosIntegracoesNativa } from './entrada-segredos-integracoes-nativa.ts';

const url = 'https://app.example.test/api/admin/segredos-integracoes';
const headers = {
  'x-sessao': '22222222-2222-4222-8222-222222222222',
  'x-chave-idempotencia': 'abcdefghijklmnop',
  'content-type': 'application/json',
};
const dependencias = {} as Parameters<typeof composicao.comporSegredosIntegracoesNativo>[2];
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// A fronteira HTTP deve recusar antes de autenticar no provedor, acessar cofre ou executar RPC.
it('recusa ausência de sessão e content-type inválido antes da composição', async () => {
  const compor = vi.spyOn(composicao, 'comporSegredosIntegracoesNativo');
  const entrada = criarEntradaSegredosIntegracoesNativa(dependencias);
  const semSessao = await entrada.atender(new Request(url));
  expect(semSessao.status).toBe(401);
  expect(await semSessao.json()).toMatchObject({ erro: { codigo: 'nao_autenticado' } });
  const tipoErrado = await entrada.atender(
    new Request(url, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'text/plain' },
      body: '{}',
    }),
  );
  expect(tipoErrado.status).toBe(422);
  expect(tipoErrado.headers.get('cache-control')).toContain('no-store');
  expect(compor).not.toHaveBeenCalled();
});

it('limita bytes do corpo antes de decodificar e cancela a leitura excedente', async () => {
  const compor = vi.spyOn(composicao, 'comporSegredosIntegracoesNativo');
  const cancelar = vi.fn();
  const corpo = new ReadableStream<Uint8Array>({
    start(controlador) {
      controlador.enqueue(new Uint8Array(65_537));
    },
    cancel: cancelar,
  });
  const request = new Request(url, {
    method: 'POST',
    headers,
    body: corpo,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  const resposta = await criarEntradaSegredosIntegracoesNativa(dependencias).atender(request);
  expect(resposta.status).toBe(422);
  expect(await resposta.json()).toMatchObject({ erro: { codigo: 'entrada_invalida' } });
  expect(cancelar).toHaveBeenCalledOnce();
  expect(compor).not.toHaveBeenCalled();
});

it('encerra corpo que não chega no prazo sem iniciar composição', async () => {
  vi.useFakeTimers();
  const compor = vi.spyOn(composicao, 'comporSegredosIntegracoesNativo');
  const cancelar = vi.fn();
  const corpo = new ReadableStream<Uint8Array>({ cancel: cancelar });
  const request = new Request(url, {
    method: 'POST',
    headers,
    body: corpo,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  const pendente = criarEntradaSegredosIntegracoesNativa(dependencias).atender(request);
  await vi.advanceTimersByTimeAsync(15_000);
  const resposta = await pendente;
  expect(resposta.status).toBe(422);
  expect(await resposta.json()).toMatchObject({ erro: { codigo: 'entrada_invalida' } });
  expect(cancelar).toHaveBeenCalledOnce();
  expect(compor).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
