import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaPendenciaNativa } from './_shared/entrada-pendencia-nativa.ts';

export const config = {
  path: [
    '/api/pacientes/:paciente_id/pendencias',
    '/api/pacientes/:paciente_id/pendencias/acordo',
    '/api/pacientes/:paciente_id/pendencias/tratativa',
    '/api/pendencias/disponibilidade',
  ],
};

let entrada: ReturnType<typeof criarEntradaPendenciaNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function pendencias(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const disponibilidade = url.pathname === '/api/pendencias/disponibilidade';
  if (disponibilidade && (request.method !== 'GET' || url.search || url.hash))
    return falha('servico_indisponivel');
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaPendenciaNativa(dependencias);
  } catch {
    // Sem conseguir montar o acesso ao banco não há configuração a ler, e aí vale a regra de
    // sempre: o ambiente é o padrão de última instância.
    if (disponibilidade)
      return respostaDisponibilidade(process.env.FFCM_PENDENCIAS_ATIVADAS === 'true');
    return falha('configuracao_indisponivel');
  }
  // Interruptor administrado pela tela (`ffcm.pendencias.ativas`), com a variável de ambiente
  // como padrão quando o banco não responde ou não tem a chave. Não é autorização: a rota segue
  // validando sessão, concessão e atestado no banco.
  const disponivel = await servicoAtivo(
    dependencias.pool,
    'ffcm.pendencias.ativas',
    process.env.FFCM_PENDENCIAS_ATIVADAS === 'true',
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
