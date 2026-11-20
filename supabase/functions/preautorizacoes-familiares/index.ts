import { configurarDependenciasNativas } from '../../../netlify/functions/_shared/configurar-dependencias-nativas.ts';
import { criarEntradaPreautorizacaoFamiliarNativa } from '../../../netlify/functions/_shared/entrada-preautorizacao-familiar-nativa.ts';
import { interruptorDeAmbiente } from '../_shared/edge/ambiente-isolate.ts';
import { respostaDeErroEdge } from '../_shared/edge/erro-edge.ts';
import { criarFuncaoEdge } from '../_shared/edge/funcao-edge.ts';

/** Edge Function de domínio (D7). Composição importada, não copiada (D3). */

export const nome = 'preautorizacoes-familiares';
export const caminhos = ['/api/admin/preautorizacoes-familiares'] as const;

let entrada: ReturnType<typeof criarEntradaPreautorizacaoFamiliarNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export const atender = criarFuncaoEdge({
  nome,
  caminhos,
  async atender(request, { fonte }) {
    // Administrador-only; a autorização que vale é a do banco. Mesma capacidade exigida
    // para convidar: quem convida é quem cancela.
    // Gate fixo: o convite familiar ainda não foi comprovado com caixa de entrada real,
    // e cancelar faz parte do mesmo fluxo. Sai junto com ele.
    const integracaoComprovada = false;
    if (
      !integracaoComprovada ||
      !interruptorDeAmbiente(fonte, 'FFCM_CANCELAR_PREAUTORIZACAO_ATIVO')
    )
      return respostaDeErroEdge('servico_indisponivel');
    try {
      dependencias ??= configurarDependenciasNativas(fonte);
      entrada ??= criarEntradaPreautorizacaoFamiliarNativa(dependencias);
    } catch {
      return respostaDeErroEdge('configuracao_indisponivel');
    }
    return entrada.atender(request);
  },
});

Deno.serve(atender);
