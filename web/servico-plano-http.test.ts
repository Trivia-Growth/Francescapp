import { afterEach, expect, it, vi } from 'vitest';
import { criarServicoPlanoHttp } from './servico-plano-http.ts';

const id = '10000000-0000-4000-8000-000000000001';
afterEach(() => {
  vi.unstubAllGlobals();
});
it('vincula consulta à sessão e rejeita resposta tardia após troca de identidade', async () => {
  vi.stubGlobal('sessionStorage', {
    getItem: (chave: string) => (chave === 'modo-acesso' ? 'tecnica' : null),
  });
  let identidade: { usuario_id: string; session_id: string } | null = {
    usuario_id: id,
    session_id: id,
  };
  let resolver!: (resposta: Response) => void;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        resolver = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetch);
  const servico = criarServicoPlanoHttp(() => identidade);
  const consulta = servico.consultarObjetivos(id);
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store' });
  identidade = null;
  resolver(Response.json({ dados: [], request_id: id }));
  await expect(consulta).rejects.toMatchObject({ status: 401 });
});
