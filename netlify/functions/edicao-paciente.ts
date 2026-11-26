import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaEdicaoPacienteNativa } from './_shared/entrada-edicao-paciente-nativa.ts';

export const config = {
  path: [
    '/api/pacientes/:paciente_id',
    '/api/pacientes/edicao/disponibilidade',
    '/api/pacientes/edicao/reserva/consultar',
    '/api/pacientes/edicao/reserva',
    '/api/pacientes/edicao/reserva/encerrar',
    '/api/pacientes/edicao/reserva/reconhecer',
  ],
};
let entrada: ReturnType<typeof criarEntradaEdicaoPacienteNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;
export default async function edicaoPaciente(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const disponibilidade = url.pathname === '/api/pacientes/edicao/disponibilidade';
  if (disponibilidade && (request.method !== 'GET' || url.search || url.hash))
    return falha('servico_indisponivel');
  // Configuração ilegível continua fechando a disponibilidade em vez de estourar: a tela
  // esconde a edição em vez de oferecer um botão que falharia.
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaEdicaoPacienteNativa(dependencias);
  } catch {
    if (disponibilidade) return respostaDisponibilidade(false);
    return falha('configuracao_indisponivel');
  }
  // Interruptor administrado pela tela (`ffcm.cadastro.edicao_ativa`), com a variável de
  // ambiente como padrão quando o banco não responde ou não tem a chave. Não é autorização: a
  // rota segue validando sessão, concessão e atestado no banco.
  const disponivel = await servicoAtivo(
    dependencias.pool,
    'ffcm.cadastro.edicao_ativa',
    process.env.FFCM_EDICAO_PACIENTE_ATIVADA === 'true',
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
