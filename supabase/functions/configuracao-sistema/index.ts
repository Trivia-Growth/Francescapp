import { configurarDependenciasNativas } from '../../../netlify/functions/_shared/configurar-dependencias-nativas.ts';
import { criarEntradaConfiguracaoSistemaNativa } from '../../../netlify/functions/_shared/entrada-configuracao-sistema-nativa.ts';
import { interruptorDeAmbiente } from '../_shared/edge/ambiente-isolate.ts';
import { respostaDeErroEdge } from '../_shared/edge/erro-edge.ts';
import { criarFuncaoEdge } from '../_shared/edge/funcao-edge.ts';

/** Edge Function de domínio (D7). Transporte migra, regra não (D3): a composição continua
 * sendo a mesma `criarEntradaConfiguracaoSistemaNativa` de `netlify/functions/_shared`,
 * importada, nunca copiada. A única diferença em relação a `netlify/functions/
 * configuracao-sistema.ts` é de onde vem o ambiente: `process.env` no processo Node, a
 * fotografia do isolate aqui. Ordem dos gates, códigos e cabeçalhos são literais. */

export const nome = 'configuracao-sistema';
export const caminhos = ['/api/admin/configuracao-sistema'] as const;

let entrada: ReturnType<typeof criarEntradaConfiguracaoSistemaNativa> | undefined;

export const atender = criarFuncaoEdge({
  nome,
  caminhos,
  async atender(request, { fonte }) {
    // Esta rota NÃO lê a própria chave no banco, de propósito: é a tela que edita a
    // configuração. Se ela dependesse do banco, um valor errado gravado pela tela trancaria a
    // própria tela por fora. Continua em variável de ambiente, como interruptor de última
    // instância. Administrador-only; autorização real fica no banco. Não "corrija" isto migrando
    // para `servicoAtivo` (13/11/2026).
    if (!interruptorDeAmbiente(fonte, 'FFCM_CONFIGURACAO_SISTEMA_ATIVO'))
      return respostaDeErroEdge('servico_indisponivel');
    try {
      entrada ??= criarEntradaConfiguracaoSistemaNativa(configurarDependenciasNativas(fonte));
    } catch {
      return respostaDeErroEdge('configuracao_indisponivel');
    }
    return entrada.atender(request);
  },
});

Deno.serve(atender);
