/** Parseamento do sufixo de caminho das Edge Functions.
 *
 * A Netlify roteia por `export const config = { path: [...] }`, com `:parametro` no caminho.
 * A Edge Function recebe tudo sob `/functions/v1/<nome>` e precisa reconstruir o caminho
 * original de `/api/*` para que a composição existente — que compara `url.pathname` — seja
 * reaproveitada sem alteração (D7).
 *
 * O caminho é derivado **só da URL**. Nenhum cabeçalho informa qual rota foi pedida: um
 * cabeçalho seria entrada controlável pelo cliente e viraria desvio de roteamento. */

const limiteDeCaminho = 2_048;

function nomeDeFuncaoValido(nome: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(nome);
}

function caminhoApiValido(caminho: string): boolean {
  return (
    caminho.length <= limiteDeCaminho &&
    caminho.startsWith('/api/') &&
    !caminho.includes('//') &&
    !caminho.includes('/./') &&
    !caminho.includes('/../') &&
    !caminho.endsWith('/.') &&
    !caminho.endsWith('/..') &&
    !/%2f/i.test(caminho) &&
    !caminho.includes('\\')
  );
}

/** Devolve o caminho `/api/*` original, ou `null` quando o sufixo não corresponde a um.
 *
 * `null` é tratado por quem chama como `nao_encontrado`, exatamente como hoje a composição
 * responde a um `pathname` que não é o seu. */
export function extrairCaminhoApi(url: URL, nomeFuncao: string): string | null {
  if (!nomeDeFuncaoValido(nomeFuncao)) return null;
  if (url.hash) return null;
  let caminho = url.pathname;
  for (const prefixo of [`/functions/v1/${nomeFuncao}`, `/${nomeFuncao}`]) {
    if (caminho === prefixo) return null;
    if (caminho.startsWith(`${prefixo}/`)) {
      caminho = caminho.slice(prefixo.length);
      break;
    }
  }
  return caminhoApiValido(caminho) ? caminho : null;
}

export type CaminhoCasado = Readonly<{
  padrao: string;
  parametros: Readonly<Record<string, string>>;
}>;

/** Casa o caminho contra os mesmos padrões declarados hoje em `config.path`.
 *
 * `:nome` casa exatamente um segmento não vazio e nunca atravessa `/`. Caminho desconhecido
 * devolve `null`, sem revelar qual padrão quase casou. */
export function casarCaminho(padroes: readonly string[], caminho: string): CaminhoCasado | null {
  if (!caminhoApiValido(caminho)) return null;
  const segmentos = caminho.split('/');
  for (const padrao of padroes) {
    const esperados = padrao.split('/');
    if (esperados.length !== segmentos.length) continue;
    const parametros: Record<string, string> = Object.create(null) as Record<string, string>;
    let casou = true;
    for (let indice = 0; indice < esperados.length; indice += 1) {
      const esperado = esperados[indice] ?? '';
      const recebido = segmentos[indice] ?? '';
      if (esperado.startsWith(':')) {
        const nome = esperado.slice(1);
        if (!nome || !recebido || Object.hasOwn(parametros, nome)) {
          casou = false;
          break;
        }
        parametros[nome] = recebido;
        continue;
      }
      if (esperado !== recebido) {
        casou = false;
        break;
      }
    }
    if (casou) return Object.freeze({ padrao, parametros: Object.freeze(parametros) });
  }
  return null;
}

/** Reescreve a requisição com o caminho `/api/*` original, preservando método, cabeçalhos,
 * corpo, sinal de cancelamento e a cadeia de consulta. Devolve `null` quando o sufixo não
 * corresponde a um caminho `/api/*`. */
export function reconstruirRequisicao(
  request: Request,
  nomeFuncao: string,
  origem: string,
): Request | null {
  const url = new URL(request.url);
  const caminho = extrairCaminhoApi(url, nomeFuncao);
  if (caminho === null) return null;
  const destino = new URL(`${caminho}${url.search}`, origem);
  const semCorpo = request.method === 'GET' || request.method === 'HEAD';
  const inicializacao: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers: request.headers,
    signal: request.signal,
  };
  if (!semCorpo && request.body) {
    inicializacao.body = request.body;
    inicializacao.duplex = 'half';
  }
  return new Request(destino, inicializacao);
}
