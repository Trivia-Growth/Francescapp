import type { prepararVinculoFamiliarPrivado } from '../../../packages/cadastro/src/vinculo-familiar-privado.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';

type Cliente = ReturnType<typeof criarContextoAuthNativo>['cliente'];
type Transporte = Awaited<ReturnType<typeof prepararVinculoFamiliarPrivado>>;

/** Preparação privada: a RPC não tem grant de aplicação e nenhuma rota é ativada. */
export async function executarVinculoFamiliarNativo(
  cliente: Cliente,
  transporte: Transporte,
): Promise<unknown> {
  // A repetição exige o mesmo envelope cifrado; recifrar torna a operação divergente.
  const resultado = await cliente.schema('api').rpc('conceder_acesso_familiar_privado', transporte);
  if (resultado.error) throw new Error('Não foi possível executar o vínculo familiar.');
  return resultado.data;
}
