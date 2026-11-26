import {
  entradaBarreiraTarefaSchema,
  transporteBarreiraTarefaSchema,
} from '../../../packages/contracts/src/barreira-tarefa-cuidado-servidor.ts';
import {
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
  type ResultadoAtestacao,
} from '../../../packages/contracts/src/rpc.ts';

const entradasSemAtestado = [
  entradaBarreiraTarefaSchema.options[0].omit({ atestado: true }),
  entradaBarreiraTarefaSchema.options[1].omit({ atestado: true }),
  entradaBarreiraTarefaSchema.options[2].omit({ atestado: true }),
  entradaBarreiraTarefaSchema.options[3].omit({ atestado: true }),
] as const;

function validarEntrada(entrada: unknown) {
  for (const schema of entradasSemAtestado) {
    const resultado = schema.safeParse(entrada);
    if (resultado.success) return resultado.data;
  }
  throw new Error();
}

/** Somente servidor. Identidade deve vir de autorização comprovada; banco ainda
 * deve verificar assinatura, sessão e autorização. Não executa RPC. */
export async function prepararBarreiraTarefaNativa(
  request: Request,
  identidade: { usuario_id: string; session_id: string },
  entrada: unknown,
  dependencias: {
    metadados: { key_id: string; emitido_em: string; expira_em: string; request_id: string };
    atestador: {
      atestarEntrada(dados: unknown, entrada: Record<string, unknown>): Promise<ResultadoAtestacao>;
    };
  },
) {
  try {
    const contexto = dadosAtestadoSchema.omit({ operacao: true, digest_entrada: true }).parse({
      ...dependencias.metadados,
      ...identidade,
    });
    const usuario_id = contexto.usuario_id.toLowerCase();
    const session_id = contexto.session_id.toLowerCase();
    const request_id = contexto.request_id.toLowerCase();
    if (request.headers.get('x-sessao')?.toLowerCase() !== session_id) throw new Error();
    if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) throw new Error();
    const campos = entrada as Record<string, unknown>;
    if ('request_id' in campos || 'atestado' in campos) throw new Error();
    const validada = validarEntrada({ ...campos, request_id });
    const metadados = {
      ...contexto,
      usuario_id,
      session_id,
      request_id,
      operacao: validada.operacao,
    };
    const prova = resultadoAtestacaoSchema.parse(
      await dependencias.atestador.atestarEntrada({ ...metadados }, { ...validada }),
    );
    const assinada = validarEntrada(JSON.parse(prova.entradaCanonica));
    const dados = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
    if (
      Object.keys(validada).length !== Object.keys(assinada).length ||
      Object.entries(validada).some(
        ([chave, valor]) => assinada[chave as keyof typeof assinada] !== valor,
      ) ||
      Object.entries(metadados).some(
        ([chave, valor]) => dados[chave as keyof typeof dados] !== valor,
      ) ||
      Object.entries(dados).some(
        ([chave, valor]) => prova.atestado[chave as keyof typeof dados] !== valor,
      )
    )
      throw new Error();
    return transporteBarreiraTarefaSchema.parse({
      p_transporte: {
        entrada: { ...assinada, atestado: { ...dados, mac: prova.atestado.mac } },
        entrada_canonica: prova.entradaCanonica,
        dados_canonicos: prova.dadosCanonicos,
      },
    });
  } catch {
    throw new Error('Não foi possível preparar a barreira.');
  }
}
