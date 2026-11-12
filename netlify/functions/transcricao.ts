import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaTranscricaoNativa } from './_shared/entrada-transcricao-nativa.ts';

export const config = {
  path: [
    '/api/pacientes/:paciente_id/transcricoes',
    '/api/pacientes/:paciente_id/transcricoes/:audio_id',
    '/api/transcricao/disponibilidade',
  ],
};

let entrada: ReturnType<typeof criarEntradaTranscricaoNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

/** FR-010. A transcrição é SEMPRE um atalho: a tela só oferece o botão de gravar quando esta
 * rota se declara disponível, e a alternativa por texto não passa por aqui nem é afetada
 * quando o serviço está desligado. */
export default async function transcricao(request: Request): Promise<Response> {
  const url = new URL(request.url);
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaTranscricaoNativa(dependencias);
  } catch {
    return falha('configuracao_indisponivel');
  }
  // Interruptor administrado pela tela (`ffcm.transcricao.ativa`), com a variável de ambiente
  // como padrão. Não é autorização: a rota segue validando sessão, concessão e atestado.
  const ativa = await servicoAtivo(
    dependencias.pool,
    'ffcm.transcricao.ativa',
    process.env.FFCM_TRANSCRICAO_ATIVA === 'true',
  );
  if (url.pathname === '/api/transcricao/disponibilidade') {
    if (request.method !== 'GET' || url.search || url.hash) return falha('servico_indisponivel');
    return Response.json(
      { dados: { disponivel: ativa }, request_id: crypto.randomUUID() },
      { headers: cabecalhos },
    );
  }
  if (!ativa) return falha('servico_indisponivel');
  return entrada.atender(request);
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
