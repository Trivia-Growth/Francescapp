import { sessaoAtualSchema } from '../../../../packages/contracts/src/identidade.ts';
import { criarErroPublicoSemCampos } from '../../../../packages/contracts/src/erros.ts';
import type { criarTransporteHttpSessaoComProva } from './http-prova.ts';

type Transporte = ReturnType<typeof criarTransporteHttpSessaoComProva>;
type Identidade = Awaited<ReturnType<Transporte['lerIdentidadeDaConsulta']>>;
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

/** Sem rota pública. Consultar deve comprovar sessão, geração, prova e autoridade
 * vigentes no banco; null é negativa confirmada. Não registrar identidade ou prova. */
export function criarHandlerConsultaSessao(
  transporte: Transporte,
  consultar: (identidade: Identidade) => Promise<unknown>,
) {
  return async (request: Request): Promise<Response> => {
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    let expirou = false;
    try {
      const prazo = new Promise<never>((_, rejeitar) => {
        temporizador = setTimeout(() => {
          expirou = true;
          rejeitar(new Error());
        }, 15_000);
      });
      const consulta = (async () => {
        const identidade = await transporte.lerIdentidadeDaConsulta(request);
        if (expirou) throw new Error();
        const resultado = await consultar(identidade);
        if (expirou) throw new Error();
        if (resultado === null)
          return Response.json(criarErroPublicoSemCampos('nao_autenticado', crypto.randomUUID()), {
            status: 401,
            headers,
          });
        const dados = sessaoAtualSchema.parse(resultado);
        if (!dados.usuario.ativo || dados.usuario.id !== identidade.usuarioId)
          throw new TypeError('Autoridade de sessão inválida.');
        return Response.json({ dados, request_id: crypto.randomUUID() }, { headers });
      })();
      return await Promise.race([consulta, prazo]);
    } catch (erro) {
      return transporte.responderFalha(erro);
    } finally {
      clearTimeout(temporizador);
    }
  };
}
