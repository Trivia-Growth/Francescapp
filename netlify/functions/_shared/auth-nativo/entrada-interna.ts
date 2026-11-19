import { fluxoValido } from './cliente.ts';

export const cabecalhosAuthInterno = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

/** Corpo limitado antes de JSON/schema; credenciais nunca entram em URL ou erro. */
export async function lerEntradaInterna(
  request: Request,
  caminho: string,
  exigirFluxo = true,
): Promise<unknown> {
  const url = new URL(request.url);
  if (
    request.method !== 'POST' ||
    url.pathname !== caminho ||
    url.search ||
    url.hash ||
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
      'application/json' ||
    request.headers.get('origin') !== url.origin ||
    (exigirFluxo && !fluxoValido(request.headers.get('x-fluxo'))) ||
    !request.body
  )
    throw new Error('Entrada indisponível.');
  const leitor = request.body.getReader();
  const cancelar = () => {
    void leitor.cancel().catch(() => undefined);
  };
  request.signal.addEventListener('abort', cancelar, { once: true });
  try {
    const partes: Uint8Array[] = [];
    let tamanho = 0;
    while (true) {
      if (request.signal.aborted) throw new Error();
      const parte = await leitor.read();
      if (parte.done) break;
      tamanho += parte.value.byteLength;
      if (tamanho > 8192) throw new Error();
      partes.push(parte.value);
    }
    const bytes = new Uint8Array(tamanho);
    let posicao = 0;
    for (const parte of partes) {
      bytes.set(parte, posicao);
      posicao += parte.length;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    cancelar();
    throw new Error('Entrada indisponível.');
  } finally {
    request.signal.removeEventListener('abort', cancelar);
    leitor.releaseLock();
  }
}
