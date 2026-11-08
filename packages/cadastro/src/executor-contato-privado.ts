import { assinaturasRpc, type AdaptadorCifra } from '@ffcmapp/contratos';
import { prepararComandoCriarContato } from './preparar-contato.ts';
import { projetarPacienteAdministrativoExperimental } from './projetar-paciente-experimental.ts';

type Preparacao = Parameters<typeof prepararComandoCriarContato>[1];
type Transporte = Awaited<ReturnType<typeof prepararComandoCriarContato>>;

/** Após envio, uma falha não prova rollback nem autoriza repetição automática. */
export class ResultadoContatoIncerto extends Error {
  constructor() {
    super('Não foi possível processar o contato.');
    this.name = 'ResultadoContatoIncerto';
  }
}

/** Composição somente servidor; contexto e executor exigem autenticação real.
 * Não conectar antes de S-02 e provas de autorização no banco. */
export async function executarCriacaoContatoPrivado(
  solicitacao: {
    pacienteId: unknown;
    corpo: unknown;
    cabecalhos: unknown;
    reservaId?: unknown;
    geracaoReserva?: unknown;
  },
  contextoComprovado: unknown,
  dependencias: Preparacao & {
    cifra: Pick<AdaptadorCifra, 'cifrar' | 'decifrar'>;
    rpc: { executar(transporte: Transporte): Promise<unknown> };
  },
) {
  let rpcIniciada = false;
  try {
    if (
      Object.keys(solicitacao).some(
        (chave) =>
          !['pacienteId', 'corpo', 'cabecalhos', 'reservaId', 'geracaoReserva'].includes(chave),
      )
    ) {
      throw new Error('Solicitação inválida.');
    }
    const transporte = await prepararComandoCriarContato(
      { ...solicitacao, contexto: contextoComprovado },
      dependencias,
    );
    const requestId = transporte.p_entrada.entrada.request_id;
    rpcIniciada = true;
    const resposta = await dependencias.rpc.executar(transporte);
    // SQL usa conflito para reserva antiga; o contrato público usa conflito_versao.
    const ajustada =
      resposta &&
      typeof resposta === 'object' &&
      'erro' in resposta &&
      resposta.erro &&
      typeof resposta.erro === 'object' &&
      'codigo' in resposta.erro &&
      resposta.erro.codigo === 'conflito'
        ? { ...resposta, erro: { ...resposta.erro, codigo: 'conflito_versao' } }
        : resposta;
    const resultado = assinaturasRpc.criarContato.saida.parse(ajustada);
    if (resultado.request_id !== requestId) throw new Error('Resposta incompatível.');
    if (!resultado.ok) {
      if (
        ![
          'entrada_invalida',
          'sem_permissao',
          'nao_encontrado',
          'conflito_idempotencia',
          'conflito_versao',
        ].includes(resultado.erro.codigo)
      ) {
        throw new ResultadoContatoIncerto();
      }
      return resultado;
    }
    if (resultado.dados.paciente_id !== transporte.p_entrada.entrada.paciente_id) {
      throw new ResultadoContatoIncerto();
    }
    return {
      ok: true as const,
      request_id: resultado.request_id,
      dados: await projetarPacienteAdministrativoExperimental(resultado.dados, dependencias.cifra),
    };
  } catch {
    if (rpcIniciada) throw new ResultadoContatoIncerto();
    throw new Error('Não foi possível processar o contato.');
  }
}
