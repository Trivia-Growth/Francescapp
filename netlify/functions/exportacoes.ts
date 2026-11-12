import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { criarEntradaExportacaoNativa } from './_shared/entrada-exportacao-nativa.ts';

export const config = {
  path: [
    '/api/pacientes/:paciente_id/exportacoes',
    '/api/pacientes/:paciente_id/exportacoes/entrega',
  ],
};

let entrada: ReturnType<typeof criarEntradaExportacaoNativa> | undefined;

/** Interruptor fixo e desligado (FR-032/FR-033). Exportar reúne o caso inteiro num
 * artefato: ligar esta rota exige a decisão do solicitante sobre quem pode exportar, a
 * prova conectada com dados fictícios e a revisão independente prevista. */
const EXPORTACAO_ATIVA = false;

export default async function exportacoes(request: Request): Promise<Response> {
  if (!(EXPORTACAO_ATIVA && process.env.FFCM_EXPORTACAO_ATIVA === 'true'))
    return falha('servico_indisponivel');
  try {
    entrada ??= criarEntradaExportacaoNativa(configurarDependenciasNativas(process.env));
  } catch {
    return falha('configuracao_indisponivel');
  }
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
