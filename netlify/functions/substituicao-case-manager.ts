import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaSubstituicaoCmNativa } from './_shared/entrada-substituicao-cm-nativa.ts';

export const config = {
  path: [
    '/api/pacientes/substituicao-case-manager/disponibilidade',
    '/api/pacientes/:paciente_id/substituicao-case-manager',
    '/api/pacientes/:paciente_id/substituicao-case-manager/encerramento',
  ],
};

let entrada: ReturnType<typeof criarEntradaSubstituicaoCmNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function substituicaoCaseManager(request: Request): Promise<Response> {
  // Administrador-only; autorização real fica no banco. Desativado por padrão.
  const url = new URL(request.url);
  const disponibilidade =
    url.pathname === '/api/pacientes/substituicao-case-manager/disponibilidade';
  if (disponibilidade && (request.method !== 'GET' || url.search || url.hash))
    return falha('servico_indisponivel');
  // Configuração ilegível fecha a disponibilidade em vez de estourar: a tela mostra a fatia
  // desligada em vez de oferecer um formulário que falharia.
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaSubstituicaoCmNativa(dependencias);
  } catch {
    if (disponibilidade) return respostaDisponibilidade(false);
    return falha('configuracao_indisponivel');
  }
  // Interruptor administrado (`ffcm.substituicao_cm.ativo`), com a variável de ambiente como
  // padrão quando o banco não responde ou não tem a chave. Não é autorização: a rota segue
  // validando sessão, perfil e atestado no banco.
  const disponivel = await servicoAtivo(
    dependencias.pool,
    'ffcm.substituicao_cm.ativo',
    process.env.FFCM_SUBSTITUICAO_CM_ATIVO === 'true',
  );
  // A sondagem não concede nada: diz apenas se a fatia está ligada, para a tela distinguir
  // "ainda não disponível" de "fora do ar". Toda operação continua autorizada no banco.
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
