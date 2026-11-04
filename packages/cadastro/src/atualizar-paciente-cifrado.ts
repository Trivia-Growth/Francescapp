import {
  atualizarPacienteSchema,
  campoCifradoSchema,
  uuidSchema,
  type AdaptadorCifra,
  type MetadadosAad,
} from '@ffcmapp/contratos';

/** Retorna apenas campos parciais, não um comando RPC. A composição auditada
 * deve cifrar o motivo do mesmo corpo, após definir seu AAD. Não verifica
 * autorização ou versão no banco; não conectar antes da S-02. */
export async function prepararCamposPacienteCifradosParciais(
  identificador: unknown,
  corpo: unknown,
  cifra: Pick<AdaptadorCifra, 'cifrar'>,
) {
  try {
    const paciente_id = uuidSchema.parse(identificador).toLowerCase();
    const dados = atualizarPacienteSchema.parse(corpo);
    const aadCampo = <C extends 'nome' | 'nome_preferencia' | 'data_nascimento'>(campo: C) =>
      Object.freeze({
        tabela: 'cadastro.paciente' as const,
        registro_id: paciente_id,
        campo,
        formato: 1 as const,
      });
    const nome = aadCampo('nome');
    const preferencia = aadCampo('nome_preferencia');
    const nascimento = aadCampo('data_nascimento');
    const aad = Object.freeze({
      ...(dados.nome === undefined ? {} : { nome }),
      ...(dados.nome_preferencia == null ? {} : { nome_preferencia: preferencia }),
      ...(dados.data_nascimento == null ? {} : { data_nascimento: nascimento }),
    });
    const cifrar = async (metadados: MetadadosAad, valor: string) =>
      campoCifradoSchema.parse(await cifra.cifrar(valor, metadados));
    return {
      paciente_id,
      versao_esperada: dados.versao_esperada,
      ...(dados.nome === undefined ? {} : { nome: await cifrar(nome, dados.nome) }),
      ...(dados.nome_preferencia === undefined
        ? {}
        : {
            nome_preferencia:
              dados.nome_preferencia === null
                ? null
                : await cifrar(preferencia, dados.nome_preferencia),
          }),
      ...(dados.data_nascimento === undefined
        ? {}
        : {
            data_nascimento:
              dados.data_nascimento === null
                ? null
                : await cifrar(nascimento, dados.data_nascimento),
          }),
      aad,
    };
  } catch {
    throw new Error('Não foi possível preparar a atualização do cadastro.');
  }
}

/** Preparação privada, sem autorização nem persistência. A composição futura
 * deve gravar motivo e evento na mesma transação e passar por S-02. */
export async function prepararMotivoAtualizacaoPaciente(
  corpo: unknown,
  identificadorAuditoria: unknown,
  cifra: Pick<AdaptadorCifra, 'cifrar'>,
) {
  try {
    const dados = atualizarPacienteSchema.parse(corpo);
    const auditoria_id = uuidSchema.parse(identificadorAuditoria).toLowerCase();
    const aad = Object.freeze({
      tabela: 'auditoria.evento' as const,
      registro_id: auditoria_id,
      campo: 'motivo' as const,
      formato: 1 as const,
    });
    return {
      auditoria_id,
      motivo: campoCifradoSchema.parse(await cifra.cifrar(dados.motivo, aad)),
      aad,
    };
  } catch {
    throw new Error('Não foi possível preparar o motivo da atualização.');
  }
}
