import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { criarEntradaSolicitacaoTitularNativa } from './_shared/entrada-solicitacao-titular-nativa.ts';

export const config = { path: '/api/admin/solicitacoes-titular' };

let entrada: ReturnType<typeof criarEntradaSolicitacaoTitularNativa> | undefined;

export default async function solicitacoesTitular(request: Request): Promise<Response> {
  // Desligada por padrão: ativação exige a prova integrada de autorização administrador-only, de
  // que o texto só trafega cifrado e de que `responder` não altera nada além da própria
  // solicitação (FR-040). Variável ausente = serviço indisponível.
  if (process.env.FFCM_LGPD_ATIVA !== 'true') return falha('servico_indisponivel');
  try {
    entrada ??= criarEntradaSolicitacaoTitularNativa(configurarDependenciasNativas(process.env));
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
