import {
  pacienteAdministrativoRpcSaidaSchema,
  pacienteAdministrativoSchema,
  pacienteBasicoRpcSaidaSchema,
  pacienteBasicoSchema,
  type AdaptadorCifra,
  type CampoCifrado,
} from '@ffcmapp/contratos';

/** Somente servidor, após autorização e auditoria da resposta básica. */
export async function projetarPacienteBasicoExperimental(
  respostaAutorizada: unknown,
  cifra: Pick<AdaptadorCifra, 'decifrar'>,
) {
  try {
    const paciente = pacienteBasicoRpcSaidaSchema.parse(respostaAutorizada);
    const decifrar = (campo: string, envelope: CampoCifrado) =>
      cifra.decifrar(envelope, {
        tabela: 'cadastro.paciente',
        registro_id: paciente.paciente_id,
        campo,
        formato: envelope.formato,
      });
    return pacienteBasicoSchema.parse({
      id: paciente.paciente_id,
      nome: await decifrar('nome', paciente.nome),
      nome_preferencia:
        paciente.nome_preferencia === null
          ? null
          : await decifrar('nome_preferencia', paciente.nome_preferencia),
      versao: paciente.versao,
    });
  } catch {
    throw new Error('Não foi possível processar o cadastro.');
  }
}

/** Somente servidor: exige resposta já autorizada e auditada pela RPC.
 * Não verifica autorização; não conectar antes da revisão S-02. */
export async function projetarPacienteAdministrativoExperimental(
  respostaAutorizada: unknown,
  cifra: Pick<AdaptadorCifra, 'decifrar'>,
) {
  try {
    const paciente = pacienteAdministrativoRpcSaidaSchema.parse(respostaAutorizada);
    const decifrarPaciente = (campo: string, envelope: CampoCifrado) =>
      cifra.decifrar(envelope, {
        tabela: 'cadastro.paciente',
        registro_id: paciente.paciente_id,
        campo,
        formato: envelope.formato,
      });
    const nome = await decifrarPaciente('nome', paciente.nome);
    const nomePreferencia =
      paciente.nome_preferencia === null
        ? null
        : await decifrarPaciente('nome_preferencia', paciente.nome_preferencia);
    const nascimento =
      paciente.data_nascimento === null
        ? null
        : await decifrarPaciente('data_nascimento', paciente.data_nascimento);
    const contatos = [];
    for (const contato of paciente.contatos) {
      contatos.push({
        id: contato.contato_id,
        tipo: contato.tipo,
        valor: await cifra.decifrar(contato.valor, {
          tabela: 'cadastro.contato_paciente',
          registro_id: contato.contato_id,
          campo: 'valor',
          formato: contato.valor.formato,
        }),
        versao: contato.versao,
      });
    }
    return pacienteAdministrativoSchema.parse({
      id: paciente.paciente_id,
      nome,
      nome_preferencia: nomePreferencia,
      data_nascimento: nascimento,
      contatos,
      versao: paciente.versao,
    });
  } catch {
    throw new Error('Não foi possível processar o cadastro.');
  }
}
