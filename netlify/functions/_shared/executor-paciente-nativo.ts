import type { prepararComandoCriarPaciente } from '../../../packages/cadastro/src/preparar-paciente.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

/** Contrato futuro: api.criar_paciente(p_transporte jsonb) deve preservar o
 * JWT e autorizar, verificar a assinatura e auditar na mesma transação. A RPC
 * ainda não foi comprovada. Não conectar antes de S-02, revisão de privilégios,
 * concorrência Auth e provas de autorização e revogação no banco. */
export async function executarPacienteNativo(
  cliente: ReturnType<typeof criarContextoAuthNativo>['cliente'],
  transporte: Awaited<ReturnType<typeof prepararComandoCriarPaciente>>,
): Promise<unknown> {
  try {
    const resultado = await cliente.schema('api').rpc('criar_paciente', {
      p_transporte: transporte.p_entrada,
    });
    if (resultado.error) throw new Error();
    return resultado.data;
  } catch {
    throw new Error('Não foi possível executar o cadastro.');
  }
}
