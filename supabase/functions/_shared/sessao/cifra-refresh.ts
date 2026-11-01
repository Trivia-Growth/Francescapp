import {
  ErroCifraAutenticada,
  type CampoCifrado,
  type CifraAutenticada,
  type MetadadosAad,
} from '../cifra-autenticada.ts';

type IdentidadeSessao = Readonly<{ usuario: string; sessao: string }>;

function metadados(identidade: IdentidadeSessao): MetadadosAad {
  if (typeof identidade !== 'object' || identidade === null) {
    throw new ErroCifraAutenticada();
  }
  return {
    tabela: 'identidade.sessao',
    registro_id: identidade.sessao,
    usuario_id: identidade.usuario,
    campo: 'refresh_token',
    formato: 1,
  };
}

/** Cifra server-only; não autoriza o acesso nem persiste ou revoga a sessão. */
export function criarCifraRefresh(cifra: CifraAutenticada) {
  return {
    async cifrar(refresh: string, identidade: IdentidadeSessao): Promise<CampoCifrado> {
      if (typeof refresh !== 'string') {
        throw new ErroCifraAutenticada();
      }
      const bytes = new TextEncoder().encode(refresh);
      if (bytes.length > 24_576 || new TextDecoder().decode(bytes) !== refresh) {
        throw new ErroCifraAutenticada();
      }
      return cifra.cifrar(refresh, metadados(identidade));
    },
    async decifrar(envelope: CampoCifrado, identidade: IdentidadeSessao): Promise<string> {
      return cifra.decifrar(envelope, metadados(identidade));
    },
  };
}
