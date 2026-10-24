import { ErroConfiguracaoIndisponivel } from './configuracao.ts';
import {
  criarErroPublicoSemCampos,
  type RespostaErroPublica,
} from '../../../packages/contracts/src/erros.ts';

export type RespostaDeFalhaPublica = RespostaErroPublica;

/**
 * Converte erros de infraestrutura ao envelope D-09 sem expor causa, nome de
 * variável, valor de configuração, stack ou conteúdo de provedor.
 */
export function criarRespostaDeFalhaPublica(erro: unknown): RespostaDeFalhaPublica {
  const codigo =
    erro instanceof ErroConfiguracaoIndisponivel
      ? 'configuracao_indisponivel'
      : 'servico_indisponivel';

  return criarErroPublicoSemCampos(codigo, crypto.randomUUID());
}
