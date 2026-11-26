import {
  base64UrlSchema,
  campoCifradoSchema,
  criarConcessaoEquipeSchema,
  uuidSchema,
  type AdaptadorCifra,
} from '@ffcmapp/contratos';

/** Prepara campos protegidos; não autoriza nem persiste a concessão. */
export async function prepararConcessaoEquipe(
  solicitacao: { concessaoId: unknown; corpo: unknown },
  cifra: Pick<AdaptadorCifra, 'cifrar'> & { calcularHmac(valor: string): Promise<string> },
) {
  const concessao_id = uuidSchema.parse(solicitacao.concessaoId).toLowerCase();
  const dados = criarConcessaoEquipeSchema.parse(solicitacao.corpo);
  const email = dados.email.toLowerCase();
  const aad = {
    tabela: 'identidade.concessao_equipe' as const,
    registro_id: concessao_id,
    formato: 1 as const,
  };
  return {
    concessao_id,
    email: campoCifradoSchema.parse(await cifra.cifrar(email, { ...aad, campo: 'email' })),
    email_hmac: base64UrlSchema.parse(await cifra.calcularHmac(`email-concessao:${email}`)),
    perfil: dados.perfil,
    metodo: dados.metodo,
    motivo: campoCifradoSchema.parse(await cifra.cifrar(dados.motivo, { ...aad, campo: 'motivo' })),
  };
}
