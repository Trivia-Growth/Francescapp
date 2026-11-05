import { CompactEncrypt, compactDecrypt } from 'jose';

type Vinculo = Readonly<{
  usuarioId: string;
  subjectGoogle: string;
  versao: string;
  operacaoId: string;
}>;

/** O comprovante não substitui sessão nem autorização no banco. */
export function criarIntencaoDesconexao(chave: Uint8Array) {
  if (chave.length !== 32) throw new Error('Conexão indisponível.');
  const chaveInterna = new Uint8Array(chave);
  return {
    async emitir(vinculo: Vinculo): Promise<string> {
      return await new CompactEncrypt(new TextEncoder().encode(JSON.stringify(vinculo)))
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'ffcm-agenda-desconexao' })
        .encrypt(chaveInterna);
    },
    async conferir(token: string, esperado: Vinculo): Promise<boolean> {
      if (token.length < 1 || token.length > 2048) return false;
      try {
        const { plaintext, protectedHeader } = await compactDecrypt(token, chaveInterna, {
          keyManagementAlgorithms: ['dir'],
          contentEncryptionAlgorithms: ['A256GCM'],
        });
        if (protectedHeader.typ !== 'ffcm-agenda-desconexao') return false;
        const dados: unknown = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(plaintext),
        );
        return (
          typeof dados === 'object' &&
          dados !== null &&
          !Array.isArray(dados) &&
          Object.keys(dados).length === 4 &&
          'usuarioId' in dados &&
          dados.usuarioId === esperado.usuarioId &&
          'subjectGoogle' in dados &&
          dados.subjectGoogle === esperado.subjectGoogle &&
          'versao' in dados &&
          dados.versao === esperado.versao &&
          'operacaoId' in dados &&
          dados.operacaoId === esperado.operacaoId
        );
      } catch {
        return false;
      }
    },
  };
}
