import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaSolicitacaoTitularNativa } from './_shared/entrada-solicitacao-titular-nativa.ts';

export const config = { path: '/api/admin/solicitacoes-titular' };

let entrada: ReturnType<typeof criarEntradaSolicitacaoTitularNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function solicitacoesTitular(request: Request): Promise<Response> {
  // Desligada por padrão: ativação exige a prova integrada de autorização administrador-only, de
  // que o texto só trafega cifrado e de que `responder` não altera nada além da própria
  // solicitação (FR-040). Variável ausente = serviço indisponível.
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaSolicitacaoTitularNativa(dependencias);
  } catch {
    return falha('configuracao_indisponivel');
  }
  // Interruptor administrado pela tela (`ffcm.lgpd.ativa`), com a variável de ambiente
  // como padrão quando o banco não responde ou não tem a chave. Não é autorização: a rota
  // segue validando sessão, concessão e atestado no banco.
  if (
    !(await servicoAtivo(
      dependencias.pool,
      'ffcm.lgpd.ativa',
      process.env.FFCM_LGPD_ATIVA === 'true',
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
