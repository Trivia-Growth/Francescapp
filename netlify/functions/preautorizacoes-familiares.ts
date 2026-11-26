import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { criarEntradaPreautorizacaoFamiliarNativa } from './_shared/entrada-preautorizacao-familiar-nativa.ts';

export const config = { path: '/api/admin/preautorizacoes-familiares' };

let entrada: ReturnType<typeof criarEntradaPreautorizacaoFamiliarNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function preautorizacoesFamiliares(request: Request): Promise<Response> {
  // Administrador-only; a autorização que vale é a do banco. Mesma capacidade exigida
  // para convidar: quem convida é quem cancela.
  // Gate fixo: o convite familiar ainda não foi comprovado com caixa de entrada real,
  // e cancelar faz parte do mesmo fluxo. Sai junto com ele.
  const integracaoComprovada = false;
  if (!integracaoComprovada || process.env.FFCM_CANCELAR_PREAUTORIZACAO_ATIVO !== 'true')
    return falha('servico_indisponivel');
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaPreautorizacaoFamiliarNativa(dependencias);
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
