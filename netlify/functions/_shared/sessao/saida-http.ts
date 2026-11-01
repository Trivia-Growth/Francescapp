import type { criarTransporteHttpSessaoComProva } from './http-prova.ts';

type Transporte = ReturnType<typeof criarTransporteHttpSessaoComProva>;
type Contexto = Awaited<ReturnType<Transporte['lerComandoComCookie']>>;

/** Sem rota pública. O executor deve verificar a prova vigente e confirmar a
 * revogação irreversível no banco antes de tentar o encerramento externo; falha
 * externa deve retornar pendência, sem reabrir a sessão. O transporte não
 * comprova esse contrato. A prova é sensível e não pode ser registrada. */
export function criarHandlerSaida(
  transporte: Transporte,
  encerrar: (contexto: Contexto) => Promise<unknown>,
) {
  return async (request: Request): Promise<Response> => {
    try {
      const contexto = await transporte.lerComandoComCookie(request, 'sairSessao');
      const resultado = await encerrar(contexto);
      return transporte.responderSaida(resultado, contexto);
    } catch (erro) {
      return transporte.responderFalha(erro);
    }
  };
}
