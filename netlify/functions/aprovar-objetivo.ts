import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaAprovarObjetivoPlanoNativa } from './_shared/entrada-aprovar-objetivo-plano-nativa.ts';

export const config = { path: '/api/plano/aprovar-objetivo' };

let entrada: ReturnType<typeof criarEntradaAprovarObjetivoPlanoNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function aprovarObjetivo(request: Request): Promise<Response> {
  // Administrador sempre, ou colaborador ativo na lista de aprovadores — checagem real
  // fica no banco. Desativado por padrão.
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaAprovarObjetivoPlanoNativa(dependencias);
  } catch {
    return falha('configuracao_indisponivel');
  }
  // Interruptor administrado pela tela (`ffcm.plano.aprovacao_objetivo_ativa`), com a variável de ambiente
  // como padrão quando o banco não responde ou não tem a chave. Não é autorização: a rota
  // segue validando sessão, concessão e atestado no banco.
  if (
    !(await servicoAtivo(
      dependencias.pool,
      'ffcm.plano.aprovacao_objetivo_ativa',
      process.env.FFCM_APROVAR_OBJETIVO_PLANO_ATIVO === 'true',
    ))
  )
    return falha('servico_indisponivel');
  return entrada.atender(request);
}

function falha(codigo: 'servico_indisponivel' | 'configuracao_indisponivel'): Response {
  return Response.json(criarErroPublicoSemCampos(codigo, crypto.randomUUID()), {
    status: 503,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
