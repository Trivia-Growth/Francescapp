import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import {
  criarCodecDeCookiesDesafioIsolado,
  criarCodecDeCookiesSessaoIsolada,
} from '../../../../supabase/functions/_shared/sessao/nucleo.ts';
import { criarLeitorEntradaTecnica } from './entrada-tecnica-http.ts';
import { criarTransporteHttpSessaoComProva } from './http-prova.ts';
import { criarHandlerEntradaTecnica } from './entrada-tecnica-handler.ts';
import { criarEntradaTecnicaComProva } from '../../../../supabase/functions/_shared/identidade/entrada-tecnica-prova.ts';
import { criarCifraAutenticada } from '../../../../supabase/functions/_shared/cifra-autenticada.ts';
import { criarCifraRefresh } from '../../../../supabase/functions/_shared/sessao/cifra-refresh.ts';

const origem = 'https://app.example.test';
const usuario = '11111111-1111-4111-8111-111111111111';
const sessao = '22222222-2222-4222-8222-222222222222';
const chave = Buffer.alloc(32, 7).toString('base64url');
const jwtChave = new Uint8Array(32).fill(9);
const fonte = {
  FFCM_SUPABASE_URL: 'https://projeto.example.test',
  FFCM_SUPABASE_ANON_KEY: 'publica',
  FFCM_COOKIE_SEALING_KEY: chave,
  FFCM_ALLOWED_ORIGINS: origem,
};
const configJwt = {
  issuer: 'https://projeto.example.test/auth/v1',
  audience: 'authenticated',
  algoritmosPermitidos: ['HS256' as const],
  chaveDeVerificacao: jwtChave,
};

