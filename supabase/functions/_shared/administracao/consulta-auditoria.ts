import { assinaturasRpc, contratosRotas } from '../../../../packages/contracts/src/index.ts';

type Consulta = ReturnType<typeof contratosRotas.consultarAuditoria.entrada.parse>;

/** Somente servidor: a porta deve comprovar identidade, autorização e auditoria
 * transacional. Não conectar antes da S-02 e das provas reais no banco. */
export async function consultarAuditoriaExperimental(
  consulta: unknown,
  consultarRpc: (consulta: Consulta, requestId: string) => Promise<unknown>,
) {
  try {
    const filtros = contratosRotas.consultarAuditoria.entrada.parse(consulta);
    const requestId = crypto.randomUUID();
    const resposta = assinaturasRpc.consultarAuditoria.saida.parse(
      await consultarRpc(filtros, requestId),
    );
    if (resposta.request_id !== requestId) throw new Error();
    // Não existe ainda prova de cadastro ou revisão de operadores no banco.
    if (resposta.ok && resposta.dados.itens.some((evento) => evento.operador_restrito !== null)) {
      throw new Error();
    }
    return resposta;
  } catch {
    throw new Error('Não foi possível consultar a auditoria.');
  }
}
