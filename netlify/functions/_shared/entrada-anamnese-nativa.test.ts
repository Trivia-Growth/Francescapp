import { afterEach, describe, expect, it, vi } from 'vitest';
import * as composicao from './compor-anamnese-nativa.ts';
import { criarEntradaAnamneseNativa } from './entrada-anamnese-nativa.ts';

const paciente = '11111111-1111-4111-8111-111111111111';
const sessao = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const dependencias = {} as Parameters<typeof composicao.comporAnamneseNativa>[2];
const url = `https://app.example.test/api/pacientes/${paciente}/anamnese`;
afterEach(() => vi.restoreAllMocks());

describe('entrada interna de anamnese', () => {
  it('encaminha leitura e mantém resposta privada', async () => {
    const compor = vi
      .spyOn(composicao, 'comporAnamneseNativa')
      .mockResolvedValue({ ok: true, dados: null, request_id: requestId });
    const request = new Request(url, { headers: { 'x-sessao': sessao } });
    const resposta = await criarEntradaAnamneseNativa(dependencias).atender(request);
    expect(await resposta.json()).toEqual({ dados: null, request_id: requestId });
    expect(resposta.headers.get('cache-control')).toContain('no-store');
    expect(compor).toHaveBeenCalledWith(
      expect.any(Request),
      { operacao: 'ler', paciente_id: paciente },
      dependencias,
    );
  });
  it('encaminha mutação validada e origem para composição', async () => {
    const compor = vi
      .spyOn(composicao, 'comporAnamneseNativa')
      .mockResolvedValue({ ok: true, dados: { versao: 1, secoes: [] }, request_id: requestId });
    const request = new Request(url, {
      method: 'PATCH',
      headers: {
        'x-sessao': sessao,
        'x-chave-idempotencia': 'abcdefghijklmnop',
        'content-type': 'application/json',
        origin: 'https://app.example.test',
      },
      body: JSON.stringify({ versao_esperada: 0, secoes: [] }),
    });
    expect((await criarEntradaAnamneseNativa(dependencias).atender(request)).status).toBe(200);
    expect(compor).toHaveBeenCalledWith(
      expect.any(Request),
      { operacao: 'gravar', paciente_id: paciente, versao_esperada: 0, secoes: [] },
      dependencias,
    );
  });
  it('rejeita entrada inválida antes da composição', async () => {
    const compor = vi.spyOn(composicao, 'comporAnamneseNativa');
    const entrada = criarEntradaAnamneseNativa(dependencias);
    for (const request of [
      new Request(url, { method: 'POST' }),
      new Request(url.replace(paciente, 'invalido'), { headers: { 'x-sessao': sessao } }),
      new Request(`${url}?x=1`, { headers: { 'x-sessao': sessao } }),
      new Request(url),
      new Request(url, {
        method: 'PATCH',
        headers: {
          'x-sessao': sessao,
          'x-chave-idempotencia': 'abcdefghijklmnop',
          'content-type': 'application/json',
        },
        body: '{',
      }),
    ]) {
      expect((await entrada.atender(request)).status).toBeGreaterThanOrEqual(400);
    }
    expect(compor).not.toHaveBeenCalled();
  });
  it('traduz erro sem expor detalhes', async () => {
    vi.spyOn(composicao, 'comporAnamneseNativa').mockResolvedValue({
      ok: false,
      erro: { codigo: 'sem_permissao' },
      request_id: requestId,
    });
    const resposta = await criarEntradaAnamneseNativa(dependencias).atender(
      new Request(url, { headers: { 'x-sessao': sessao } }),
    );
    expect(resposta.status).toBe(403);
    expect(await resposta.json()).toMatchObject({
      erro: { codigo: 'sem_permissao' },
      request_id: requestId,
    });
  });
});
