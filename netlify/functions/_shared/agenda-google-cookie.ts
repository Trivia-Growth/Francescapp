import { CompactEncrypt, compactDecrypt } from 'jose';

const formato = /^[A-Za-z0-9_-]{43}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const nome = '__Host-ffcm-agenda';

/** Cookie temporário, cifrado e limitado à origem HTTPS. Não contém token Google. */
export function criarCookieAgenda(chave: Uint8Array) {
  if (chave.length !== 32) throw new Error('Conexão indisponível.');
  const chaveInterna = new Uint8Array(chave);
  return {
    async emitir(state: string, sessaoId: string, fluxo: string | null): Promise<string> {
      if (
        !formato.test(state) ||
        !uuid.test(sessaoId) ||
        (fluxo !== null && !/^[A-Za-z0-9_-]{22}$/.test(fluxo))
      )
        throw new Error('Conexão indisponível.');
      const conteudo = new TextEncoder().encode(
        JSON.stringify({ state, sessaoId, fluxo, expira: Date.now() + 600_000 }),
      );
      const selado = await new CompactEncrypt(conteudo)
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'ffcm-agenda-cookie' })
        .encrypt(chaveInterna);
      return `${nome}=${selado}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`;
    },
    async abrir(
      cookie: string,
      state: string,
    ): Promise<{ sessaoId: string; fluxo: string | null }> {
      if (!formato.test(state) || cookie.length > 8192) throw new Error('Conexão indisponível.');
      const encontrados = cookie
        .split(';')
        .map((item) => item.trim())
        .filter((item) => item.startsWith(`${nome}=`));
      if (encontrados.length !== 1) throw new Error('Conexão indisponível.');
      const valor = encontrados[0]?.slice(nome.length + 1);
      if (!valor || valor.length > 2048) throw new Error('Conexão indisponível.');
      const { plaintext, protectedHeader } = await compactDecrypt(valor, chaveInterna, {
        keyManagementAlgorithms: ['dir'],
        contentEncryptionAlgorithms: ['A256GCM'],
      });
      const dados: unknown = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(plaintext),
      );
      if (
        protectedHeader.typ !== 'ffcm-agenda-cookie' ||
        typeof dados !== 'object' ||
        dados === null ||
        !('state' in dados) ||
        dados.state !== state ||
        !('sessaoId' in dados) ||
        typeof dados.sessaoId !== 'string' ||
        !uuid.test(dados.sessaoId) ||
        !('fluxo' in dados) ||
        (dados.fluxo !== null &&
          (typeof dados.fluxo !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(dados.fluxo))) ||
        !('expira' in dados) ||
        typeof dados.expira !== 'number' ||
        !Number.isSafeInteger(dados.expira) ||
        dados.expira <= Date.now()
      )
        throw new Error('Conexão indisponível.');
      return { sessaoId: dados.sessaoId, fluxo: dados.fluxo };
    },
    limpar() {
      return `${nome}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
    },
  };
}
