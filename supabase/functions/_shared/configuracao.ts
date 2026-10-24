/**
 * Configuração server-only por fluxo. Este módulo não lê `process.env`: cada
 * runtime entrega sua fonte, mantendo a mesma implementação utilizável em
 * Edge Functions (Deno) e em funções Netlify (Node).
 */

export const fluxosDeConfiguracao = ['cadastro', 'sessao', 'entrada_google', 'openrouter'] as const;

export type FluxoDeConfiguracao = (typeof fluxosDeConfiguracao)[number];

export type FonteDeConfiguracao = Readonly<Record<string, string | undefined>>;

export type ConfiguracaoCadastro = Readonly<{
  supabaseUrl: URL;
  chaveAnonSupabase: string;
}>;

export type ConfiguracaoSessao = ConfiguracaoCadastro &
  Readonly<{
    chaveSelagemCookie: string;
    origensPermitidas: readonly string[];
  }>;

export type ConfiguracaoEntradaGoogle = ConfiguracaoSessao &
  Readonly<{
    googleClientId: string;
    dominioWorkspace: string;
  }>;

export type ConfiguracaoOpenRouter = Readonly<{
  chaveOpenRouter: string;
}>;

export type ConfiguracaoDoFluxo =
  | ConfiguracaoCadastro
  | ConfiguracaoSessao
  | ConfiguracaoEntradaGoogle
  | ConfiguracaoOpenRouter;

/** Nunca carrega nomes de variáveis ou valores para respostas públicas. */
export class ErroConfiguracaoIndisponivel extends Error {
  readonly codigo = 'configuracao_indisponivel' as const;

  constructor() {
    super('Configuração necessária indisponível.');
    this.name = 'ErroConfiguracaoIndisponivel';
  }
}

const requisitosPorFluxo: Readonly<Record<FluxoDeConfiguracao, readonly string[]>> = {
  cadastro: ['FFCM_SUPABASE_URL', 'FFCM_SUPABASE_ANON_KEY'],
  sessao: [
    'FFCM_SUPABASE_URL',
    'FFCM_SUPABASE_ANON_KEY',
    'FFCM_COOKIE_SEALING_KEY',
    'FFCM_ALLOWED_ORIGINS',
  ],
  entrada_google: [
    'FFCM_SUPABASE_URL',
    'FFCM_SUPABASE_ANON_KEY',
    'FFCM_COOKIE_SEALING_KEY',
    'FFCM_ALLOWED_ORIGINS',
    'FFCM_GOOGLE_OAUTH_CLIENT_ID',
    'FFCM_GOOGLE_WORKSPACE_DOMAIN',
  ],
  openrouter: ['OPENROUTER_API_KEY'],
};

function valorObrigatorio(nome: string, fonte: FonteDeConfiguracao): string {
  const valor = fonte[nome]?.trim();
  if (valor === undefined || valor.length === 0) {
    throw new ErroConfiguracaoIndisponivel();
  }

  return valor;
}

function urlHttpsOuLocal(valor: string): URL {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new ErroConfiguracaoIndisponivel();
  }

  const localhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const protocoloPermitido = url.protocol === 'https:' || (localhost && url.protocol === 'http:');
  if (
    !protocoloPermitido ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.pathname !== '/' ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new ErroConfiguracaoIndisponivel();
  }

  return url;
}

function origensPermitidas(valor: string): readonly string[] {
  const origens = valor
    .split(',')
    .map((origem) => origem.trim())
    .filter((origem) => origem.length > 0)
    .map((origem) => {
      const url = urlHttpsOuLocal(origem);
      if (url.origin !== origem) {
        throw new ErroConfiguracaoIndisponivel();
      }
      return url.origin;
    });

  if (origens.length === 0 || new Set(origens).size !== origens.length) {
    throw new ErroConfiguracaoIndisponivel();
  }

  return Object.freeze(origens);
}

