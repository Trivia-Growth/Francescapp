import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaExportacaoNativa } from './_shared/entrada-exportacao-nativa.ts';

export const config = {
  path: [
    '/api/pacientes/:paciente_id/exportacoes',
    '/api/pacientes/:paciente_id/exportacoes/entrega',
  ],
};

let entrada: ReturnType<typeof criarEntradaExportacaoNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

/** Interruptor fixo e desligado (FR-032/FR-033). Exportar reúne o caso inteiro num
 * artefato: ligar esta rota exige a decisão do solicitante sobre quem pode exportar, a
 * prova conectada com dados fictícios e a revisão independente prevista. Ele vem ANTES da
 * configuração de propósito: enquanto estiver `false`, ligar a chave na tela não abre a rota. */
const EXPORTACAO_ATIVA = false;

export default async function exportacoes(request: Request): Promise<Response> {
  if (!EXPORTACAO_ATIVA) return falha('servico_indisponivel');
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaExportacaoNativa(dependencias);
  } catch {
    return falha('configuracao_indisponivel');
  }
  if (
    !(await servicoAtivo(
      dependencias.pool,
      'ffcm.exportacao.ativa',
      process.env.FFCM_EXPORTACAO_ATIVA === 'true',
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
