import type { FonteDeConfiguracao } from '../configuracao.ts';
import { lerAmbienteDoIsolate } from './ambiente-isolate.ts';
import { casarCaminho, extrairCaminhoApi, reconstruirRequisicao } from './caminho-edge.ts';
import { respostaDeErroEdge } from './erro-edge.ts';

/** Borda comum de uma Edge Function de domínio (D7: uma função por domínio).
 *
 * Faz só o que a plataforma deixou de fazer por configuração: reconstruir o caminho
 * `/api/*` a partir do sufixo, recusar caminho desconhecido e traduzir falha. A composição
 * continua inteira em `netlify/functions/_shared` e `packages/`; nenhuma regra de negócio
 * entra aqui (D3). */

export type DefinicaoDeFuncaoEdge = Readonly<{
  /** Nome publicado da função; é o prefixo que o sufixo de caminho remove. */
  nome: string;
  /** Os mesmos padrões hoje declarados em `export const config = { path: [...] }`. */
  caminhos: readonly string[];
  atender(
    request: Request,
    contexto: Readonly<{
      fonte: FonteDeConfiguracao;
      caminho: string;
      parametros: Readonly<Record<string, string>>;
    }>,
  ): Promise<Response>;
}>;

export function criarFuncaoEdge(
  definicao: DefinicaoDeFuncaoEdge,
  fonte: FonteDeConfiguracao = lerAmbienteDoIsolate(),
): (request: Request) => Promise<Response> {
  return async function atenderNaBorda(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const caminho = extrairCaminhoApi(url, definicao.nome);
    // Caminho desconhecido responde o mesmo envelope `nao_encontrado` que a composição já
    // responde hoje a um `pathname` que não é o seu — sem revelar que a função existe.
    if (caminho === null) return respostaDeErroEdge('nao_encontrado');
    const casado = casarCaminho(definicao.caminhos, caminho);
    if (casado === null) return respostaDeErroEdge('nao_encontrado');
    const pedido = reconstruirRequisicao(request, definicao.nome, url.origin);
    if (pedido === null) return respostaDeErroEdge('nao_encontrado');
    try {
      return await definicao.atender(pedido, {
        fonte,
        caminho,
        parametros: casado.parametros,
      });
    } catch {
      // A composição já traduz os seus próprios erros. Isto é a última rede: nenhuma causa,
      // stack ou nome de variável atravessa a borda.
      return respostaDeErroEdge('servico_indisponivel');
    }
  };
}
