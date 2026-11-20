import { configurarDependenciasNativas } from '../../../netlify/functions/_shared/configurar-dependencias-nativas.ts';
import { criarEntradaConsultaAuditoriaNativa } from '../../../netlify/functions/_shared/entrada-consulta-auditoria-nativa.ts';
import { decidirServicoAtivo } from '../_shared/edge/ambiente-isolate.ts';
import { respostaDeErroEdge } from '../_shared/edge/erro-edge.ts';
import { criarFuncaoEdge } from '../_shared/edge/funcao-edge.ts';

/** Edge Function de domínio (D7). Composição importada, não copiada (D3). */

export const nome = 'auditoria';
export const caminhos = ['/api/admin/auditoria'] as const;

let entrada: ReturnType<typeof criarEntradaConsultaAuditoriaNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export const atender = criarFuncaoEdge({
  nome,
  caminhos,
  async atender(request, { fonte }) {
    // Desligada por padrão: ativação exige a prova integrada de autorização administrador-only e de
    // que nenhuma coluna de conteúdo sai na resposta (FR-039). Variável ausente = serviço indisponível.
    try {
      dependencias ??= configurarDependenciasNativas(fonte);
      entrada ??= criarEntradaConsultaAuditoriaNativa(dependencias);
    } catch {
      return respostaDeErroEdge('configuracao_indisponivel');
    }
    // Interruptor administrado pela tela (`ffcm.auditoria.consulta_ativa`), com a variável de
    // ambiente como padrão quando o banco não responde ou não tem a chave. Não é autorização: a
    // rota segue validando sessão, concessão e atestado no banco.
    if (
      !(await decidirServicoAtivo(
        dependencias.pool,
        'ffcm.auditoria.consulta_ativa',
        fonte,
        'FFCM_AUDITORIA_CONSULTA_ATIVA',
      ))
    )
      return respostaDeErroEdge('servico_indisponivel');
    return entrada.atender(request);
  },
});

Deno.serve(atender);
