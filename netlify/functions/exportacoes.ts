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

/** Interruptor fixo, agora LIGADO (FR-032/FR-033), em 13/11/2026. Quem pode exportar já foi
 * decidido pelo solicitante — administrador e a profissional do caso, com `acesso_paciente`
 * vigente travado na transação — e a fatia não decifra nada no servidor. Exercitado antes de
 * ligar: a cadeia SQL em PostgreSQL descartável, com os negativos de audiência e a recusa por
 * vínculo revogado. NÃO exercitado: a tela autenticada em produção, e duas decisões seguem
 * abertas (o formato consultável e quem confere a entrega), registradas em `tasks.md`. A
 * partir daqui o interruptor real é `ffcm.exportacao.ativa`, na tela de administração. */
const EXPORTACAO_ATIVA = true;

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
