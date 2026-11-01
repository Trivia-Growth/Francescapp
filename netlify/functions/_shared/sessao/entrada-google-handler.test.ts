import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { criarCodecDeCookiesDesafioIsolado } from '../../../../supabase/functions/_shared/sessao/nucleo.ts';
import { criarLeitorEntradaGoogle } from './entrada-google-http.ts';
import { criarTransporteHttpSessaoComProva } from './http-prova.ts';
import { criarHandlerEntradaGoogle } from './entrada-google-handler.ts';
import { ErroEntradaGoogleNegada } from '../../../../supabase/functions/_shared/identidade/entrada-google-admissao.ts';
import { ErroIdTokenGoogleInvalido } from '../../../../supabase/functions/_shared/identidade/google-id-token.ts';
import {
  criarDesafiosGoogle,
  ErroDesafioGoogleInvalido,
} from '../../../../supabase/functions/_shared/identidade/desafio-google.ts';

const origem = 'https://app.example.test';
const chave = Buffer.alloc(32, 7).toString('base64url');
const csrf = 'c'.repeat(43);
const usuario = '11111111-1111-4111-8111-111111111111';
const sessao = '22222222-2222-4222-8222-222222222222';
const desafioId = '33333333-3333-4333-8333-333333333333';
const fonte = {
  FFCM_SUPABASE_URL: 'https://projeto.example.test',
  FFCM_SUPABASE_ANON_KEY: 'publica',
  FFCM_COOKIE_SEALING_KEY: chave,
  FFCM_ALLOWED_ORIGINS: origem,
};
const jwtChave = new Uint8Array(32).fill(9);
const configJwt = {
  issuer: 'https://projeto.example.test/auth/v1',
  audience: 'authenticated',
  algoritmosPermitidos: ['HS256' as const],
  chaveDeVerificacao: jwtChave,
};
describe('composição HTTP Google experimental', () => {
  it.each(['timeout', 'não booleano'] as const)(
    'responde 503 sem cookies quando consumo do desafio retorna %s',
    async (falha) => {
      const controle = new AbortController();
      let iniciouConsumo = false;
      const desafios = criarDesafiosGoogle({
        chave: new Uint8Array(32).fill(7),
        ttlSegundos: 300,
        repositorio: {
          async registrar() {},
          async consumir() {
            iniciouConsumo = true;
            if (falha === 'timeout') return new Promise<boolean>(() => {});
            return 'resposta inesperada' as unknown as boolean;
          },
        },
      });
      const criado = await desafios.emitir();
      const timeout =
        falha === 'timeout'
          ? vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controle.signal)
          : undefined;
      const consultar = vi.fn();
      try {
        const handler = criarHandlerEntradaGoogle({
          ler: async () => ({
            desafioId: criado.publico.desafio_id,
            idToken: 'ficticio',
            nonceSelado: criado.nonceSelado,
          }),
          transporte: criarTransporteHttpSessaoComProva(fonte, { configuracaoJwt: configJwt }),
          entrar: async (dados) => {
            await desafios.consumir(dados.desafioId, dados.nonceSelado);
            return { accessToken: 'ficticio', prova: 'A'.repeat(43), geracao: 1 };
          },
          consultar,
        });
        const respostaPendente = handler(
          new Request(`${origem}/api/sessao/google`, { method: 'POST' }),
        );
        if (falha === 'timeout') {
          await vi.waitFor(() => expect(iniciouConsumo).toBe(true));
          controle.abort();
        }
        const resposta = await respostaPendente;
        expect(resposta.status).toBe(503);
        expect(resposta.headers.getSetCookie()).toEqual([]);
        expect(consultar).not.toHaveBeenCalled();
        expect(await resposta.text()).not.toContain('resposta inesperada');
      } finally {
        timeout?.mockRestore();
      }
    },
  );
  it('não consulta após expiração durante entrada e não devolve cookies', async () => {
    vi.useFakeTimers();
    try {
      let resolver!: (valor: { accessToken: string; prova: string; geracao: number }) => void;
      const consultar = vi.fn();
      const handler = criarHandlerEntradaGoogle({
        ler: async () => ({ desafioId, idToken: 'ficticio', nonceSelado: 'selado' }),
        transporte: criarTransporteHttpSessaoComProva(fonte, { configuracaoJwt: configJwt }),
        entrar: () =>
          new Promise((resolve) => {
            resolver = resolve;
          }),
        consultar,
      });
      const resposta = handler(new Request(`${origem}/api/sessao/google`, { method: 'POST' }));
      await vi.advanceTimersByTimeAsync(15_000);
      const falha = await resposta;
      resolver({ accessToken: 'token-ficticio', prova: 'A'.repeat(43), geracao: 1 });
      await Promise.resolve();
      expect(falha.status).toBe(503);
      expect(falha.headers.getSetCookie()).toEqual([]);
      expect(consultar).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it('emite cookies de sessão só após entrada e consulta; nega CSRF e ausência de nonce', async () => {
    const token = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(configJwt.issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(jwtChave);
    const codec = criarCodecDeCookiesDesafioIsolado(
      { chaveDeSelagem: chave, transporte: 'https' },
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    const cookie = (await codec.selarCsrfDesafio(csrf)).split(';')[0];
    let entradas = 0;
    let consultas = 0;
    let falharConsulta = false;
    let negar: 'concessao' | 'credencial' | 'desafio' | null = null;
    const handler = criarHandlerEntradaGoogle({
      ler: criarLeitorEntradaGoogle(fonte),
      transporte: criarTransporteHttpSessaoComProva(fonte, { configuracaoJwt: configJwt }),
      entrar: async (dados) => {
        entradas++;
        if (negar === 'concessao') throw new ErroEntradaGoogleNegada();
        if (negar === 'credencial') throw new ErroIdTokenGoogleInvalido();
        if (negar === 'desafio') throw new ErroDesafioGoogleInvalido();
        expect(dados.desafioId).toBe(desafioId);
        expect(dados.idToken).toBe('token-google-ficticio');
        expect(dados.nonceSelado).toBe('nonce.selado');
        expect(JSON.stringify(dados)).not.toContain('token-google-ficticio');
        return { accessToken: token, prova: 'A'.repeat(43), geracao: 1 };
      },
      consultar: async () => {
        consultas++;
        if (falharConsulta) throw new Error('segredo-ficticio');
        return {
          usuario: { id: usuario, perfil: 'administrador', ativo: true, versao: 1 },
          capacidades: [],
        };
      },
    });
    const request = (cookieEntrada: string, csrfEntrada: string) =>
      new Request(`${origem}/api/sessao/google`, {
        method: 'POST',
        headers: {
          origin: origem,
          cookie: cookieEntrada,
          'x-csrf': csrfEntrada,
          'x-desafio': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ desafio_id: desafioId, credencial: 'token-google-ficticio' }),
      });
    for (const req of [
      request(
        `${cookie}; ffcm_nonce_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa=nonce.selado`,
        'incorreto',
      ),
      request(`${cookie}`, csrf),
    ]) {
      const resposta = await handler(req);
      expect(resposta.status).toBe(403);
      expect(resposta.headers.getSetCookie()).toEqual([]);
    }
    expect(entradas).toBe(0);
    const resposta = await handler(
      request(
        `${cookie}; ffcm_nonce_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa=nonce.selado; ffcm_sessao=preexistente`,
        csrf,
      ),
    );
    expect(resposta.status).toBe(200);
    expect(entradas).toBe(1);
    expect(consultas).toBe(1);
    expect(await resposta.text()).not.toContain('token-google-ficticio');
    const cookies = resposta.headers.getSetCookie();
    expect(cookies).toHaveLength(4);
    expect(cookies.filter((c) => c.includes('Max-Age=0'))).toEqual([
      'ffcm_csrf_desafio_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa=; Path=/api/sessao; HttpOnly; SameSite=Lax; Secure; Max-Age=0',
      'ffcm_nonce_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa=; Path=/api/sessao; HttpOnly; SameSite=Lax; Secure; Max-Age=0',
    ]);
    expect(
      cookies.every(
        (c) => c.includes('HttpOnly') && c.includes('Secure') && c.includes('SameSite=Lax'),
      ),
    ).toBe(true);
    falharConsulta = true;
    const falha = await handler(
      request(`${cookie}; ffcm_nonce_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa=nonce.selado`, csrf),
    );
    expect(falha.status).toBe(503);
    expect(falha.headers.getSetCookie()).toEqual([
      expect.stringContaining('Max-Age=0'),
      expect.stringContaining('Max-Age=0'),
    ]);
    expect(await falha.text()).not.toContain('segredo-ficticio');
    negar = 'concessao';
    const negada = await handler(
      request(`${cookie}; ffcm_nonce_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa=nonce.selado`, csrf),
    );
    expect(negada.status).toBe(401);
    expect(negada.headers.getSetCookie()).toEqual([
      expect.stringContaining('Max-Age=0'),
      expect.stringContaining('Max-Age=0'),
    ]);
    const corpoNegado = await negada.json();
    expect(corpoNegado.erro.mensagem).toBe('Sessão inválida.');
    negar = 'credencial';
    const invalida = await handler(
      request(`${cookie}; ffcm_nonce_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa=nonce.selado`, csrf),
    );
    expect(invalida.status).toBe(401);
    expect(invalida.headers.getSetCookie()).toEqual([
      expect.stringContaining('Max-Age=0'),
      expect.stringContaining('Max-Age=0'),
    ]);
    expect((await invalida.json()).erro).toEqual(corpoNegado.erro);
    negar = 'desafio';
    const desafio = await handler(
      request(`${cookie}; ffcm_nonce_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa=nonce.selado`, csrf),
    );
    expect(desafio.status).toBe(401);
    expect(desafio.headers.getSetCookie()).toEqual([
      expect.stringContaining('Max-Age=0'),
      expect.stringContaining('Max-Age=0'),
    ]);
    expect((await desafio.json()).erro).toEqual(corpoNegado.erro);
  });
});
