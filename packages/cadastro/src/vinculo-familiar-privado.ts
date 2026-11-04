import {
  campoCifradoSchema,
  entradaVinculoFamiliarPrivadoSchema,
  type AdaptadorCifra,
} from '@ffcmapp/contratos';

/** Preparação privada; não autentica, autoriza ou ativa a operação no banco. */
export async function prepararVinculoFamiliarPrivado(
  entrada: unknown,
  cifra: Pick<AdaptadorCifra, 'cifrar'>,
) {
  try {
    const dados = entradaVinculoFamiliarPrivadoSchema.parse(entrada);
    const operacaoId = dados.operacao_id.toLowerCase();
    const aad = {
      tabela: 'cadastro.acesso_paciente' as const,
      registro_id: operacaoId,
      campo: 'motivo_concessao' as const,
      formato: 1 as const,
    };
    const motivo = campoCifradoSchema.parse(await cifra.cifrar(dados.motivo, aad));
    // A repetição da operação SQL exige exatamente o mesmo envelope cifrado.
    return Object.freeze({
      p_operacao_id: operacaoId,
      p_request_id: dados.request_id.toLowerCase(),
      p_paciente_id: dados.paciente_id.toLowerCase(),
      p_familiar_id: dados.familiar_id.toLowerCase(),
      p_motivo_cifrado: Object.freeze(motivo),
    });
  } catch {
    throw new Error('Não foi possível preparar o vínculo familiar.');
  }
}
