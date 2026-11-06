import {
  campoCifradoSchema,
  criarAcessoPacienteSchema,
  revogarAcessoPacienteSchema,
  uuidSchema,
  type AdaptadorCifra,
} from '@ffcmapp/contratos';

/** Preparação server-only. Não autentica, autoriza ou comprova perfil do usuário. */
export async function prepararConcessaoAcessoPaciente(
  solicitacao: { pacienteId: unknown; acessoId: unknown; corpo: unknown },
  cifra: Pick<AdaptadorCifra, 'cifrar'>,
) {
  try {
    const paciente_id = uuidSchema.parse(solicitacao.pacienteId).toLowerCase();
    const acesso_id = uuidSchema.parse(solicitacao.acessoId).toLowerCase();
    const corpo = criarAcessoPacienteSchema.parse(solicitacao.corpo);
    const motivo = campoCifradoSchema.parse(
      await cifra.cifrar(corpo.motivo, {
        tabela: 'cadastro.acesso_paciente',
        registro_id: acesso_id,
        campo: 'motivo_concessao',
        formato: 1,
      }),
    );
    return { paciente_id, acesso_id, usuario_id: corpo.usuario_id.toLowerCase(), motivo };
  } catch {
    throw new Error('Não foi possível preparar a concessão de acesso.');
  }
}

/** Preparação isolada; revogação exige autorização e controle de versão no banco. */
export async function prepararRevogacaoAcessoPaciente(
  solicitacao: { pacienteId: unknown; acessoId: unknown; corpo: unknown },
  cifra: Pick<AdaptadorCifra, 'cifrar'>,
) {
  try {
    const paciente_id = uuidSchema.parse(solicitacao.pacienteId).toLowerCase();
    const acesso_id = uuidSchema.parse(solicitacao.acessoId).toLowerCase();
    const corpo = revogarAcessoPacienteSchema.parse(solicitacao.corpo);
    const motivo = campoCifradoSchema.parse(
      await cifra.cifrar(corpo.motivo, {
        tabela: 'cadastro.acesso_paciente',
        registro_id: acesso_id,
        campo: 'motivo_revogacao',
        formato: 1,
      }),
    );
    return { paciente_id, acesso_id, versao_esperada: corpo.versao_esperada, motivo };
  } catch {
    throw new Error('Não foi possível preparar a revogação de acesso.');
  }
}
