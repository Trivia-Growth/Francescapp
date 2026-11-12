import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { criarEntradaLinhaTempoNativa } from './_shared/entrada-linha-tempo-nativa.ts';

export const config = { path: ['/api/pacientes/:paciente_id/linha-tempo'] };

let entrada: ReturnType<typeof criarEntradaLinhaTempoNativa> | undefined;

/** Interruptor fixo e desligado (FR-007). A linha do tempo agrega metadado de todas as
 * fatias e a audiência é decidida no banco; ligar esta rota exige a prova conectada com
 * dados fictícios e a revisão independente prevista. */
const LINHA_TEMPO_ATIVA = false;

export default async function linhaTempo(request: Request): Promise<Response> {
  if (!(LINHA_TEMPO_ATIVA && process.env.FFCM_LINHA_TEMPO_ATIVA === 'true'))
    return falha('servico_indisponivel');
  try {
    entrada ??= criarEntradaLinhaTempoNativa(configurarDependenciasNativas(process.env));
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
