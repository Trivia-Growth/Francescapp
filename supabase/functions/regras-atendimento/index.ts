import { configurarDependenciasNativas } from '../../../netlify/functions/_shared/configurar-dependencias-nativas.ts';
import { criarEntradaRegrasAtendimentoNativa } from '../../../netlify/functions/_shared/entrada-regras-atendimento-nativa.ts';
import { decidirServicoAtivo } from '../_shared/edge/ambiente-isolate.ts';
import { respostaDeErroEdge } from '../_shared/edge/erro-edge.ts';
import { criarFuncaoEdge } from '../_shared/edge/funcao-edge.ts';

/** Edge Function de domínio (D7). Composição importada, não copiada (D3). */

export const nome = 'regras-atendimento';
export const caminhos = ['/api/regras-atendimento'] as const;

let entrada: ReturnType<typeof criarEntradaRegrasAtendimentoNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export const atender = criarFuncaoEdge({
  nome,
  caminhos,
  async atender(request, { fonte }) {
    // Desligada por padrão: ativação exige a prova integrada de que só sessão válida lê e de que
    // nenhuma chave de 'servidor' ou 'administracao' escapa por este caminho (FR-041).
    try {
      dependencias ??= configurarDependenciasNativas(fonte);
      entrada ??= criarEntradaRegrasAtendimentoNativa(dependencias);
    } catch {
      return respostaDeErroEdge('configuracao_indisponivel');
    }
    // Interruptor administrado pela tela (`ffcm.regras.ativa`), com a variável de ambiente
    // como padrão quando o banco não responde ou não tem a chave. Não é autorização: a rota
    // segue validando sessão, concessão e atestado no banco.
    if (
      !(await decidirServicoAtivo(
        dependencias.pool,
        'ffcm.regras.ativa',
        fonte,
        'FFCM_REGRAS_ATIVA',
      ))
    )
      return respostaDeErroEdge('servico_indisponivel');
    return entrada.atender(request);
  },
});

Deno.serve(atender);
