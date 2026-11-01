import {
  contratosRotas,
  criarErroPublico,
  statusErroHttp,
  type CodigoErro,
} from '@ffcmapp/contratos';

type Autorizacao =
  | { estado: 'nao_autenticado' | 'sem_permissao' }
  | { estado: 'autorizado'; contexto: unknown };

/** Experimento não exposto. As portas devem comprovar sessão, origem e CSRF,
 * emitir reserva vinculada e conferir autoridade transacional no banco.
 * Não usar em runtime antes de S-02 e revisão independente da composição. */
export function criarHandlerCriarPacienteExperimental(portas: {
  autorizar(request: Request): Promise<Autorizacao>;
  executar(
    solicitacao: { corpo: unknown; cabecalhos: unknown },
    contexto: unknown,
    requestId: string,
  ): Promise<unknown>;
  revalidar(request: Request, contexto: unknown): Promise<boolean>;
}) {
  return async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID();
    let execucaoIniciada = false;
    const controle = new AbortController();
    const temporizador = setTimeout(() => controle.abort(), 15_000);
    const noPrazo = async <T>(operacao: () => Promise<T>): Promise<T> => {
      if (controle.signal.aborted) throw new Error();
      let abortar!: () => void;
      const prazo = new Promise<never>((_, rejeitar) => {
        abortar = () => rejeitar(new Error());
        controle.signal.addEventListener('abort', abortar, { once: true });
      });
      try {
        const resultado = await Promise.race([operacao(), prazo]);
        if (controle.signal.aborted) throw new Error();
        return resultado;
      } finally {
        controle.signal.removeEventListener('abort', abortar);
      }
    };
    const responder = (corpo: unknown, status: number) =>
      Response.json(corpo, {
        status,
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      });
    const falha = (codigo: CodigoErro) =>
      responder(criarErroPublico(codigo, requestId), statusErroHttp[codigo]);
    try {
      if (typeof portas.revalidar !== 'function') return falha('configuracao_indisponivel');
      const url = new URL(request.url);
      if (
        request.method !== 'POST' ||
        url.pathname !== contratosRotas.criarPaciente.caminho ||
        url.search ||
        request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
          'application/json'
      )
        return falha('entrada_invalida');
      const cabecalhos = contratosRotas.criarPaciente.cabecalhos.safeParse({
        'x-chave-idempotencia': request.headers.get('x-chave-idempotencia'),
        'x-ffcm-prova-sessao': request.headers.get('x-ffcm-prova-sessao'),
        'x-ffcm-geracao-sessao': request.headers.get('x-ffcm-geracao-sessao'),
      });
      if (!cabecalhos.success || !request.body) return falha('entrada_invalida');
      const leitor = request.body.getReader();
      controle.signal.addEventListener(
        'abort',
        () => {
          void leitor.cancel().catch(() => {});
        },
        { once: true },
      );
      const partes: Uint8Array[] = [];
      let tamanho = 0;
      while (true) {
        const { value, done } = await noPrazo(() => leitor.read());
        if (done) break;
        tamanho += value.byteLength;
        if (tamanho > 16_384) {
          void leitor.cancel().catch(() => {});
          return falha('entrada_invalida');
        }
        partes.push(value);
      }
      const bytes = new Uint8Array(tamanho);
      let posicao = 0;
      for (const parte of partes) {
        bytes.set(parte, posicao);
        posicao += parte.byteLength;
      }
      let corpo: unknown;
      try {
        corpo = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      } catch {
        return falha('entrada_invalida');
      }
      const entrada = contratosRotas.criarPaciente.entrada.safeParse(corpo);
      if (!entrada.success) return falha('entrada_invalida');
      const autorizacao = await noPrazo(() => portas.autorizar(request));
      if (autorizacao.estado !== 'autorizado') return falha(autorizacao.estado);
      execucaoIniciada = true;
      const resultado = await noPrazo(() =>
        portas.executar(
          {
            corpo: entrada.data,
            cabecalhos: { 'x-chave-idempotencia': cabecalhos.data['x-chave-idempotencia'] },
          },
          autorizacao.contexto,
          requestId,
        ),
      );
      if (!resultado || typeof resultado !== 'object') return falha('pendencia_externa');
      const resposta = resultado as Record<string, unknown>;
      if (resposta.request_id !== requestId) return falha('pendencia_externa');
      if (resposta.ok === false) {
        const erro = resposta.erro as Record<string, unknown> | undefined;
        const codigo = erro?.codigo;
        if (
          Object.keys(resposta).sort().join(',') !== 'erro,ok,request_id' ||
          !erro ||
          typeof erro !== 'object' ||
          Array.isArray(erro) ||
          Object.keys(erro).join(',') !== 'codigo'
        )
          return falha('pendencia_externa');
        if (
          codigo === 'entrada_invalida' ||
          codigo === 'sem_permissao' ||
          codigo === 'conflito_idempotencia'
        )
          return falha(codigo);
        return falha('pendencia_externa');
      }
      const dados = contratosRotas.criarPaciente.saida.safeParse(resposta.dados);
      if (
        resposta.ok !== true ||
        !dados.success ||
        !(await noPrazo(() => portas.revalidar(request, autorizacao.contexto)))
      )
        return falha('pendencia_externa');
      return responder({ dados: dados.data, request_id: requestId }, 200);
    } catch {
      return falha(execucaoIniciada ? 'pendencia_externa' : 'servico_indisponivel');
    } finally {
      clearTimeout(temporizador);
    }
  };
}
