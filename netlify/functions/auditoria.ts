import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaConsultaAuditoriaNativa } from './_shared/entrada-consulta-auditoria-nativa.ts';

export const config = { path: '/api/admin/auditoria' };

let entrada: ReturnType<typeof criarEntradaConsultaAuditoriaNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function auditoria(request: Request): Promise<Response> {
  // Desligada por padrão: ativação exige a prova integrada de autorização administrador-only e de
  // que nenhuma coluna de conteúdo sai na resposta (FR-039). Variável ausente = serviço indisponível.
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaConsultaAuditoriaNativa(dependencias);
  } catch {
    return falha('configuracao_indisponivel');
  }
  // Interruptor administrado pela tela (`ffcm.auditoria.consulta_ativa`), com a variável de ambiente
  // como padrão quando o banco não responde ou não tem a chave. Não é autorização: a rota
  // segue validando sessão, concessão e atestado no banco.
  if (
    !(await servicoAtivo(
      dependencias.pool,
      'ffcm.auditoria.consulta_ativa',
      process.env.FFCM_AUDITORIA_CONSULTA_ATIVA === 'true',
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
