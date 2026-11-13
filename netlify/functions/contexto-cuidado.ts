import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import {
  documentoContextoCuidadoSchema,
  salvarContextoCuidadoSchema,
} from '../../packages/contracts/src/contexto-cuidado.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { DOCUMENTO_CONTEXTO_CUIDADO } from './_shared/compor-documento-paciente-nativo.ts';
import { criarEntradaDocumentoPacienteNativa } from './_shared/entrada-documento-paciente-nativa.ts';

export const config = { path: ['/api/pacientes/:paciente_id/contexto-cuidado'] };

const corpoSchema = salvarContextoCuidadoSchema.transform((valor) => ({
  versao_esperada: valor.versao_esperada,
  conteudo: valor.elementos,
}));

let entrada: ReturnType<typeof criarEntradaDocumentoPacienteNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function contextoCuidado(request: Request): Promise<Response> {
  // Ativação exige provas integradas de autorização e sessão no ambiente-alvo.
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaDocumentoPacienteNativa(
      DOCUMENTO_CONTEXTO_CUIDADO,
      'contexto-cuidado',
      corpoSchema,
      documentoContextoCuidadoSchema,
      dependencias,
    );
  } catch {
    return falha('configuracao_indisponivel');
  }
  // Interruptor administrado pela tela (`ffcm.contexto_cuidado.ativo`), com a variável de ambiente
  // como padrão quando o banco não responde ou não tem a chave. Não é autorização: a rota
  // segue validando sessão, concessão e atestado no banco.
  if (
    !(await servicoAtivo(
      dependencias.pool,
      'ffcm.contexto_cuidado.ativo',
      process.env.FFCM_CONTEXTO_CUIDADO_ATIVADO === 'true',
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
