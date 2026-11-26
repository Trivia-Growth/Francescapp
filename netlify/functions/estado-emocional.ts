import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaEstadoEmocionalNativa } from './_shared/entrada-estado-emocional-nativa.ts';

export const config = { path: '/api/admin/estado-emocional' };

let entrada: ReturnType<typeof criarEntradaEstadoEmocionalNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function estadoEmocional(request: Request): Promise<Response> {
  // Administrador para gravar; autorização real fica no banco. O termo de estado emocional
  // é vocabulário de observação, sem nota ou escala, e não participa de nenhuma decisão de
  // acesso (FR-076/FR-081).
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaEstadoEmocionalNativa(dependencias);
  } catch {
    return falha('configuracao_indisponivel');
  }
  // Interruptor administrado, com a variável de ambiente como padrão quando o banco não
  // responde ou não tem a chave. Nasce desligado.
  if (
    !(await servicoAtivo(
      dependencias.pool,
      'ffcm.estado_emocional.ativo',
      process.env.FFCM_ESTADO_EMOCIONAL_ATIVO === 'true',
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
