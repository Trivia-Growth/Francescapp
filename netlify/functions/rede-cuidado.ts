import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import {
  documentoRedeCuidadoSchema,
  salvarRedeCuidadoSchema,
} from '../../packages/contracts/src/rede-cuidado.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { DOCUMENTO_REDE_CUIDADO } from './_shared/compor-documento-paciente-nativo.ts';
import { criarEntradaDocumentoPacienteNativa } from './_shared/entrada-documento-paciente-nativa.ts';

export const config = { path: ['/api/pacientes/:paciente_id/rede-cuidado'] };

const corpoSchema = salvarRedeCuidadoSchema.transform((valor) => ({
  versao_esperada: valor.versao_esperada,
  conteudo: valor.pessoas,
}));

let entrada: ReturnType<typeof criarEntradaDocumentoPacienteNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function redeCuidado(request: Request): Promise<Response> {
  // Ativação exige provas integradas de autorização e sessão no ambiente-alvo.
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaDocumentoPacienteNativa(
      DOCUMENTO_REDE_CUIDADO,
      'rede-cuidado',
      corpoSchema,
      documentoRedeCuidadoSchema,
      dependencias,
    );
  } catch {
    return falha('configuracao_indisponivel');
  }
  // Interruptor administrado pela tela (`ffcm.rede_cuidado.ativa`), com a variável de ambiente
  // como padrão quando o banco não responde ou não tem a chave. Não é autorização: a rota
  // segue validando sessão, concessão e atestado no banco.
  if (
    !(await servicoAtivo(
      dependencias.pool,
      'ffcm.rede_cuidado.ativa',
      process.env.FFCM_REDE_CUIDADO_ATIVADA === 'true',
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
