import { uuidSchema } from '../../packages/contracts/src/comum.ts';
import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { comporAcessosNativo } from './_shared/compor-acessos-nativo.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';

let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export const config = { path: ['/api/acessos', '/api/acessos/operacoes/:id'] };

/** Desligado por padrão enquanto provas integradas e configuração não forem retomadas. */
export default async function acessos(request: Request): Promise<Response> {
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  const erro = (codigo: 'entrada_invalida' | 'servico_indisponivel', status: number) =>
    Response.json(criarErroPublicoSemCampos(codigo, crypto.randomUUID()), { status, headers });
  // Interruptor administrado pela tela (`ffcm.acessos.ativo`), com a variável de ambiente
  // como padrão quando o banco não responde ou não tem a chave.
  //
  // Até 20/11/2026 esta rota lia SOMENTE `process.env.FFCM_ACESSOS_ATIVADOS`, enquanto a
  // chave existia no banco e aparecia na tela de Administração. Ligar pela tela não fazia
  // nada, em silêncio — o interruptor mentia. Alinhado ao padrão de `financeiro.ts` e
  // `avisos.ts`.
  //
  // Não é autorização: mesmo ligada, a rota segue exigindo sessão, atestado e perfil.
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
  } catch {
    // Sem acesso ao banco não há configuração a ler, e o padrão desta rota é desligado:
    // falha fechada, independentemente do que o ambiente diga.
    return erro('servico_indisponivel', 503);
  }
  const disponivel = await servicoAtivo(
    dependencias.pool,
    'ffcm.acessos.ativo',
    process.env.FFCM_ACESSOS_ATIVADOS === 'true',
  );
  if (!disponivel) return erro('servico_indisponivel', 503);
  const url = new URL(request.url);
  if (url.hash) return erro('entrada_invalida', 422);
  if (request.method === 'GET' && url.pathname === '/api/acessos') {
    if (
      Array.from(url.searchParams.keys()).some((k) => k !== 'cursor_id') ||
      url.searchParams.getAll('cursor_id').length > 1
    )
      return erro('entrada_invalida', 422);
    const cursor = url.searchParams.get('cursor_id');
    if (cursor !== null && !uuidSchema.safeParse(cursor).success)
      return erro('entrada_invalida', 422);
    return comporAcessosNativo(
      request,
      { operacao: 'listar', ...(cursor ? { cursor_id: cursor.toLowerCase() } : {}) },
      process.env,
    );
  }
  const match = /^\/api\/acessos\/operacoes\/([^/]+)$/.exec(url.pathname);
  if (request.method === 'GET' && match && !url.search && uuidSchema.safeParse(match[1]).success)
    return comporAcessosNativo(
      request,
      { operacao: 'consultar', operacao_id: (match[1] ?? '').toLowerCase() },
      process.env,
    );
  if (
    request.method !== 'POST' ||
    url.pathname !== '/api/acessos' ||
    url.search ||
    request.headers.get('origin') !== url.origin ||
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
      'application/json' ||
    !request.body
  )
    return erro('entrada_invalida', 422);
  const leitor = request.body.getReader();
  const cancelar = () => {
    void leitor.cancel().catch(() => undefined);
  };
  request.signal.addEventListener('abort', cancelar, { once: true });
  let entrada: unknown;
  try {
    const partes: Uint8Array[] = [];
    let tamanho = 0;
    while (true) {
      if (request.signal.aborted) throw new Error();
      const parte = await leitor.read();
      if (parte.done) break;
      tamanho += parte.value.byteLength;
      if (tamanho > 16384) throw new Error();
      partes.push(parte.value);
    }
    const bytes = new Uint8Array(tamanho);
    let posicao = 0;
    for (const parte of partes) {
      bytes.set(parte, posicao);
      posicao += parte.length;
    }
    entrada = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    cancelar();
    return erro('entrada_invalida', 422);
  } finally {
    request.signal.removeEventListener('abort', cancelar);
    leitor.releaseLock();
  }
  // Falha de composição não pode virar recusa definitiva de corpo inválido.
  try {
    return await comporAcessosNativo(request, { operacao: 'criar', entrada }, process.env);
  } catch {
    return Response.json(criarErroPublicoSemCampos('pendencia_externa', crypto.randomUUID()), {
      status: 503,
      headers,
    });
  }
}
