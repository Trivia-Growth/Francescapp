import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaFichaPlantaoNativa } from './_shared/entrada-ficha-plantao-nativa.ts';

export const config = {
  path: [
    '/api/pacientes/:paciente_id/ficha-plantao',
    '/api/pacientes/:paciente_id/ficha-plantao/pendencias/resolucao',
    '/api/pacientes/:paciente_id/turnos/:turno_id/ficha-plantao',
    '/api/pacientes/:paciente_id/turnos/:turno_id/ficha-plantao/rascunho',
  ],
};

let entrada: ReturnType<typeof criarEntradaFichaPlantaoNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

/** FR-073 a FR-077 e FR-081. Superfície única de registro do plantão. A submissão é atômica
 * no banco: ou toda a ficha grava, ou nada grava. Autorização, auditoria e exigência de
 * turno aberto são do banco; aqui só há o interruptor próprio, que nasce desligado. */
export default async function fichaPlantao(request: Request): Promise<Response> {
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaFichaPlantaoNativa(dependencias);
  } catch {
    return falha('configuracao_indisponivel');
  }
  // Interruptor administrado, com a variável de ambiente como padrão quando o banco não
  // responde ou não tem a chave. Falha fechada: sem decisão explícita, a rota não existe.
  if (
    !(await servicoAtivo(
      dependencias.pool,
      'ffcm.ficha_plantao.ativo',
      process.env.FFCM_FICHA_PLANTAO_ATIVO === 'true',
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
