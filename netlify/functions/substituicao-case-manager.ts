import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaSubstituicaoCmNativa } from './_shared/entrada-substituicao-cm-nativa.ts';

export const config = {
  path: [
    '/api/pacientes/:paciente_id/substituicao-case-manager',
    '/api/pacientes/:paciente_id/substituicao-case-manager/encerramento',
  ],
};

let entrada: ReturnType<typeof criarEntradaSubstituicaoCmNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function substituicaoCaseManager(request: Request): Promise<Response> {
  // Administrador-only; autorização real fica no banco. Desativado por padrão.
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaSubstituicaoCmNativa(dependencias);
  } catch {
    return falha('configuracao_indisponivel');
  }
  // Interruptor administrado (`ffcm.substituicao_cm.ativo`), com a variável de ambiente como
  // padrão quando o banco não responde ou não tem a chave. Não é autorização: a rota segue
  // validando sessão, perfil e atestado no banco.
  if (
    !(await servicoAtivo(
      dependencias.pool,
      'ffcm.substituicao_cm.ativo',
      process.env.FFCM_SUBSTITUICAO_CM_ATIVO === 'true',
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
