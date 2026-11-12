import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { criarEntradaRegrasAtendimentoNativa } from './_shared/entrada-regras-atendimento-nativa.ts';

export const config = { path: '/api/regras-atendimento' };

let entrada: ReturnType<typeof criarEntradaRegrasAtendimentoNativa> | undefined;

export default async function regrasAtendimento(request: Request): Promise<Response> {
  // Desligada por padrão: ativação exige a prova integrada de que só sessão válida lê e de que
  // nenhuma chave de 'servidor' ou 'administracao' escapa por este caminho (FR-041).
  if (process.env.FFCM_REGRAS_ATIVA !== 'true') return falha('servico_indisponivel');
  try {
    entrada ??= criarEntradaRegrasAtendimentoNativa(configurarDependenciasNativas(process.env));
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
