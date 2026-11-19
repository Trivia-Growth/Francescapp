import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaFinanceiraNativa } from './_shared/entrada-financeiro-nativa.ts';

export const config = {
  path: [
    '/api/financeiro/disponibilidade',
    '/api/financeiro/audiencia',
    '/api/financeiro/valores-acordados',
    '/api/financeiro/profissionais/:profissional_usuario_id/valores-acordados',
    '/api/financeiro/despesas',
    '/api/financeiro/despesas/:despesa_id/retificacoes',
    '/api/financeiro/casos/:paciente_id/despesas',
    '/api/financeiro/casos/:paciente_id/despesas/:despesa_id/comprovante',
    '/api/financeiro/apuracoes',
  ],
};

let entrada: ReturnType<typeof criarEntradaFinanceiraNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function financeiro(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const disponibilidade = url.pathname === '/api/financeiro/disponibilidade';
  if (disponibilidade && (request.method !== 'GET' || url.search || url.hash))
    return falha('servico_indisponivel');
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaFinanceiraNativa(dependencias);
  } catch {
    // Sem acesso ao banco não há configuração a ler; o ambiente é o padrão de última
    // instância, e o padrão do financeiro é desligado.
    if (disponibilidade)
      return respostaDisponibilidade(process.env.FFCM_FINANCEIRO_ATIVO === 'true');
    return falha('configuracao_indisponivel');
  }
  // Interruptor próprio do financeiro (`ffcm.financeiro.ativo`), separado do interruptor do
  // plano de crise e de qualquer trilha de cuidado. Falha fechado: desligado é o padrão, e
  // qualquer erro de leitura devolve o padrão de ambiente, que também é desligado quando a
  // variável não está presente. Não é autorização: mesmo ligado, cada rota continua
  // exigindo sessão, atestado e concessão financeira no banco.
  const disponivel = await servicoAtivo(
    dependencias.pool,
    'ffcm.financeiro.ativo',
    process.env.FFCM_FINANCEIRO_ATIVO === 'true',
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