describe('handler isolado de entrada técnica', () => {
  it('não inicia admissão quando a cifra termina após o prazo HTTP', async () => {
    const issuer = 'https://projetoficticio.supabase.co/auth/v1';
    const fonteTeste = { ...fonte, FFCM_SUPABASE_URL: 'https://projetoficticio.supabase.co' };
    const jwtConfig = { ...configJwt, issuer };
    const token = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(jwtChave);
    const real = criarCifraRefresh(
      criarCifraAutenticada({
        keyIdAtiva: 'v1',
        chavesDeCifra: { v1: new Uint8Array(32).fill(17) },
        chaveHmac: new Uint8Array(32).fill(29),
      }),
    );
    const envelope = await real.cifrar('refresh-ficticio', { usuario, sessao });
    let liberar!: () => void;
    let iniciou!: () => void;
    const bloqueio = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const iniciado = new Promise<void>((resolve) => {
      iniciou = resolve;
    });
    let admissoes = 0;
    let terminou!: () => void;
    const conclusao = new Promise<void>((resolve) => {
      terminou = resolve;
    });
    const entrar = criarEntradaTecnicaComProva({
      cifra: {
        ...real,
        cifrar: async () => {
          iniciou();
          await bloqueio;
          return envelope;
        },
      },
      auth: {
        projeto: 'projetoficticio',
        chavePublica: 'publica',
        configuracaoJwt: jwtConfig,
        buscar: async () =>
          Response.json({
            access_token: token,
            refresh_token: 'refresh-ficticio',
            token_type: 'bearer',
            user: { id: usuario },
          }),
      },
      admitir: async () => {
        admissoes++;
        throw new Error();
      },
    });
    const codec = criarCodecDeCookiesDesafioIsolado(
      { chaveDeSelagem: chave, transporte: 'https' },
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    const csrf = 'c'.repeat(43);
    const cookie = (await codec.selarCsrfDesafio(csrf)).split(';')[0] ?? '';
    const handler = criarHandlerEntradaTecnica({
      ler: criarLeitorEntradaTecnica(fonteTeste),
      transporte: criarTransporteHttpSessaoComProva(fonteTeste, { configuracaoJwt: jwtConfig }),
      entrar: async (entrada) => {
        try {
          return await entrar(entrada);
        } finally {
          terminou();
        }
      },
      consultar: async () => ({}),
    });
    vi.useFakeTimers();
    try {
      const pendente = handler(
        new Request(`${origem}/api/sessao/tecnica`, {
          method: 'POST',
          headers: {
            origin: origem,
            cookie,
            'x-csrf': csrf,
            'x-desafio': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ email: 'teste@example.test', senha: 'senha-ficticia' }),
        }),
      );
      await iniciado;
      await vi.advanceTimersByTimeAsync(15_001);
      const resposta = await pendente;
      expect(resposta.status).toBe(503);
      expect(resposta.headers.getSetCookie()).toEqual([expect.stringContaining('Max-Age=0')]);
      liberar();
      await conclusao;
      expect(admissoes).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it.each(['entrada', 'consulta'])(
    'encerra sem cookies se %s ultrapassar o prazo',
    async (etapa) => {
      const codec = criarCodecDeCookiesDesafioIsolado(
        { chaveDeSelagem: chave, transporte: 'https' },
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      );
      const csrf = 'c'.repeat(43);
      const cookie = (await codec.selarCsrfDesafio(csrf)).split(';')[0] ?? '';
      let liberar!: () => void;
      let iniciou!: () => void;
      const iniciado = new Promise<void>((resolve) => {
        iniciou = resolve;
      });
      const pendente = new Promise<void>((resolve) => {
        liberar = resolve;
      });
      let consultas = 0;
      const handler = criarHandlerEntradaTecnica({
        ler: criarLeitorEntradaTecnica(fonte),
        transporte: criarTransporteHttpSessaoComProva(fonte, { configuracaoJwt: configJwt }),
        entrar: async () => {
          if (etapa === 'entrada') {
            iniciou();
            await pendente;
          }
          return { accessToken: 'token-ficticio', prova: 'A'.repeat(43), geracao: 1 };
        },
        consultar: async () => {
          consultas++;
          if (etapa === 'consulta') {
            iniciou();
            await pendente;
          }
          return {
            usuario: { id: usuario, perfil: 'administrador', ativo: true, versao: 1 },
            capacidades: [],
          };
        },
      });
      vi.useFakeTimers();
      try {
        const resultado = handler(
          new Request(`${origem}/api/sessao/tecnica`, {
            method: 'POST',
            headers: {
              origin: origem,
              cookie,
              'x-csrf': csrf,
              'x-desafio': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              'content-type': 'application/json',
            },
            body: JSON.stringify({ email: 'teste@example.test', senha: 'senha-ficticia' }),
          }),
        );
        await iniciado;
        await vi.advanceTimersByTimeAsync(15_001);
        const resposta = await resultado;
        expect(resposta.status).toBe(503);
        expect(resposta.headers.getSetCookie()).toEqual([expect.stringContaining('Max-Age=0')]);
        expect(await resposta.text()).not.toContain('senha-ficticia');
        liberar();
        await vi.advanceTimersByTimeAsync(0);
        if (etapa === 'entrada') expect(consultas).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    },
  );
  it('compõe leitor, Auth, cifra e admissão antes da consulta e resposta HTTP', async () => {
    const issuer = 'https://projetoficticio.supabase.co/auth/v1';
    const fonteTeste = { ...fonte, FFCM_SUPABASE_URL: 'https://projetoficticio.supabase.co' };
    const jwtConfig = { ...configJwt, issuer };
    const token = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(jwtChave);
    const cifra = criarCifraRefresh(
      criarCifraAutenticada({
        keyIdAtiva: 'v1',
        chavesDeCifra: { v1: new Uint8Array(32).fill(17) },
        chaveHmac: new Uint8Array(32).fill(29),
      }),
    );
    let admitiu = false;
    const entrar = criarEntradaTecnicaComProva({
      cifra,
      auth: {
        projeto: 'projetoficticio',
        chavePublica: 'publica',
        configuracaoJwt: jwtConfig,
        buscar: async () =>
          Response.json({
            access_token: token,
            refresh_token: 'refresh-ficticio',
            token_type: 'bearer',
            user: { id: usuario },
          }),
      },
      admitir: async ({ pedido, provaHash: hash }) => {
        expect(JSON.stringify(pedido)).not.toContain('refresh-ficticio');
        expect(hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
        admitiu = true;
        return {
          ok: true,
          request_id: pedido.request_id,
          dados: {
            usuario_id: usuario,
            session_id: sessao,
            concessao_id: '44444444-4444-4444-8444-444444444444',
            perfil: 'administrador',
            versao_usuario: 1,
          },
        };
      },
    });
    const handler = criarHandlerEntradaTecnica({
      ler: criarLeitorEntradaTecnica(fonteTeste),
      transporte: criarTransporteHttpSessaoComProva(fonteTeste, { configuracaoJwt: jwtConfig }),
      entrar,
      consultar: async () => {
        expect(admitiu).toBe(true);
        return {
          usuario: { id: usuario, perfil: 'administrador', ativo: true, versao: 1 },
          capacidades: [],
        };
      },
    });
    const codec = criarCodecDeCookiesDesafioIsolado(
      { chaveDeSelagem: chave, transporte: 'https' },
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    const csrf = 'c'.repeat(43);
    const cookie = (await codec.selarCsrfDesafio(csrf)).split(';')[0] ?? '';
    const resposta = await handler(
      new Request(`${origem}/api/sessao/tecnica`, {
        method: 'POST',
        headers: {
          origin: origem,
          cookie,
          'x-csrf': csrf,
          'x-desafio': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email: 'teste@example.test', senha: 'senha-ficticia' }),
      }),
    );
    expect(resposta.status).toBe(200);
    const corpo = await resposta.text();
    expect(corpo).not.toContain('refresh-ficticio');
    expect(corpo).not.toContain('senha-ficticia');
    expect(resposta.headers.getSetCookie()).toHaveLength(3);
  });
  it('não chama entrada com origem inválida nem emite cookies quando consulta falha', async () => {
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
    const csrf = 'c'.repeat(43);
    const cookie = (await codec.selarCsrfDesafio(csrf)).split(';')[0] ?? '';
    let entradas = 0;
    const handler = criarHandlerEntradaTecnica({
      ler: criarLeitorEntradaTecnica(fonte),
      transporte: criarTransporteHttpSessaoComProva(fonte, { configuracaoJwt: configJwt }),
      entrar: async () => {
        entradas++;
        return { accessToken: token, prova: 'A'.repeat(43), geracao: 1 };
      },
      consultar: async () => {
        throw new Error('senha-ficticia');
      },
    });
    const request = (origin: string) =>
      new Request(`${origem}/api/sessao/tecnica`, {
        method: 'POST',
        headers: {
          origin,
          cookie,
          'x-csrf': csrf,
          'x-desafio': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email: 'teste@example.test', senha: 'senha-ficticia' }),
      });
    const negada = await handler(request('https://atacante.example.test'));
    expect(negada.status).toBe(403);
    expect(entradas).toBe(0);
    const falha = await handler(request(origem));
    expect(falha.status).toBe(503);
    expect(falha.headers.getSetCookie()).toEqual([
      'ffcm_csrf_desafio_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa=; Path=/api/sessao; HttpOnly; SameSite=Lax; Secure; Max-Age=0',
    ]);
    expect(await falha.text()).not.toContain('senha-ficticia');
  });
  it('emite resposta apenas após entrada e consulta da sessão', async () => {
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
    const csrf = 'c'.repeat(43);
    const cookie = (await codec.selarCsrfDesafio(csrf)).split(';')[0] ?? '';
    const handler = criarHandlerEntradaTecnica({
      ler: criarLeitorEntradaTecnica(fonte),
      transporte: criarTransporteHttpSessaoComProva(fonte, { configuracaoJwt: configJwt }),
      entrar: async () => ({ accessToken: token, prova: 'A'.repeat(43), geracao: 1 }),
      consultar: async () => ({
        usuario: { id: usuario, perfil: 'administrador', ativo: true, versao: 1 },
        capacidades: [],
      }),
    });
    const resposta = await handler(
      new Request(`${origem}/api/sessao/tecnica`, {
        method: 'POST',
        headers: {
          origin: origem,
          cookie,
          'x-csrf': csrf,
          'x-desafio': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email: 'teste@example.test', senha: 'senha-ficticia' }),
      }),
    );
    expect(resposta.status).toBe(200);
    const dados = (await resposta.json()).dados;
    expect(dados).toMatchObject({
      prova_sessao: 'A'.repeat(43),
      geracao_sessao: 1,
    });
    const cookies = resposta.headers.getSetCookie();
    expect(cookies).toHaveLength(3);
    for (const item of cookies) {
      expect(item).toContain('HttpOnly');
      expect(item).toContain('Secure');
      expect(item).toContain('SameSite=Lax');
      expect(item).toContain('Path=/api/sessao');
      expect(item).not.toContain('Domain=');
      expect(item).not.toContain('A'.repeat(43));
    }
    const isolado = criarCodecDeCookiesSessaoIsolada(
      { chaveDeSelagem: chave, transporte: 'https' },
      dados.seletor_sessao,
    );
    const cabecalho = cookies.map((item) => item.split(';')[0]).join('; ');
    expect(await isolado.abrirCsrf(cabecalho)).toBe(dados.csrf);
    expect(JSON.parse((await isolado.abrirSessao(cabecalho)) ?? '{}')).toMatchObject({
      usuarioId: usuario,
      sessionId: sessao,
      csrf: dados.csrf,
    });
  });
});
