import { createLocalJWKSet, createRemoteJWKSet, customFetch, type FetchImplementation } from 'jose';

import {
  validarIdTokenGoogle,
  type ConfiguracaoValidacaoIdTokenGoogle,
} from './google-id-token.ts';

// Google OIDC discovery: https://accounts.google.com/.well-known/openid-configuration
const enderecoJwksGoogle = 'https://www.googleapis.com/oauth2/v3/certs';
const limiteRespostaBytes = 65_536;

/** O fetch injetado é dependência confiável do servidor, nunca entrada do cliente. */
export function criarInfraGoogleJwks(buscar: FetchImplementation = fetch) {
  let cache:
    | { bytes: Uint8Array<ArrayBuffer>; expira: number; expiraMonotonico: number }
    | undefined;
  const buscarLimitado: FetchImplementation = async (url, opcoes) => {
    if (cache && Date.now() < cache.expira && performance.now() < cache.expiraMonotonico) {
      return new Response(cache.bytes, { status: 200 });
    }
    cache = undefined;
    const inicio = Date.now();
    const inicioMonotonico = performance.now();
    const resposta = await buscar(url, opcoes);
    const recusar = (): never => {
      if (resposta.body) void resposta.body.cancel().catch(() => undefined);
      throw new Error('JWKS indisponível.');
    };
    if (resposta.status !== 200 || resposta.body === null) {
      return recusar();
    }
    const controle = resposta.headers.get('cache-control');
    const diretivas = controle?.split(',').map((valor) => valor.trim().toLowerCase()) ?? [];
    if (
      diretivas.some(
        (valor) =>
          !/^[a-z0-9!#$%&'*+.^_`|~-]+(?:\s*=\s*(?:[a-z0-9!#$%&'*+.^_`|~-]+|"[a-z0-9 !#$%&'*+.^_`|~:-]*"))?$/.test(
            valor,
          ),
      )
    ) {
      return recusar();
    }
    const prazos = diretivas.filter((valor) => valor.startsWith('max-age'));
    const prazo = prazos.length === 1 ? /^max-age\s*=\s*(\d+)$/.exec(prazos[0] ?? '') : null;
    const idade = resposta.headers.get('age');
    if (!prazo || (idade !== null && !/^\d+$/.test(idade))) return recusar();
    const segundos = Number(prazo[1]);
    const idadeSegundos = Number(idade ?? '0');
    if (!Number.isSafeInteger(segundos) || !Number.isSafeInteger(idadeSegundos)) {
      return recusar();
    }
    const data = resposta.headers.get('date');
    const dataMs = data === null ? inicio : Date.parse(data);
    if (!Number.isFinite(dataMs)) return recusar();
    const tempoRestante = Math.max(0, segundos - idadeSegundos) * 1_000;
    const expira = Math.min(inicio + tempoRestante, dataMs + segundos * 1_000, inicio + 600_000);
    const expiraMonotonico = inicioMonotonico + expira - inicio;
    if (opcoes?.signal?.aborted || expira <= Date.now() || expiraMonotonico <= performance.now())
      return recusar();
    const leitor = resposta.body.getReader();
    const cancelar = () => {
      void leitor.cancel().catch(() => undefined);
    };
    opcoes?.signal?.addEventListener('abort', cancelar, { once: true });
    const partes: Uint8Array[] = [];
    let tamanho = 0;
    try {
      while (true) {
        const { done, value } = await leitor.read();
        if (done) break;
        tamanho += value.byteLength;
        if (tamanho > limiteRespostaBytes) throw new Error('JWKS excede limite.');
        partes.push(value);
      }
    } catch (erro) {
      await leitor.cancel().catch(() => undefined);
      throw erro;
    } finally {
      opcoes?.signal?.removeEventListener('abort', cancelar);
      leitor.releaseLock();
    }
    const bytes = new Uint8Array(tamanho);
    let posicao = 0;
    for (const parte of partes) {
      bytes.set(parte, posicao);
      posicao += parte.byteLength;
    }
    if (opcoes?.signal?.aborted || expira <= Date.now() || expiraMonotonico <= performance.now())
      throw new Error('JWKS indisponível.');
    createLocalJWKSet(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    if (
      !diretivas.some((valor) => /^(?:no-store|no-cache)(?:\s*=|$)/.test(valor)) &&
      expira > Date.now()
    ) {
      cache = { bytes, expira, expiraMonotonico };
    }
    return new Response(bytes, { status: 200 });
  };
  const chaveDeVerificacao = createRemoteJWKSet(new URL(enderecoJwksGoogle), {
    timeoutDuration: 5_000,
    cooldownDuration: 30_000,
    // A reutilização é controlada pelo cabeçalho da resposta, nunca pelo prazo fixo de jose.
    cacheMaxAge: 0,
    [customFetch]: async (url, opcoes) => {
      const sinal = opcoes?.signal;
      if (!sinal) throw new Error('JWKS indisponível.');
      if (sinal.aborted) throw new Error('JWKS indisponível.');
      let abortar: (() => void) | undefined;
      const expiracao = new Promise<never>((_, rejeitar) => {
        abortar = () => rejeitar(new Error('JWKS indisponível.'));
        sinal.addEventListener('abort', abortar, { once: true });
      });
      try {
        return await Promise.race([buscarLimitado(url, opcoes), expiracao]);
      } finally {
        if (abortar) sinal.removeEventListener('abort', abortar);
      }
    },
  });
  const validar = (
    token: string,
    configuracao: Omit<ConfiguracaoValidacaoIdTokenGoogle, 'chaveDeVerificacao'>,
  ) => validarIdTokenGoogle(token, { ...configuracao, chaveDeVerificacao });
  return { validar, chaveDeVerificacao };
}

export function criarValidadorGoogleComJwks(buscar: FetchImplementation = fetch) {
  return criarInfraGoogleJwks(buscar).validar;
}
