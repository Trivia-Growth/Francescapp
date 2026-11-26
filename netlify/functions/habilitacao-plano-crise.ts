import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaHabilitacaoCriseNativa } from './_shared/entrada-habilitacao-crise-nativa.ts';

export const config = { path: '/api/admin/habilitacao-plano-crise' };

let entrada: ReturnType<typeof criarEntradaHabilitacaoCriseNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function habilitacaoPlanoCrise(request: Request): Promise<Response> {
  // Administrador-only; autorização real fica no banco. Desativado por padrão.
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaHabilitacaoCriseNativa(dependencias);
  } catch {
    return falha('configuracao_indisponivel');
  }
  // Interruptor administrado pela tela (`ffcm.plano_crise.ativo`), com a variável de ambiente
  // como padrão quando o banco não responde ou não tem a chave. Não é autorização: a rota
  // segue validando sessão, concessão e atestado no banco.
  if (
    !(await servicoAtivo(
      dependencias.pool,
      'ffcm.plano_crise.ativo',
      process.env.FFCM_PLANO_CRISE_ATIVO === 'true',
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
