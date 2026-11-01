import {
  consultaReconciliacaoCadastroSchema,
  paginaReconciliacaoCadastroSchema,
  resultadoRpcSchema,
  uuidSchema,
} from '@ffcmapp/contratos';

type Consulta = ReturnType<typeof consultaReconciliacaoCadastroSchema.parse>;

/** Não conectado a runtime. O adapter deve carregar JWT verificado no servidor
 * e o banco deve derivar o ator e revalidar autorização; esta função não os
 * comprova. A página contém identificadores vinculáveis: não logar nem enviar
 * ao navegador sem contrato/autorização/no-store revisados em S-02. */
export async function consultarReconciliacaoExperimental(
  consulta: unknown,
  adaptador: { consultar(entrada: { consulta: Consulta; request_id: string }): Promise<unknown> },
  requestId?: string,
) {
  try {
    const validada = consultaReconciliacaoCadastroSchema.parse(consulta);
    const limite = validada.limite;
    const request_id = uuidSchema.parse(requestId ?? crypto.randomUUID()).toLowerCase();
    const resposta = resultadoRpcSchema(paginaReconciliacaoCadastroSchema).parse(
      await adaptador.consultar({ consulta: validada, request_id }),
    );
    if (
      resposta.request_id.toLowerCase() !== request_id ||
      (resposta.ok && resposta.dados.itens.length > limite)
    ) {
      throw new Error('Resposta incompatível.');
    }
    return { ...resposta, request_id };
  } catch {
    throw new Error('Não foi possível consultar a reconciliação.');
  }
}
