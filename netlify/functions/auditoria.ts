import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { criarEntradaConsultaAuditoriaNativa } from './_shared/entrada-consulta-auditoria-nativa.ts';

export const config = { path: '/api/admin/auditoria' };

let entrada: ReturnType<typeof criarEntradaConsultaAuditoriaNativa> | undefined;

export default async function auditoria(request: Request): Promise<Response> {
  // Desligada por padrão: ativação exige a prova integrada de autorização administrador-only e de
  // que nenhuma coluna de conteúdo sai na resposta (FR-039). Variável ausente = serviço indisponível.
  if (process.env.FFCM_AUDITORIA_CONSULTA_ATIVA !== 'true') return falha('servico_indisponivel');
  try {
    entrada ??= criarEntradaConsultaAuditoriaNativa(configurarDependenciasNativas(process.env));
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
