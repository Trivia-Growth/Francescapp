import { SignJWT } from 'jose';
import { afterEach, expect, it, vi } from 'vitest';
import { criarTransporteHttpSessaoComProva } from '../netlify/functions/_shared/sessao/http-prova.js';
import { ClienteFFCM } from './api.js';

afterEach(() => vi.unstubAllGlobals());

// Reproduz o problema conhecido enquanto as rotas reais ainda não existem.
it('outra aba não impede saída da sessão original', async () => {
  const origem = 'https://app.example.test';
  const usuarioId = '10000000-0000-4000-8000-000000000001';
  const sessionId = '10000000-0000-4000-8000-000000000002';
  const segredo = new Uint8Array(32).fill(9);
  const configuracaoJwt = {
    issuer: 'https://projeto.example.test/auth/v1',
    audience: 'authenticated',
    algoritmosPermitidos: ['HS256'] as const,
    chaveDeVerificacao: segredo,
  };
  const transporte = criarTransporteHttpSessaoComProva(
    {
      FFCM_SUPABASE_URL: 'https://projeto.example.test',
      FFCM_SUPABASE_ANON_KEY: 'chave-publica-ficticia',
      FFCM_COOKIE_SEALING_KEY: Buffer.alloc(32, 7).toString('base64url'),
      FFCM_ALLOWED_ORIGINS: origem,
    },
    { configuracaoJwt },
  );
  const accessToken = await new SignJWT({ session_id: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuarioId)
    .setIssuer(configuracaoJwt.issuer)
    .setAudience(configuracaoJwt.audience)
    .setExpirationTime('5m')
    .sign(segredo);
  const sessao = {
    usuario: { id: usuarioId, perfil: 'administrador', ativo: true, versao: 1 },
    capacidades: [],
  };
  const envelope = (dados: unknown) => Response.json({ dados, request_id: crypto.randomUUID() });
  const cookies = new Map<string, string>();
  const armazenar = (resposta: Response) => {
    for (const cookie of resposta.headers.getSetCookie()) {
      const [par] = cookie.split(';');
      const separador = par?.indexOf('=') ?? -1;
      if (par && separador > 0) cookies.set(par.slice(0, separador), par.slice(separador + 1));
    }
    return resposta;
  };
  vi.stubGlobal('window', { location: { origin: origem } });
  vi.stubGlobal('fetch', async (url: URL, opcoes: RequestInit) => {
    if (url.pathname === '/api/sessao/desafio-tecnico') {
      // Fixture simula o contrato de desafio; ainda não existe rota real.
      const { criarCodecDeCookiesDesafioIsolado, emitirProtecaoCsrfDesafio } = await import(
        '../supabase/functions/_shared/sessao/nucleo.js'
      );
      const seletor = crypto.randomUUID();
      const codec = criarCodecDeCookiesDesafioIsolado(
        {
          chaveDeSelagem: Buffer.alloc(32, 7).toString('base64url'),
          transporte: 'https',
        },
        seletor,
      );
      const protecao = await emitirProtecaoCsrfDesafio(codec);
      const resposta = envelope({
        csrf: protecao.csrf,
        seletor_desafio: seletor,
      });
      resposta.headers.append('Set-Cookie', protecao.setCookie);
      return armazenar(resposta);
    }
    if (
      url.pathname === '/api/sessao/tecnica' &&
      String(opcoes.body).includes('outra@example.test')
    )
      return Response.json(
        {
          erro: { codigo: 'nao_autenticado', mensagem: 'Sessão inválida.' },
          request_id: crypto.randomUUID(),
        },
        { status: 401 },
      );
    if (url.pathname === '/api/sessao/tecnica')
      return armazenar(
        await transporte.responderEntrada({
          sessao,
          accessToken,
          prova: 'A'.repeat(43),
          geracao: 1,
        }),
      );
    if (url.pathname === '/api/sessao') return envelope(sessao);
    if (url.pathname === '/api/sessao/sair') {
      const headers = new Headers(opcoes.headers);
      headers.set('origin', origem);
      headers.set('cookie', Array.from(cookies, ([nome, valor]) => `${nome}=${valor}`).join('; '));
      try {
        const contexto = await transporte.lerComandoComCookie(
          new Request(url, { ...opcoes, headers }),
          'sairSessao',
        );
        return transporte.responderSaida(
          { encerrada_localmente: true, pendencia_externa: false },
          contexto,
        );
      } catch (erro) {
        return transporte.responderFalha(erro);
      }
    }
    throw new Error('Rota inesperada na fixture.');
  });
  const primeira = new ClienteFFCM();
  const segunda = new ClienteFFCM();
  await primeira.entrar('tecnica@example.test', 'senha-ficticia');
  await expect(segunda.entrar('outra@example.test', 'senha-ficticia')).rejects.toBeDefined();
  await expect(primeira.sair()).resolves.toMatchObject({ encerrada_localmente: true });
});
