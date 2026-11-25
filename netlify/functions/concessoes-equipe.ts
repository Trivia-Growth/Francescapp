import { criarErroPublicoSemCampos, statusErroHttp } from '../../packages/contracts/src/index.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { configurarIdempotenciaConcessao } from './_shared/configurar-idempotencia-concessao.ts';
import {
  cabecalhosConcessoesEquipe,
  caminhoConcessoesEquipe,
  criarEntradaConcessoesEquipeNativa,
} from './_shared/entrada-concessoes-equipe-nativa.ts';

/** O caminho precisa ser LITERAL aqui. A plataforma lê `config` estaticamente, no build, sem
 * executar o módulo: uma constante importada não é resolvida, e a função sobe publicada e
 * **sem rota**. Em 24/11/2026 era o caso desta: `/api/admin/concessoes-equipe` devolvia a
 * página 404 da própria plataforma, e a aba Equipe da Administração não funcionava em
 * produção. `caminhoConcessoesEquipe` continua sendo a fonte do handler; o teste
 * `_shared/rotas-literais.test.ts` confere que os dois não se separem. */
export const config = { path: ['/api/admin/concessoes-equipe'] };

let entrada: ReturnType<typeof criarEntradaConcessoesEquipeNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function concessoesEquipe(request: Request): Promise<Response> {
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaConcessoesEquipeNativa(dependencias);
  } catch {
    return Response.json(criarErroPublicoSemCampos('servico_indisponivel', crypto.randomUUID()), {
      status: statusErroHttp.servico_indisponivel,
      headers: cabecalhosConcessoesEquipe,
    });
  }
  // O ambiente é o padrão de última instância dos interruptores e a origem das referências de
  // idempotência; a disponibilidade vem do banco e a autorização continua no banco.
  return entrada.atender(request, {
    criacaoAtiva: process.env.FFCM_CRIACAO_EQUIPE_ATIVA === 'true',
    consultaAtiva: process.env.FFCM_CONSULTA_EQUIPE_ATIVA === 'true',
    barreiraAtiva: process.env.FFCM_BARREIRA_EQUIPE_ATIVADA === 'true',
    idempotencia: () => configurarIdempotenciaConcessao(process.env),
  });
}
