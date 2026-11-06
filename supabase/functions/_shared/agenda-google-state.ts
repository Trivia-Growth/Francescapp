import { CompactEncrypt, compactDecrypt } from 'jose';

/** O repositório deve conferir sessão ativa e consumir a linha atomicamente no banco.
 * O valor selado contém PKCE e nonce; nunca deve ser enviado ao navegador. */
export type RepositorioStateAgenda = Readonly<{
  registrar: (
    dados: Readonly<{ hash: string; usuarioId: string; sessaoId: string; selado: string }>,
  ) => Promise<void>;
  consumir: (
    dados: Readonly<{ hash: string; usuarioId: string; sessaoId: string }>,
  ) => Promise<Readonly<{ selado: string; geracao: string }> | null>;
}>;

const formato = /^[A-Za-z0-9_-]{43}$/;
const codificador = new TextEncoder();

async function hashState(state: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', codificador.encode(state));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Somente servidor. A expiração e o consumo único são impostos pelo repositório. */
export function criarStateAgenda(chave: Uint8Array, repositorio: RepositorioStateAgenda) {
  if (chave.byteLength !== 32) throw new TypeError('Configuração de state indisponível.');
  const chaveInterna = new Uint8Array(chave);
  return Object.freeze({
    async registrar(
      dados: Readonly<{
        state: string;
        verificador: string;
        nonce: string;
        usuarioId: string;
        sessaoId: string;
      }>,
    ) {
      if (
        ![dados.state, dados.verificador, dados.nonce].every((valor) => formato.test(valor)) ||
        !dados.usuarioId ||
        !dados.sessaoId
      )
        throw new Error('Consentimento indisponível.');
      try {
        const selado = await new CompactEncrypt(
          codificador.encode(
            JSON.stringify({
              verificador: dados.verificador,
              nonce: dados.nonce,
              usuarioId: dados.usuarioId,
              sessaoId: dados.sessaoId,
              hash: await hashState(dados.state),
            }),
          ),
        )
          .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'ffcm-agenda-oauth' })
          .encrypt(chaveInterna);
        await repositorio.registrar({
          hash: await hashState(dados.state),
          usuarioId: dados.usuarioId,
          sessaoId: dados.sessaoId,
          selado,
        });
      } catch {
        throw new Error('Consentimento indisponível.');
      }
    },
    async consumir(dados: Readonly<{ state: string; usuarioId: string; sessaoId: string }>) {
      if (!formato.test(dados.state) || !dados.usuarioId || !dados.sessaoId)
        throw new Error('Consentimento indisponível.');
      try {
        const resultado = await repositorio.consumir({
          hash: await hashState(dados.state),
          usuarioId: dados.usuarioId,
          sessaoId: dados.sessaoId,
        });
        if (
          !resultado ||
          resultado.selado.length > 2048 ||
          !/^[0-9]{1,19}$/.test(resultado.geracao)
        )
          throw new Error();
        const { plaintext, protectedHeader } = await compactDecrypt(
          resultado.selado,
          chaveInterna,
          {
            keyManagementAlgorithms: ['dir'],
            contentEncryptionAlgorithms: ['A256GCM'],
          },
        );
        if (protectedHeader.typ !== 'ffcm-agenda-oauth') throw new Error();
        const conteudo: unknown = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(plaintext),
        );
        if (
          typeof conteudo !== 'object' ||
          conteudo === null ||
          !('usuarioId' in conteudo) ||
          conteudo.usuarioId !== dados.usuarioId ||
          !('sessaoId' in conteudo) ||
          conteudo.sessaoId !== dados.sessaoId ||
          !('hash' in conteudo) ||
          conteudo.hash !== (await hashState(dados.state)) ||
          !('verificador' in conteudo) ||
          typeof conteudo.verificador !== 'string' ||
          !formato.test(conteudo.verificador) ||
          !('nonce' in conteudo) ||
          typeof conteudo.nonce !== 'string' ||
          !formato.test(conteudo.nonce)
        )
          throw new Error();
        return Object.freeze({
          verificador: conteudo.verificador,
          nonce: conteudo.nonce,
          geracao: resultado.geracao,
        });
      } catch {
        throw new Error('Consentimento indisponível.');
      }
    },
  });
}
