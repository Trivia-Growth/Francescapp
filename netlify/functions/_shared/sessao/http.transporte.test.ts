import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';

import { criarTransporteHttpSessao } from './http.ts';

const origem = 'https://app.example.test';
const chaveSelagem = Buffer.alloc(32, 7).toString('base64url');
const fonte = {
  FFCM_SUPABASE_URL: 'https://projeto.example.test',
  FFCM_SUPABASE_ANON_KEY: 'chave-publica-ficticia',
  FFCM_COOKIE_SEALING_KEY: chaveSelagem,
  FFCM_ALLOWED_ORIGINS: origem,
};
const configuracaoJwt = {
  issuer: 'https://projeto.example.test/auth/v1',
  audience: 'authenticated',
  algoritmosPermitidos: ['HS256'] as const,
  chaveDeVerificacao: new Uint8Array(32).fill(9),
};
const fecharServidores: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(fecharServidores.splice(0).map((fechar) => fechar()));
});

// Ponte HTTP exclusiva do teste. Não admite sessão nem representa Netlify/Auth/RPC.
async function servir(handler: (request: Request) => Promise<Response>): Promise<string> {
  const servidor = createServer(async (entrada, saida) => {
    try {
      const partes: Buffer[] = [];
      for await (const parte of entrada) partes.push(Buffer.from(parte));
      const cabecalhos = new Headers();
      for (let i = 0; i < entrada.rawHeaders.length; i += 2) {
        cabecalhos.append(entrada.rawHeaders[i] ?? '', entrada.rawHeaders[i + 1] ?? '');
      }
      const resposta = await handler(
        new Request(`http://127.0.0.1${entrada.url}`, {
          method: entrada.method,
          headers: cabecalhos,
          ...(partes.length > 0 ? { body: Buffer.concat(partes) } : {}),
        }),
      );
      saida.statusCode = resposta.status;
      resposta.headers.forEach((valor, nome) => {
        if (nome !== 'set-cookie') saida.setHeader(nome, valor);
      });
      const cookies = resposta.headers.getSetCookie();
      if (cookies.length > 0) saida.setHeader('Set-Cookie', cookies);
      saida.end(Buffer.from(await resposta.arrayBuffer()));
    } catch {
      saida.statusCode = 500;
      saida.end();
    }
  });
  servidor.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  fecharServidores.push(
    () =>
      new Promise<void>((resolve, reject) => {
        servidor.close((erro) => (erro ? reject(erro) : resolve()));
        servidor.closeAllConnections();
      }),
  );
  return `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
}

describe('transporte HTTP de sessão — sem adapter de autoridade', () => {
  it('preserva dois Set-Cookie por HTTP real e recebe comando com origem/CSRF válidos', async () => {
    const transporte = criarTransporteHttpSessao(fonte, { configuracaoJwt });
    const usuarioId = '10000000-0000-4000-8000-000000000001';
    const accessToken = await new SignJWT({ session_id: '10000000-0000-4000-8000-000000000002' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuarioId)
      .setIssuer(configuracaoJwt.issuer)
      .setAudience(configuracaoJwt.audience)
      .setExpirationTime('5m')
      .sign(configuracaoJwt.chaveDeVerificacao);
    let recebido: unknown;
    const url = await servir(async (request) => {
      try {
        // Apenas fixture de serialização. Nenhuma simulação de admissão/renovação.
        if (new URL(request.url).pathname === '/fixture-resposta') {
          return transporte.responderEntrada({
            sessao: {
              usuario: { id: usuarioId, perfil: 'profissional', ativo: true, versao: 1 },
              capacidades: [],
            },
            accessToken,
          });
        }
        recebido = await transporte.lerComandoComCookie(request, 'renovarSessao');
        return new Response(null, { status: 204 });
      } catch (erro) {
        return transporte.responderFalha(erro);
      }
    });
    const entrada = await fetch(`${url}/fixture-resposta`);
    expect(entrada.status).toBe(200);
    expect(entrada.headers.get('cache-control')).toBe('no-store');
    const cookies = entrada.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toMatch(/^ffcm_sessao_/);
    expect(cookies[1]).toMatch(/^ffcm_csrf_/);
    const corpo = await entrada.json();
    expect(JSON.stringify(corpo)).not.toContain('refresh-ficticio');
    const resposta = await fetch(`${url}/api/sessao/renovar`, {
      method: 'POST',
      headers: {
        origin: origem,
        'x-csrf': corpo.dados.csrf,
        'x-sessao': corpo.dados.seletor_sessao,
        cookie: cookies.map((cookie) => cookie.split(';')[0]).join('; '),
        'content-type': 'application/json',
      },
      body: '{}',
    });
    expect(resposta.status).toBe(204);
    expect(recebido).toEqual({
      usuarioId,
      sessionId: '10000000-0000-4000-8000-000000000002',
    });
    const negada = await fetch(`${url}/api/sessao/renovar`, {
      method: 'POST',
      headers: {
        origin: 'https://maliciosa.example.test',
        'x-csrf': corpo.dados.csrf,
        'x-sessao': corpo.dados.seletor_sessao,
        cookie: cookies.map((cookie) => cookie.split(';')[0]).join('; '),
        'content-type': 'application/json',
      },
      body: '{}',
    });
    expect(negada.status).toBe(403);
    expect(negada.headers.get('cache-control')).toBe('no-store');
    expect(negada.headers.getSetCookie()).toEqual([]);
  });
});
