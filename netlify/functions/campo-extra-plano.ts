import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { criarEntradaCampoExtraPlanoNativa } from './_shared/entrada-campo-extra-plano-nativa.ts';

export const config = { path: '/api/admin/campo-extra-plano' };

let entrada: ReturnType<typeof criarEntradaCampoExtraPlanoNativa> | undefined;

export default async function campoExtraPlano(request: Request): Promise<Response> {
  // Administrador-only; autorização real fica no banco. Desativado por padrão.
  if (process.env.FFCM_CAMPO_EXTRA_PLANO_ATIVO !== 'true') return falha('servico_indisponivel');
  try {
    entrada ??= criarEntradaCampoExtraPlanoNativa(configurarDependenciasNativas(process.env));
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
