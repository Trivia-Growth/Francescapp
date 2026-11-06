import type { criarIntencaoDesconexao } from './agenda-google-desconexao-intencao.ts';

type Identidade = Readonly<{ usuarioId: string; sessaoId: string; subjectGoogle: string }>;
type Estado = 'conectado' | 'desconectado';

/** Versão e recibo transacional impedem que um pedido antigo remova conexão nova. */
export async function processarDesconexaoAgenda(
  request: Request,
  portas: {
    origem: string;
    intencao: ReturnType<typeof criarIntencaoDesconexao>;
    autorizar(request: Request): Promise<Identidade | null>;
    statusConexao(subject: string): Promise<{ estado: Estado; versao: string }>;
    consultarDesconexao(
      subject: string,
      operacaoId: string,
    ): Promise<
      | { estado: 'desconhecido' }
      | {
          estado: 'desconectado' | 'conflito' | 'cancelada';
          conexao_atual: Estado;
          versao_atual: string;
        }
    >;
    cancelarDesconexao(
      subject: string,
      versao: string,
      operacaoId: string,
    ): Promise<{
      estado: 'desconectado' | 'conflito' | 'cancelada';
      conexao_atual: Estado;
      versao_atual: string;
    }>;
    desconectar(
      subject: string,
      versao: string,
      operacaoId: string,
    ): Promise<{
      estado: 'desconectado' | 'conflito' | 'cancelada';
      conexao_atual: Estado;
      versao_atual: string;
    }>;
  },
): Promise<Response> {
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  const erro = (status: number) =>
    Response.json(
      {
        erro:
          status === 401
            ? 'nao_autenticado'
            : status === 422
              ? 'entrada_invalida'
              : 'servico_indisponivel',
      },
      { status, headers },
    );
  try {
    const url = new URL(request.url);
    const consultar = request.method === 'GET' && url.pathname === '/api/agenda/google/conexao';
    const desconectar =
      request.method === 'POST' && url.pathname === '/api/agenda/google/desconectar';
    const cancelar =
      request.method === 'POST' && url.pathname === '/api/agenda/google/desconexao/cancelar';
    const consultarRecibo =
      request.method === 'GET' && url.pathname === '/api/agenda/google/desconexao/recibo';
    if (
      url.origin !== portas.origem ||
      url.hash ||
      (!consultar && !desconectar && !consultarRecibo && !cancelar) ||
      (!consultarRecibo && url.search)
    )
      return erro(422);
    if (
      consultarRecibo &&
      (url.searchParams.getAll('operacao_id').length !== 1 ||
        [...url.searchParams.keys()].some((nome) => nome !== 'operacao_id') ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          url.searchParams.get('operacao_id') ?? '',
        ))
    )
      return erro(422);
    if (
      (desconectar || cancelar) &&
      (request.headers.get('origin') !== portas.origem ||
        request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
          'application/json' ||
        !request.body)
    )
      return erro(422);
    const identidade = await portas.autorizar(request);
    if (!identidade) return erro(401);
    if (consultarRecibo) {
      const recibo = await portas.consultarDesconexao(
        identidade.subjectGoogle,
        url.searchParams.get('operacao_id') as string,
      );
      return Response.json(
        recibo.estado === 'desconhecido'
          ? recibo
          : { ...recibo, revogacao_google: 'nao_comprovada' },
        { headers },
      );
    }
    if (consultar) {
      const status = await portas.statusConexao(identidade.subjectGoogle);
      const operacaoId = crypto.randomUUID();
      const autorizacao = await portas.intencao.emitir({
        usuarioId: identidade.usuarioId,
        subjectGoogle: identidade.subjectGoogle,
        versao: status.versao,
        operacaoId,
      });
      return Response.json({ ...status, operacao_id: operacaoId, autorizacao }, { headers });
    }
    if (!request.body) return erro(422);
    const leitor = request.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let texto = '';
    let tamanho = 0;
    try {
      while (true) {
        const parte = await leitor.read();
        if (parte.done) break;
        tamanho += parte.value.length;
        if (tamanho > 4096) {
          void leitor.cancel().catch(() => {});
          return erro(422);
        }
        texto += decoder.decode(parte.value, { stream: true });
      }
      texto += decoder.decode();
    } finally {
      leitor.releaseLock();
    }
    const dados: unknown = JSON.parse(texto);
    if (
      typeof dados !== 'object' ||
      dados === null ||
      Array.isArray(dados) ||
      Object.keys(dados).some(
        (chave) => chave !== 'operacao_id' && chave !== 'versao' && chave !== 'autorizacao',
      ) ||
      !('operacao_id' in dados) ||
      typeof dados.operacao_id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        dados.operacao_id,
      ) ||
      !('versao' in dados) ||
      typeof dados.versao !== 'string' ||
      !/^(0|[1-9][0-9]{0,17})$/.test(dados.versao)
    )
      return erro(422);
    if (cancelar) {
      if ('autorizacao' in dados) return erro(422);
      const resultado = await portas.cancelarDesconexao(
        identidade.subjectGoogle,
        dados.versao,
        dados.operacao_id,
      );
      return Response.json({ ...resultado, revogacao_google: 'nao_comprovada' }, { headers });
    }
    if (
      !('autorizacao' in dados) ||
      typeof dados.autorizacao !== 'string' ||
      dados.autorizacao.length < 1 ||
      dados.autorizacao.length > 2048
    )
      return erro(422);
    if (
      !(await portas.intencao.conferir(dados.autorizacao, {
        usuarioId: identidade.usuarioId,
        subjectGoogle: identidade.subjectGoogle,
        versao: dados.versao,
        operacaoId: dados.operacao_id,
      }))
    )
      return erro(401);
    const resultado = await portas.desconectar(
      identidade.subjectGoogle,
      dados.versao,
      dados.operacao_id,
    );
    // Revogação Google não é tentada até comprovar projeto isolado e proteção
    // contra reconexão durante resultado externo incerto.
    return Response.json({ ...resultado, revogacao_google: 'nao_comprovada' }, { headers });
  } catch {
    return erro(503);
  }
}
