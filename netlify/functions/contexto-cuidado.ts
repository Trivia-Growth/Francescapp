import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import {
  documentoContextoCuidadoSchema,
  salvarContextoCuidadoSchema,
} from '../../packages/contracts/src/contexto-cuidado.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { DOCUMENTO_CONTEXTO_CUIDADO } from './_shared/compor-documento-paciente-nativo.ts';
import { criarEntradaDocumentoPacienteNativa } from './_shared/entrada-documento-paciente-nativa.ts';

export const config = { path: ['/api/pacientes/:paciente_id/contexto-cuidado'] };

const corpoSchema = salvarContextoCuidadoSchema.transform((valor) => ({
  versao_esperada: valor.versao_esperada,
  conteudo: valor.elementos,
}));

let entrada: ReturnType<typeof criarEntradaDocumentoPacienteNativa> | undefined;

export default async function contextoCuidado(request: Request): Promise<Response> {
  // Ativação exige provas integradas de autorização e sessão no ambiente-alvo.
  if (process.env.FFCM_CONTEXTO_CUIDADO_ATIVADO !== 'true') return falha('servico_indisponivel');
  try {
    entrada ??= criarEntradaDocumentoPacienteNativa(
      DOCUMENTO_CONTEXTO_CUIDADO,
      'contexto-cuidado',
      corpoSchema,
      documentoContextoCuidadoSchema,
      configurarDependenciasNativas(process.env),
    );
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
