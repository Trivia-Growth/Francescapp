import { afterEach, expect, it, vi } from 'vitest';
import { criarServicoTurnoExecucaoHttp } from './servico-turno-execucao-http.ts';
const id = '10000000-0000-4000-8000-000000000001';
const outro = '20000000-0000-4000-8000-000000000001';
afterEach(() => {
  vi.unstubAllGlobals();
});
function preparar() {
  vi.stubGlobal('sessionStorage', {
    getItem: (chave: string) =>
      chave === 'modo-acesso'
        ? 'interno'
        : chave === 'fluxo-interno'
          ? 'AAAAAAAAAAAAAAAAAAAAAA'
          : null,
  });
  return criarServicoTurnoExecucaoHttp(id, () => ({ usuario_id: id, session_id: id }));
}
it('prescrição vigente usa rota própria e mantém corte retornado ao paginar', async () => {
  const fetch = vi.fn().mockResolvedValue(
    Response.json({
      dados: { itens: [], proximo_cursor: null, vigente_em: '2026-11-19T12:00:00Z' },
      request_id: id,
    }),
  );
  vi.stubGlobal('fetch', fetch);
  const api = preparar();
  const primeira = await api.prescricoesVigentes({});
  await api.prescricoesVigentes({
    vigente_em: primeira.vigente_em,
    cursor_instante: primeira.vigente_em,
    cursor_id: id,
    cursor_versao: 1,
  });
  const url = new URL(fetch.mock.calls[1]?.[0] as string, 'https://exemplo.test');
  expect(url.pathname).toContain('/medicacao/prescricoes-vigentes');
  expect(url.searchParams.get('vigente_em')).toBe(primeira.vigente_em);
  api.desmontar();
});
it('troca de ator descarta resposta tardia e nenhuma chamada nova usa sessão anterior', async () => {
  vi.stubGlobal('sessionStorage', {
    getItem: (chave: string) =>
      chave === 'modo-acesso'
        ? 'interno'
        : chave === 'fluxo-interno'
          ? 'AAAAAAAAAAAAAAAAAAAAAA'
          : null,
  });
  let identidade = { usuario_id: id, session_id: id };
  let resolver!: (resposta: Response) => void;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        resolver = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetch);
  const api = criarServicoTurnoExecucaoHttp(id, () => identidade);
  const pedido = api.catalogo();
  identidade = { usuario_id: outro, session_id: outro };
  resolver(Response.json({ dados: [], request_id: id }));
  await expect(pedido).rejects.toMatchObject({ codigo: 'nao_autenticado' });
  await expect(api.catalogo()).rejects.toMatchObject({ codigo: 'nao_autenticado' });
  expect(fetch).toHaveBeenCalledOnce();
  api.desmontar();
});
it('desmontagem aborta requisição ativa sem usar armazenamento clínico', async () => {
  let sinal: AbortSignal | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, opcoes: RequestInit) => {
      sinal = opcoes.signal as AbortSignal;
      return new Promise<Response>((_resolver, rejeitar) => {
        sinal?.addEventListener('abort', () => rejeitar(new Error('abortado')), { once: true });
      });
    }),
  );
  const api = preparar();
  const pedido = api.catalogo();
  api.desmontar();
  await expect(pedido).rejects.toBeDefined();
  expect(sinal?.aborted).toBe(true);
});
it('relatório com coordenada fora do DTO público é rejeitado integralmente', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json({
        dados: {
          consulta_id: id,
          instante_corte: '2026-11-19T12:00:00Z',
          rotulos_atuais: true,
          paciente_id: id,
          tipo: 'diario',
          inicio: '2026-11-19T00:00:00Z',
          fim: '2026-11-20T00:00:00Z',
          itens: [],
          lacunas: [],
          proximo_cursor: null,
          latitude: -23,
        },
        request_id: id,
      }),
    ),
  );
  const api = preparar();
  await expect(
    api.relatorio({ tipo: 'diario', inicio: '2026-11-19T00:00:00Z', fim: '2026-11-20T00:00:00Z' }),
  ).rejects.toMatchObject({ codigo: 'servico_indisponivel' });
  api.desmontar();
});
