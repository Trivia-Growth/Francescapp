import {
  assinaturasRpc,
  limitePaginaSchema,
  uuidSchema,
  type AdaptadorCifra,
} from '@ffcmapp/contratos';
import { projetarPacienteBasicoExperimental } from './projetar-paciente-experimental.ts';

/** Somente servidor, após RPC autorizada e auditada. Não verifica identidade,
 * autorização nem auditoria; o cursor retornado é interno e deve ser selado
 * por identidade antes de qualquer resposta HTTP. Não conectar antes da S-02.
 * A situação do caso só atravessa quando o chamador a permite (lista do
 * Administrador); fora disso uma resposta que a traga é recusada. */
export async function processarCarteiraExperimental(
  respostaAutorizada: unknown,
  contexto: {
    requestId: string;
    limite: number;
    signal?: AbortSignal;
    situacaoPermitida?: boolean;
  },
  cifra: Pick<AdaptadorCifra, 'decifrar'>,
) {
  try {
    const requestId = uuidSchema.parse(contexto.requestId).toLowerCase();
    const limite = limitePaginaSchema.parse(contexto.limite);
    const resposta = assinaturasRpc.listarPacientes.saida.parse(respostaAutorizada);
    if (resposta.request_id.toLowerCase() !== requestId) throw new Error('Resposta incompatível.');
    if (!resposta.ok) return { ...resposta, request_id: requestId };
    if (resposta.dados.itens.length > limite) throw new Error('Página incompatível.');
    const cifraNoPrazo: Pick<AdaptadorCifra, 'decifrar'> = {
      async decifrar(envelope, aad) {
        if (contexto.signal?.aborted) throw new Error();
        return cifra.decifrar(envelope, aad);
      },
    };
    const itens = [];
    for (const { situacao, ...paciente } of resposta.dados.itens) {
      if (contexto.signal?.aborted) throw new Error();
      if (situacao !== undefined && contexto.situacaoPermitida !== true) throw new Error();
      const basico = await projetarPacienteBasicoExperimental(paciente, cifraNoPrazo);
      itens.push(situacao === undefined ? basico : { ...basico, situacao });
    }
    return {
      ok: true as const,
      request_id: requestId,
      dados: { itens, proximo_cursor: resposta.dados.proximo_cursor },
    };
  } catch {
    throw new Error('Não foi possível consultar a carteira.');
  }
}
