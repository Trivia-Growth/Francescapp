import { expect, it } from 'vitest';
import { criarEntradaTarefaCuidadoNativa } from './entrada-tarefa-cuidado-nativa.ts';

it('interrompe leitura de corpo quando a requisição é cancelada', async () => {
  const controle = new AbortController();
  controle.abort();
  const corpo = new ReadableStream({
    pull() {
      return new Promise(() => {});
    },
  });
  const request = new Request(
    'https://example.test/api/pacientes/a0000000-0000-4000-8000-000000000001/tarefas',
    {
      method: 'POST',
      signal: controle.signal,
      body: corpo,
      duplex: 'half',
      headers: {
        'content-type': 'application/json',
        'x-sessao': 'a0000000-0000-4000-8000-000000000001',
        'x-chave-idempotencia': 'chave-ficticia-123456',
      },
    } as RequestInit,
  );
  const entrada = criarEntradaTarefaCuidadoNativa(
    {} as Parameters<typeof criarEntradaTarefaCuidadoNativa>[0],
  );
  const resultado = await Promise.race([
    entrada.atenderCriacao(request),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('leitura bloqueada')), 100),
    ),
  ]);
  expect((await resultado.json()).erro.codigo).toBe('entrada_invalida');
});
