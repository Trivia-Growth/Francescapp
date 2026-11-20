import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaRealizacaoCompromissoNativa } from './_shared/entrada-realizacao-compromisso-nativa.ts';

export const config = {
  path: [
    '/api/agenda/realizacao',
    '/api/agenda/realizacao/consulta',
    '/api/agenda/realizacao/disponibilidade',
  ],
};

let entrada: ReturnType<typeof criarEntradaRealizacaoCompromissoNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

/** FR-024. Interruptor PRÓPRIO: registrar o que aconteceu com um compromisso não pode
 * depender de a integração Google estar ligada. Não é autorização — a rota segue validando
 * sessão, concessão, atestado e audiência no banco. */
export default async function realizacaoCompromisso(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const disponibilidade = url.pathname === '/api/agenda/realizacao/disponibilidade';
  if (disponibilidade && (request.method !== 'GET' || url.search || url.hash))
    return falha('servico_indisponivel');
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaRealizacaoCompromissoNativa(dependencias);
  } catch {
    if (disponibilidade)
      return respostaDisponibilidade(process.env.FFCM_REALIZACAO_COMPROMISSO_ATIVO === 'true');
    return falha('configuracao_indisponivel');
  }
  const disponivel = await servicoAtivo(
    dependencias.pool,
    'ffcm.realizacao_compromisso.ativo',
    process.env.FFCM_REALIZACAO_COMPROMISSO_ATIVO === 'true',
  );
  if (disponibilidade) return respostaDisponibilidade(disponivel);
  if (!disponivel) return falha('servico_indisponivel');
  return entrada.atender(request);
}

function respostaDisponibilidade(disponivel: boolean): Response {
  return Response.json(
    { dados: { disponivel }, request_id: crypto.randomUUID() },
    { headers: cabecalhos },
  );
}

const cabecalhos = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function falha(codigo: 'servico_indisponivel' | 'configuracao_indisponivel'): Response {
  return Response.json(criarErroPublicoSemCampos(codigo, crypto.randomUUID()), {
    status: 503,
    headers: cabecalhos,
  });
}
