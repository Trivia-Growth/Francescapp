import { criarConcessaoEquipeReservadaSchema } from '../../../packages/contracts/src/identidade.ts';
import {
  cabecalhosMutacaoSchema,
  contratosRotas,
  criarErroPublicoSemCampos,
  statusErroHttp,
} from '../../../packages/contracts/src/index.ts';
import {
  comporCriacaoConcessaoEquipe,
  comporListagemConcessoesEquipe,
} from './compor-concessoes-equipe-nativo.ts';
import type { configurarDependenciasNativas } from './configurar-dependencias-nativas.ts';
import type { configurarIdempotenciaConcessao } from './configurar-idempotencia-concessao.ts';
import { servicoAtivo } from './configuracao-servidor.ts';

export const caminhoConcessoesEquipe = '/api/admin/concessoes-equipe';

export const cabecalhosConcessoesEquipe = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

type Codigo =
  | 'entrada_invalida'
  | 'nao_autenticado'
  | 'sem_permissao'
  | 'servico_indisponivel'
  | 'pendencia_externa'
  | 'conflito_idempotencia'
  | 'conflito';

/** Padrões e configuração lidos do ambiente pela rota; interruptor não é autorização. */
export type PadroesConcessoesEquipe = {
  criacaoAtiva: boolean;
  consultaAtiva: boolean;
  barreiraAtiva: boolean;
  idempotencia: () => ReturnType<typeof configurarIdempotenciaConcessao>;
};

/** Entrada interna das concessões de equipe; não registra rota nem concede privilégios. */
export function criarEntradaConcessoesEquipeNativa(
  dependencias: ReturnType<typeof configurarDependenciasNativas>,
) {
  return {
    async atender(request: Request, padroes: PadroesConcessoesEquipe): Promise<Response> {
      const requestId = crypto.randomUUID();
      const erro = (codigo: Codigo) =>
        Response.json(criarErroPublicoSemCampos(codigo, requestId), {
          status: statusErroHttp[codigo],
          headers: cabecalhosConcessoesEquipe,
        });
      const criando = request.method === 'POST';
      // Interruptores administrados pela tela, com as variáveis de ambiente como padrão quando o
      // banco não responde. Não são autorização: a rota segue exigindo sessão de administrador e
      // atestado. Criar depende também da conferência prévia, que faz parte do mesmo fluxo.
      if (
        !(await servicoAtivo(
          dependencias.pool,
          criando ? 'ffcm.equipe.criacao_ativa' : 'ffcm.equipe.consulta_ativa',
          criando ? padroes.criacaoAtiva : padroes.consultaAtiva,
        ))
      )
        return erro('servico_indisponivel');
      if (
        criando &&
        !(await servicoAtivo(
          dependencias.pool,
          'ffcm.equipe.barreira_ativa',
          padroes.barreiraAtiva,
        ))
      )
        return erro('servico_indisponivel');
      const controle = new AbortController();
      const cancelar = () => controle.abort();
      request.signal.addEventListener('abort', cancelar, { once: true });
      if (request.signal.aborted) cancelar();
      const prazo = setTimeout(cancelar, 10_000);
      try {
        const url = new URL(request.url);
        if (
          !['GET', 'POST'].includes(request.method) ||
          url.pathname !== caminhoConcessoesEquipe ||
          url.hash ||
          (criando && url.search)
        )
          return erro('entrada_invalida');
        if (criando)
          return await criar(request, requestId, erro, controle.signal, dependencias, padroes);
        const consulta: Record<string, unknown> = {};
        for (const [chave, valor] of url.searchParams) {
          if (!['limite', 'cursor', 'estado'].includes(chave) || Object.hasOwn(consulta, chave))
            return erro('entrada_invalida');
          consulta[chave] = chave === 'limite' && /^\d{1,3}$/.test(valor) ? Number(valor) : valor;
        }
        const validada = contratosRotas.listarConcessoes.entrada.safeParse(consulta);
        if (!validada.success) return erro('entrada_invalida');
        const resultado = await comporListagemConcessoesEquipe(
          request,
          validada.data,
          requestId,
          controle.signal,
          dependencias,
        );
        if (!resultado.ok) return erro(resultado.erro.codigo);
        return Response.json(
          { dados: resultado.dados, request_id: requestId },
          { headers: cabecalhosConcessoesEquipe },
        );
      } catch {
        return erro('servico_indisponivel');
      } finally {
        clearTimeout(prazo);
        request.signal.removeEventListener('abort', cancelar);
      }
    },
  };
}

/** Leitura e validação do corpo da criação; a composição e a dupla autorização ficam em
 * `compor-concessoes-equipe-nativo.ts`. */
async function criar(
  request: Request,
  requestId: string,
  erro: (codigo: Codigo) => Response,
  signal: AbortSignal,
  dependencias: ReturnType<typeof configurarDependenciasNativas>,
  padroes: PadroesConcessoesEquipe,
): Promise<Response> {
  try {
    const cabecalhos = cabecalhosMutacaoSchema.safeParse({
      'x-chave-idempotencia': request.headers.get('x-chave-idempotencia'),
    });
    if (
      !cabecalhos.success ||
      !request.body ||
      request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
        'application/json'
    )
      return erro('entrada_invalida');
    const leitor = request.body.getReader();
    signal.addEventListener(
      'abort',
      () => {
        void leitor.cancel().catch(() => {});
      },
      { once: true },
    );
    const partes: Uint8Array[] = [];
    let tamanho = 0;
    while (true) {
      if (signal.aborted) throw new Error();
      const parte = await leitor.read();
      if (signal.aborted) throw new Error();
      if (parte.done) break;
      tamanho += parte.value.length;
      if (tamanho > 16384) {
        void leitor.cancel();
        return erro('entrada_invalida');
      }
      partes.push(parte.value);
    }
    const bytes = new Uint8Array(tamanho);
    let pos = 0;
    for (const parte of partes) {
      bytes.set(parte, pos);
      pos += parte.length;
    }
    let corpo: unknown;
    try {
      corpo = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      return erro('entrada_invalida');
    }
    const validada = criarConcessaoEquipeReservadaSchema.safeParse(corpo);
    if (!validada.success) return erro('entrada_invalida');
    const resultado = await comporCriacaoConcessaoEquipe(
      request,
      {
        validada: validada.data,
        chaveIdempotencia: cabecalhos.data['x-chave-idempotencia'],
      },
      requestId,
      signal,
      dependencias,
      padroes.idempotencia,
    );
    if (!resultado.ok) return erro(resultado.erro.codigo);
    return Response.json(
      { dados: resultado.dados, request_id: requestId },
      { headers: cabecalhosConcessoesEquipe },
    );
  } catch {
    return erro('servico_indisponivel');
  }
}
