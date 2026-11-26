// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { criarServicoSegredosIntegracoesHttp } from './servico-segredos-integracoes-http.ts';

const identidade = {
  usuario_id: '10000000-0000-4000-8000-000000000001',
  session_id: '20000000-0000-4000-8000-000000000002',
};
function servico() {
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
  return criarServicoSegredosIntegracoesHttp(() => identidade);
}
afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('recusa metadados acima do teto e cancela a leitura', async () => {
  const cancelar = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controle) {
              controle.enqueue(new Uint8Array(65_537));
            },
            cancel: cancelar,
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    ),
  );
  await expect(servico().listar()).rejects.toMatchObject({ codigo: 'servico_indisponivel' });
  expect(cancelar).toHaveBeenCalledOnce();
});

it('interrompe corpo que não termina quando o prazo expira', async () => {
  const prazo = new AbortController();
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(prazo.signal);
  const cancelar = vi.fn();
  const buscar = vi.fn(
    async () =>
      new Response(new ReadableStream({ cancel: cancelar }), {
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', buscar);
  const leitura = servico().listar();
  const rejeicao = expect(leitura).rejects.toMatchObject({ codigo: 'servico_indisponivel' });
  await vi.waitFor(() => expect(buscar).toHaveBeenCalledOnce());
  prazo.abort();
  await rejeicao;
  expect(cancelar).toHaveBeenCalledOnce();
});

it('trata resposta inválida de escrita como pendência sem devolver valor', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ valor: 'eco-ficticio-invalido' })),
  );
  await expect(
    servico().gravar({
      segredo_chave: 'ffcmapp.integracao.openrouter',
      valor: 'valor-ficticio-invalido',
      versao_esperada: 0,
    }),
  ).rejects.toMatchObject({ codigo: 'pendencia_externa', status: 0 });
});

// Uma resposta recusada antes do leitor também pode deixar corpo sem fim: não basta
// classificar resultado incerto; é preciso encerrar esse stream sem ler/ecoar valor.
it.each([
  { status: 202, tipo: 'application/json' },
  { status: 200, tipo: 'text/html' },
])('cancela corpo recusado antes da leitura ($status/$tipo)', async ({ status, tipo }) => {
  const cancelar = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(new ReadableStream({ cancel: cancelar }), {
          status,
          headers: { 'Content-Type': tipo },
        }),
    ),
  );
  await expect(
    servico().gravar({
      segredo_chave: 'ffcmapp.integracao.openrouter',
      valor: 'valor-ficticio-invalido',
      versao_esperada: 0,
    }),
  ).rejects.toMatchObject({ codigo: 'pendencia_externa', status: 0 });
  expect(cancelar).toHaveBeenCalledOnce();
});
