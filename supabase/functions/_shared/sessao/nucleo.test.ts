import { readFile } from 'node:fs/promises';

import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';

import {
  admitirSessaoNoServidor,
  criarCodecDeCookiesSessao,
  criarCodecDeCookiesSessaoIsolada,
  emitirProtecaoCsrf,
  emitirProtecaoCsrfDesafio,
  validarJwtDeSessao,
  verificarProtecaoDeComando,
  verificarProtecaoDeEntrada,
  type ConfiguracaoJwtSessao,
} from './nucleo.ts';

const chaveJwt = new TextEncoder().encode('k'.repeat(64));
const chaveCookie = 'A'.repeat(43);
const usuarioId = '31a7e0e6-8b2f-4c85-8baf-9422b39a4175';
const sessionId = '41a7e0e6-8b2f-4c85-8baf-9422b39a4175';

const configuracaoJwt: ConfiguracaoJwtSessao = {
  issuer: 'https://projeto-ficticio.supabase.co/auth/v1',
  audience: 'authenticated',
  algoritmosPermitidos: ['HS256'],
  chaveDeVerificacao: chaveJwt,
};

async function criarJwt(
  alteracoes: Readonly<{
    issuer?: string;
    audience?: string;
    session_id?: string;
    algoritmo?: 'HS256' | 'HS384';
  }> = {},
): Promise<string> {
  const payload = Object.hasOwn(alteracoes, 'session_id')
    ? alteracoes.session_id === undefined
      ? {}
      : { session_id: alteracoes.session_id }
    : { session_id: sessionId };
  return new SignJWT(payload)
    .setProtectedHeader({ alg: alteracoes.algoritmo ?? 'HS256' })
    .setSubject(usuarioId)
    .setIssuer(alteracoes.issuer ?? configuracaoJwt.issuer)
    .setAudience(alteracoes.audience ?? configuracaoJwt.audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(chaveJwt);
}

describe('núcleo de transporte da sessão', () => {
  it('isola cookies por sessão e impede copiar valores selados entre seletores', async () => {
    const configuracao = { chaveDeSelagem: chaveCookie, transporte: 'https' as const };
    const seletorA = '10000000-0000-4000-8000-000000000001';
    const seletorB = '10000000-0000-4000-8000-000000000002';
    const a = criarCodecDeCookiesSessaoIsolada(configuracao, seletorA);
    const b = criarCodecDeCookiesSessaoIsolada(configuracao, seletorB);
    const refreshA = await a.selarSessao('refresh-a');
    const refreshB = await b.selarSessao('refresh-b');
    const csrfA = await a.selarCsrf('csrf-a');
    const csrfB = await b.selarCsrf('csrf-b');
    const nome = (cookie: string) => cookie.split('=')[0];
    expect(nome(a.limparSessao())).toBe(nome(refreshA));
    expect(nome(a.limparSessao())).not.toBe(nome(refreshB));
    expect(nome(a.limparCsrf())).toBe(nome(csrfA));
    expect(nome(a.limparCsrf())).not.toBe(nome(csrfB));
    await expect(b.abrirSessao(refreshA.replace(seletorA, seletorB))).resolves.toBeNull();
    await expect(b.abrirCsrf(csrfA.replace(seletorA, seletorB))).resolves.toBeNull();
    await expect(b.abrirSessao(refreshB)).resolves.toBe('refresh-b');
    await expect(b.abrirCsrf(csrfB)).resolves.toBe('csrf-b');
  });

  it.each(['', 'ffcm_sessao', '../outro', '10000000-0000-1000-8000-000000000001'])(
    'recusa seletor de sessão inválido: %s',
    (seletor) => {
      expect(() =>
        criarCodecDeCookiesSessaoIsolada(
          { chaveDeSelagem: chaveCookie, transporte: 'https' },
          seletor,
        ),
      ).toThrow();
    },
  );
  it('emite proteção de desafio distinta e selada', async () => {
    const codec = criarCodecDeCookiesSessao({ chaveDeSelagem: chaveCookie, transporte: 'https' });
    const protecao = await emitirProtecaoCsrfDesafio(codec);
    expect(protecao.setCookie).toContain('ffcm_csrf_desafio=');
    expect(protecao.setCookie).toContain('HttpOnly');
    expect(protecao.setCookie).not.toContain(protecao.csrf);
    await expect(codec.abrirCsrfDesafio(protecao.setCookie)).resolves.toBe(protecao.csrf);
    await expect(codec.abrirCsrf(protecao.setCookie)).resolves.toBeNull();
    const cookieDeSessao = await codec.selarCsrf('s'.repeat(43));
    await expect(
      codec.abrirCsrf(protecao.setCookie.replace('ffcm_csrf_desafio=', 'ffcm_csrf=')),
    ).resolves.toBeNull();
    await expect(
      codec.abrirCsrfDesafio(cookieDeSessao.replace('ffcm_csrf=', 'ffcm_csrf_desafio=')),
    ).resolves.toBeNull();
  });
  it('valida CSRF de entrada somente com cookie de desafio e origem permitida', async () => {
    const codec = criarCodecDeCookiesSessao({ chaveDeSelagem: chaveCookie, transporte: 'https' });
    const csrf = 'x'.repeat(43);
    const entrada = {
      origem: 'https://app.exemplo.test',
      csrfCabecalho: csrf,
      cookieCsrf: await codec.selarCsrfDesafio(csrf),
      origensPermitidas: ['https://app.exemplo.test'],
      codec,
    };
    await expect(verificarProtecaoDeEntrada(entrada)).resolves.toBe(true);
    await expect(
      verificarProtecaoDeEntrada({ ...entrada, cookieCsrf: await codec.selarCsrf(csrf) }),
    ).resolves.toBe(false);
    await expect(
      verificarProtecaoDeEntrada({ ...entrada, origem: 'https://maliciosa.exemplo.test' }),
    ).resolves.toBe(false);
  });
  it('sela o refresh e aplica atributos estritos aos cookies de sessão', async () => {
    const codec = criarCodecDeCookiesSessao({ chaveDeSelagem: chaveCookie, transporte: 'https' });
    const refresh = 'refresh-ficticio-que-nao-aparece-em-claro';
    const cookie = await codec.selarSessao(refresh);

    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/sessao');
    expect(cookie).not.toContain('Domain=');
    expect(cookie).not.toContain(refresh);
    expect(await codec.abrirSessao(cookie)).toBe(refresh);
    const csrf = await codec.selarCsrf('c'.repeat(43));
    expect(csrf).toContain('ffcm_csrf=');
    expect(csrf).toContain('HttpOnly');
    expect(csrf).toContain('Path=/api/sessao');
    expect(csrf).not.toContain('Domain=');
    expect(codec.limparSessao()).toContain('Max-Age=0');
    expect(codec.limparSessao()).toContain('Path=/api/sessao');
  });

  it('aceita HTTP apenas quando a configuração explícita é local', async () => {
    const codec = criarCodecDeCookiesSessao({
      chaveDeSelagem: chaveCookie,
      transporte: 'http-local',
    });

    expect(await codec.selarSessao('refresh-ficticio')).not.toContain('Secure');
  });

  it('recusa transporte de cookie desconhecido em vez de remover Secure silenciosamente', () => {
    expect(() =>
      criarCodecDeCookiesSessao({
        chaveDeSelagem: chaveCookie,
        transporte: 'http-publico' as unknown as 'https',
      }),
    ).toThrow('Transporte de cookie inválido.');
  });

  it('nega origem fora da allowlist e CSRF inválido', async () => {
    const codec = criarCodecDeCookiesSessao({ chaveDeSelagem: chaveCookie, transporte: 'https' });
    const emissao = await emitirProtecaoCsrf(codec);

    await expect(
      verificarProtecaoDeComando({
        origem: 'https://maliciosa.exemplo.test',
        csrfCabecalho: emissao.csrf,
        cookieCsrf: emissao.setCookie,
        origensPermitidas: ['https://app.exemplo.test'],
        codec,
      }),
    ).resolves.toBe(false);
    await expect(
      verificarProtecaoDeComando({
        origem: 'https://app.exemplo.test',
        csrfCabecalho: `${emissao.csrf}alterado`,
        cookieCsrf: emissao.setCookie,
        origensPermitidas: ['https://app.exemplo.test'],
        codec,
      }),
    ).resolves.toBe(false);
    await expect(
      verificarProtecaoDeComando({
        origem: 'https://app.exemplo.test',
        csrfCabecalho: emissao.csrf,
        cookieCsrf: emissao.setCookie,
        origensPermitidas: ['https://app.exemplo.test'],
        codec,
      }),
    ).resolves.toBe(true);
  });

  it('valida criptograficamente JWT com issuer, audience e algoritmo explícitos', async () => {
    const jwt = await criarJwt();

    await expect(validarJwtDeSessao(jwt, configuracaoJwt)).resolves.toEqual({
      usuarioId,
      sessionId,
    });
    await expect(
      validarJwtDeSessao(
        await criarJwt({ issuer: 'https://outro-projeto.exemplo.test' }),
        configuracaoJwt,
      ),
    ).rejects.toThrow('JWT de sessão inválido.');
    await expect(
      validarJwtDeSessao(await criarJwt({ audience: 'outra-audience' }), configuracaoJwt),
    ).rejects.toThrow('JWT de sessão inválido.');
    await expect(
      validarJwtDeSessao(await criarJwt({ algoritmo: 'HS384' }), configuracaoJwt),
    ).rejects.toThrow('JWT de sessão inválido.');
  });

  it('nega JWT sem session_id UUID', async () => {
    await expect(
      validarJwtDeSessao(await criarJwt({ session_id: undefined }), configuracaoJwt),
    ).rejects.toThrow('JWT de sessão inválido.');
  });

  it('admite somente a identidade extraída de JWT já verificado, sem perfil declaratório', async () => {
    const recebido: unknown[] = [];
    const resultado = await admitirSessaoNoServidor(
      { jwt: await criarJwt(), metodo: 'google_workspace' },
      {
        configuracaoJwt,
        adaptador: {
          admitir: async (identidade) => {
            recebido.push(identidade);
            return { admitida: true };
          },
        },
      },
    );

    expect(resultado).toEqual({ admitida: true });
    expect(recebido).toEqual([
      { usuario_id: usuarioId, session_id: sessionId, metodo: 'google_workspace' },
    ]);
    expect(JSON.stringify(recebido)).not.toContain('perfil');
  });

  it('recusa método de admissão fora da allowlist antes de chamar o adapter', async () => {
    const admitir = vi.fn();

    await expect(
      admitirSessaoNoServidor(
        { jwt: await criarJwt(), metodo: 'forjado' as unknown as 'google_workspace' },
        { configuracaoJwt, adaptador: { admitir } },
      ),
    ).rejects.toThrow('Método de admissão inválido.');
    expect(admitir).not.toHaveBeenCalled();
  });

  it('não oferece armazenamento, URL nem log para token no módulo de sessão', async () => {
    const codigo = await readFile(new URL('./nucleo.ts', import.meta.url), 'utf8');

    expect(codigo).not.toMatch(/localStorage|sessionStorage|location\.|URLSearchParams/i);
    expect(codigo).not.toMatch(/console\.|\.log\(/i);
  });
});
