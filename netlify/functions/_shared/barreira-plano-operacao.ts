import {
  consultaBarreiraPlanoResultadoSchema,
  estadoEncerramentoPlanoSchema,
  estadoReconhecimentoPlanoSchema,
  estadoReservaPlanoSchema,
  respostaBarreiraPlanoSchema,
} from '../../../packages/contracts/src/barreira-plano.ts';
import { prepararBarreiraPlanoNativa } from './barreira-plano-nativa.ts';

type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel' };

/** Operação interna: sem rota nem concessão à função privada do banco. */
export async function operarBarreiraPlanoNativa(
  request: Request,
  entrada: unknown,
  portas: {
    autorizar(request: Request): Promise<Autorizacao>;
    revalidar(request: Request): Promise<Autorizacao>;
    metadados(requestId: string): {
      key_id: string;
      emitido_em: string;
      expira_em: string;
      request_id: string;
    };
    atestador: Parameters<typeof prepararBarreiraPlanoNativa>[3]['atestador'];
    executar(transporte: Awaited<ReturnType<typeof prepararBarreiraPlanoNativa>>): Promise<unknown>;
  },
) {
  const requestId = crypto.randomUUID();
  const erro = (codigo: string) => ({
    ok: false as const,
    erro: { codigo },
    request_id: requestId,
  });
  let iniciada = false;
  try {
    if (request.signal.aborted) return erro('servico_indisponivel');
    const autorizacao = await portas.autorizar(request);
    if (autorizacao.estado !== 'autorizado') return erro(autorizacao.estado);
    const transporte = await prepararBarreiraPlanoNativa(request, autorizacao.identidade, entrada, {
      metadados: portas.metadados(requestId),
      atestador: portas.atestador,
    });
    if (transporte.p_transporte.entrada.request_id !== requestId || request.signal.aborted)
      throw new Error();
    const operacao = transporte.p_transporte.entrada.operacao;
    iniciada = operacao !== 'api.consultar_barreira_plano';
    const resposta = respostaBarreiraPlanoSchema.parse(await portas.executar(transporte));
    if (resposta.request_id !== requestId || request.signal.aborted) throw new Error();
    if (resposta.ok) {
      const dados = resposta.dados;
      const valido =
        operacao === 'api.consultar_barreira_plano'
          ? consultaBarreiraPlanoResultadoSchema.safeParse(dados).success
          : 'estado' in dados &&
            (operacao === 'api.reservar_plano'
              ? estadoReservaPlanoSchema
              : operacao === 'api.encerrar_plano'
                ? estadoEncerramentoPlanoSchema
                : estadoReconhecimentoPlanoSchema
            ).safeParse(dados.estado).success;
      if (!valido) throw new Error();
    }
    const atual = await portas.revalidar(request);
    if (
      request.signal.aborted ||
      atual.estado !== 'autorizado' ||
      atual.identidade.usuario_id.toLowerCase() !==
        autorizacao.identidade.usuario_id.toLowerCase() ||
      atual.identidade.session_id.toLowerCase() !== autorizacao.identidade.session_id.toLowerCase()
    )
      return erro(iniciada ? 'pendencia_externa' : 'nao_autenticado');
    return resposta;
  } catch {
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  }
}
