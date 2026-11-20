import { casarCaminho } from '../../../supabase/functions/_shared/edge/caminho-edge.ts';

/** Tabela de encaminhamento por caminho de `/api/*` (design E1).
 *
 * É o mecanismo que torna a migração reversível: cada um dos 104 caminhos escolhe o seu
 * destino de forma independente. Reverter um caminho é trocar `destino` nesta tabela — não
 * republicar função e não tocar no cliente, que continua chamando `/api/*` na mesma origem
 * (D6, design E4).
 *
 * O proxy é transporte. Não decide autorização, não lê corpo, não reescreve cabeçalho de
 * sessão e não interpreta resposta. */

export type DestinoDeCaminho = 'netlify' | 'edge';

export type RotaEncaminhada = Readonly<{
  /** O mesmo padrão hoje declarado em `export const config = { path: [...] }`. */
  padrao: string;
  /** Nome da Edge Function de domínio (D7), usado só quando `destino` é `edge`. */
  funcao: string;
  destino: DestinoDeCaminho;
}>;

/** Cabeçalhos que `netlify.toml` aplica a `/api/*`. O proxy não os emite nem os substitui;
 * esta constante existe para que a paridade seja verificável num teste (2.2). */
export const cabecalhosApiDeclarados: Readonly<Record<string, string>> = Object.freeze({
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
});

/** Cabeçalhos que não podem atravessar um salto HTTP, mais os que identificam a invocação
 * da Edge Function. `authorization` e `apikey` vindos do cliente são descartados: quem
 * chama não escolhe a credencial de invocação. */
const naoEncaminhados = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'authorization',
  'apikey',
]);

export type ConfiguracaoDeEncaminhamento = Readonly<{
  tabela: readonly RotaEncaminhada[];
  /** Origem das Edge Functions, ex.: `https://<ref>.functions.supabase.co`. */
  baseEdge: string;
  /** Credenciais de invocação da plataforma. Nunca registradas, nunca ecoadas. */
  cabecalhosDeInvocacao?: Readonly<Record<string, string>>;
  /** Encaminhamento ao runtime atual: é o destino `netlify` e o estado anterior à migração. */
  atenderNaNetlify: (request: Request) => Promise<Response>;
  buscar?: typeof fetch;
}>;

export type EncaminhamentoApi = Readonly<{
  destinoDe(caminho: string): DestinoDeCaminho | null;
  atender(request: Request): Promise<Response>;
}>;

export function criarEncaminhamentoApi(
  configuracao: ConfiguracaoDeEncaminhamento,
): EncaminhamentoApi {
  const baseEdge = new URL(configuracao.baseEdge);
  if (baseEdge.protocol !== 'https:' && baseEdge.hostname !== '127.0.0.1')
    throw new TypeError('Base das Edge Functions inválida.');
  const buscar = configuracao.buscar ?? fetch;
  const padroes = configuracao.tabela.map((rota) => rota.padrao);

  const rotaDe = (caminho: string): RotaEncaminhada | null => {
    const casado = casarCaminho(padroes, caminho);
    if (casado === null) return null;
    return configuracao.tabela.find((rota) => rota.padrao === casado.padrao) ?? null;
  };

  return Object.freeze({
    destinoDe(caminho: string): DestinoDeCaminho | null {
      return rotaDe(caminho)?.destino ?? null;
    },

    async atender(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const rota = rotaDe(url.pathname);
      // Caminho fora da tabela segue exatamente como hoje: quem responde é a Netlify.
      if (rota === null || rota.destino === 'netlify')
        return configuracao.atenderNaNetlify(request);

      const destino = new URL(`/functions/v1/${rota.funcao}${url.pathname}${url.search}`, baseEdge);
      const cabecalhos = new Headers();
      request.headers.forEach((valor, nome) => {
        if (!naoEncaminhados.has(nome.toLowerCase())) cabecalhos.set(nome, valor);
      });
      for (const [nome, valor] of Object.entries(configuracao.cabecalhosDeInvocacao ?? {}))
        cabecalhos.set(nome, valor);

      const semCorpo = request.method === 'GET' || request.method === 'HEAD';
      const inicializacao: RequestInit & { duplex?: 'half' } = {
        method: request.method,
        headers: cabecalhos,
        signal: request.signal,
        redirect: 'manual',
      };
      if (!semCorpo && request.body) {
        inicializacao.body = request.body;
        inicializacao.duplex = 'half';
      }
      const resposta = await buscar(new Request(destino, inicializacao));
      // A resposta atravessa inteira: status, corpo e cabeçalhos, inclusive `set-cookie`.
      return new Response(resposta.body, {
        status: resposta.status,
        statusText: resposta.statusText,
        headers: resposta.headers,
      });
    },
  });
}

/** Estado do encaminhamento de produção, caminho a caminho (design E1/E4).
 *
 * Começa inteiro em `netlify`: publicar a Edge Function e apontar o caminho para ela são
 * dois atos distintos, e o segundo só ocorre depois da paridade provada para aquele
 * caminho. Reverter é trocar `destino` nesta linha — sem republicar função e sem tocar no
 * cliente.
 *
 * Lote 1 (piloto, 5 caminhos) publicado no projeto Supabase em 20/11/2026. Os cinco
 * continuam em `netlify` enquanto 2.5 estiver bloqueada: sem os segredos no projeto, a
 * composição das Edge Functions não tem como atender além do envelope de indisponível. */
export const tabelaEncaminhamentoApi: readonly RotaEncaminhada[] = Object.freeze([
  {
    padrao: '/api/admin/configuracao-sistema',
    funcao: 'configuracao-sistema',
    destino: 'netlify',
  },
  { padrao: '/api/regras-atendimento', funcao: 'regras-atendimento', destino: 'netlify' },
  { padrao: '/api/admin/auditoria', funcao: 'auditoria', destino: 'netlify' },
  {
    padrao: '/api/admin/preautorizacoes-familiares',
    funcao: 'preautorizacoes-familiares',
    destino: 'netlify',
  },
  {
    padrao: '/api/admin/solicitacoes-titular',
    funcao: 'solicitacoes-titular',
    destino: 'netlify',
  },
] as const);
