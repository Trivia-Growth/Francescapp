import { assinaturasRpc, type AdaptadorCifra } from '@ffcmapp/contratos';
import { prepararComandoCriarPaciente } from './preparar-paciente.ts';
import { projetarPacienteAdministrativoExperimental } from './projetar-paciente-experimental.ts';

type Preparacao = Parameters<typeof prepararComandoCriarPaciente>[1];
type Transporte = Awaited<ReturnType<typeof prepararComandoCriarPaciente>>;

/** Após início da RPC, falha não prova rollback nem autoriza repetição automática. */
export class ResultadoCadastroIncerto extends Error {
  constructor() {
    super('Não foi possível processar o cadastro.');
    this.name = 'ResultadoCadastroIncerto';
  }
}

/** Apenas experimento testável, não exportado pelo pacote e não conectado a RPC.
 * O contexto e o executor devem ser fornecidos exclusivamente pelo servidor
 * após verificação de identidade. O tipo não comprova essa condição. S-02 e
 * a autorização/verificação transacional no banco são pré-requisitos de uso. */
export async function executarCriacaoPacienteExperimental(
  solicitacao: { corpo: unknown; cabecalhos: unknown },
  contextoComprovado: unknown,
  dependencias: Preparacao & {
    /** Exclusivamente servidor; a estrutura não comprova origem ou validade. */
    reserva: unknown;
    cifra: Pick<AdaptadorCifra, 'cifrar' | 'decifrar'>;
    rpc: { executar(transporte: Transporte): Promise<unknown> };
  },
) {
  let rpcIniciada = false;
  try {
    if (Object.keys(solicitacao).some((chave) => chave !== 'corpo' && chave !== 'cabecalhos')) {
      throw new Error('Solicitação inválida.');
    }
    const transporte = await prepararComandoCriarPaciente(
      { ...solicitacao, contexto: contextoComprovado, reserva: dependencias.reserva },
      dependencias,
    );
    const requestId = transporte.p_entrada.entrada.request_id;
    rpcIniciada = true;
    const resultado = assinaturasRpc.criarPaciente.saida.parse(
      await dependencias.rpc.executar(transporte),
    );
    if (resultado.request_id !== requestId) throw new Error('Resposta incompatível.');
    if (!resultado.ok) {
      if (
        !['entrada_invalida', 'sem_permissao', 'conflito_idempotencia'].includes(
          resultado.erro.codigo,
        )
      )
        throw new ResultadoCadastroIncerto();
      return resultado;
    }
    return {
      ok: true as const,
      request_id: resultado.request_id,
      dados: await projetarPacienteAdministrativoExperimental(resultado.dados, dependencias.cifra),
    };
  } catch {
    if (rpcIniciada) throw new ResultadoCadastroIncerto();
    throw new Error('Não foi possível processar o cadastro.');
  }
}
