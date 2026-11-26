import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaEncaminhamentoNativa } from './_shared/entrada-encaminhamento-nativa.ts';

export const config = {
  path: ['/api/pacientes/:paciente_id/encaminhamentos', '/api/encaminhamentos/disponibilidade'],
};

let entrada: ReturnType<typeof criarEntradaEncaminhamentoNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function encaminhamento(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const disponibilidade = url.pathname === '/api/encaminhamentos/disponibilidade';
  if (disponibilidade && (request.method !== 'GET' || url.search || url.hash))
    return falha('servico_indisponivel');
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaEncaminhamentoNativa(dependencias);
  } catch {
    // Sem conseguir montar o acesso ao banco não há configuração a ler, e aí vale a regra de
    // sempre: o ambiente é o padrão de última instância.
    if (disponibilidade)
      return respostaDisponibilidade(process.env.FFCM_ENCAMINHAMENTOS_ATIVADO === 'true');
    return falha('configuracao_indisponivel');
  }
  // Interruptor administrado pela tela (`ffcm.encaminhamentos.ativo`), com a variável de
  // ambiente como padrão quando o banco não responde ou não tem a chave. Não é autorização: a
  // rota segue validando sessão, concessão e atestado no banco.
  const disponivel = await servicoAtivo(
    dependencias.pool,
    'ffcm.encaminhamentos.ativo',
    process.env.FFCM_ENCAMINHAMENTOS_ATIVADO === 'true',
  );
  if (disponibilidade) return respostaDisponibilidade(disponivel);
  if (!disponivel) return falha('servico_indisponivel');
  return entrada.atender(request);
}

function respostaDisponibilidade(disponivel: boolean): Response {
  return Response.json(
    { dados: { disponivel }, request_id: crypto.randomUUID() },
    {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    },
  );
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
