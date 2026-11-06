import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import type { prepararBarreiraEdicaoPacientePrivada } from '../../../packages/cadastro/src/barreira-edicao-paciente-privada.ts';
import type { prepararEdicaoPacientePrivada } from '../../../packages/cadastro/src/editar-paciente-privado.ts';

type Cliente = ReturnType<typeof criarContextoAuthNativo>['cliente'];

/** Wrappers SQL privados sem grant de aplicação; nenhuma rota é publicada aqui. */
export async function executarBarreiraEdicaoPacienteNativa(
  cliente: Cliente,
  transporte: Awaited<ReturnType<typeof prepararBarreiraEdicaoPacientePrivada>>,
): Promise<unknown> {
  const resultado = await cliente.schema('api').rpc('edicao_paciente_composicao_privada', {
    p_transporte: transporte,
  });
  if (resultado.error) throw new Error('Não foi possível executar a barreira de edição.');
  return resultado.data;
}

export async function executarEdicaoPacienteNativa(
  cliente: Cliente,
  transporte: Awaited<ReturnType<typeof prepararEdicaoPacientePrivada>>['p_entrada'],
): Promise<unknown> {
  const resultado = await cliente.schema('api').rpc('editar_paciente_privado', {
    p_transporte: transporte,
  });
  if (resultado.error) throw new Error('Não foi possível executar a edição.');
  return resultado.data;
}