function chaveDeSelagem(valor: string): string {
  if (!/^[A-Za-z0-9_-]{43,512}$/.test(valor) || valor.length % 4 === 1) {
    throw new ErroConfiguracaoIndisponivel();
  }

  let bytes: Uint8Array;
  try {
    const base64 = valor
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(valor.length / 4) * 4, '=');
    bytes = Uint8Array.from(atob(base64), (caractere) => caractere.charCodeAt(0));
  } catch {
    throw new ErroConfiguracaoIndisponivel();
  }

  const canonical = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  if (bytes.length < 32 || canonical !== valor) {
    throw new ErroConfiguracaoIndisponivel();
  }

  return valor;
}

function valorSemEspacos(valor: string): string {
  if (/\s/.test(valor)) {
    throw new ErroConfiguracaoIndisponivel();
  }

  return valor;
}

function dominioWorkspace(valor: string): string {
  const normalizado = valor.toLowerCase();
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(normalizado)) {
    throw new ErroConfiguracaoIndisponivel();
  }

  return normalizado;
}

function conferirRequisitos(fluxo: FluxoDeConfiguracao, fonte: FonteDeConfiguracao): void {
  for (const nome of requisitosPorFluxo[fluxo]) {
    valorObrigatorio(nome, fonte);
  }
}

function carregarCadastro(fonte: FonteDeConfiguracao): ConfiguracaoCadastro {
  return Object.freeze({
    supabaseUrl: urlHttpsOuLocal(valorObrigatorio('FFCM_SUPABASE_URL', fonte)),
    chaveAnonSupabase: valorSemEspacos(valorObrigatorio('FFCM_SUPABASE_ANON_KEY', fonte)),
  });
}

function carregarSessao(fonte: FonteDeConfiguracao): ConfiguracaoSessao {
  return Object.freeze({
    ...carregarCadastro(fonte),
    chaveSelagemCookie: chaveDeSelagem(valorObrigatorio('FFCM_COOKIE_SEALING_KEY', fonte)),
    origensPermitidas: origensPermitidas(valorObrigatorio('FFCM_ALLOWED_ORIGINS', fonte)),
  });
}

export function carregarConfiguracao(
  fluxo: 'cadastro',
  fonte: FonteDeConfiguracao,
): ConfiguracaoCadastro;
export function carregarConfiguracao(
  fluxo: 'sessao',
  fonte: FonteDeConfiguracao,
): ConfiguracaoSessao;
export function carregarConfiguracao(
  fluxo: 'entrada_google',
  fonte: FonteDeConfiguracao,
): ConfiguracaoEntradaGoogle;
export function carregarConfiguracao(
  fluxo: 'openrouter',
  fonte: FonteDeConfiguracao,
): ConfiguracaoOpenRouter;
export function carregarConfiguracao(
  fluxo: FluxoDeConfiguracao,
  fonte: FonteDeConfiguracao,
): ConfiguracaoDoFluxo;
export function carregarConfiguracao(
  fluxo: FluxoDeConfiguracao,
  fonte: FonteDeConfiguracao,
): ConfiguracaoDoFluxo {
  conferirRequisitos(fluxo, fonte);

  switch (fluxo) {
    case 'cadastro':
      return carregarCadastro(fonte);
    case 'sessao':
      return carregarSessao(fonte);
    case 'entrada_google':
      return Object.freeze({
        ...carregarSessao(fonte),
        googleClientId: valorSemEspacos(valorObrigatorio('FFCM_GOOGLE_OAUTH_CLIENT_ID', fonte)),
        dominioWorkspace: dominioWorkspace(valorObrigatorio('FFCM_GOOGLE_WORKSPACE_DOMAIN', fonte)),
      });
    case 'openrouter':
      return Object.freeze({
        chaveOpenRouter: valorSemEspacos(valorObrigatorio('OPENROUTER_API_KEY', fonte)),
      });
  }
}
