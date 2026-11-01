import { SignJWT } from 'jose';
import { expect, it } from 'vitest';
import { criarTransporteHttpSessaoComProva } from './http-prova.ts';
import { criarHandlerSaida } from './saida-http.ts';

it('encerra somente após confirmação local e preserva os cookies em falha', async () => {
  const origem = 'https://app.example.test';
  const usuarioId = '10000000-0000-4000-8000-000000000001';
  const sessionId = '10000000-0000-4000-8000-000000000002';
  const chave = new Uint8Array(32).fill(9);
  const transporte = criarTransporteHttpSessaoComProva(
    {
      FFCM_SUPABASE_URL: 'https://projeto.example.test',
      FFCM_SUPABASE_ANON_KEY: 'publica',
      FFCM_COOKIE_SEALING_KEY: Buffer.alloc(32, 7).toString('base64url'),
      FFCM_ALLOWED_ORIGINS: origem,
    },
    {
      configuracaoJwt: {
        issuer: 'https://projeto.example.test/auth/v1',
        audience: 'authenticated',
        algoritmosPermitidos: ['HS256'],
        chaveDeVerificacao: chave,
      },
    },
  );
  const accessToken = await new SignJWT({ session_id: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuarioId)
    .setIssuer('https://projeto.example.test/auth/v1')
    .setAudience('authenticated')
    .setExpirationTime('5m')
    .sign(chave);
  const entrada = await transporte.responderEntrada({
    sessao: {
      usuario: { id: usuarioId, perfil: 'administrador', ativo: true, versao: 1 },
      capacidades: [],
    },
    accessToken,
    prova: 'A'.repeat(43),
    geracao: 1,
  });
  const dados = (await entrada.clone().json()).dados;
  const cookie = entrada.headers
    .getSetCookie()
    .map((item) => item.split(';')[0])
    .join('; ');
  const requisicao = () =>
    new Request(`${origem}/api/sessao/sair`, {
      method: 'POST',
      headers: {
        origin: origem,
        cookie,
        'content-type': 'application/json',
        'x-csrf': dados.csrf,
        'x-sessao': dados.seletor_sessao,
        'x-ffcm-prova-sessao': 'A'.repeat(43),
        'x-ffcm-geracao-sessao': '1',
      },
      body: '{}',
    });
  const falha = criarHandlerSaida(transporte, async () => {
    throw new Error('detalhe privado');
  });
  const indisponivel = await falha(requisicao());
  expect(indisponivel.status).toBe(503);
  expect(indisponivel.headers.getSetCookie()).toEqual([]);
  expect(await indisponivel.text()).not.toContain('detalhe privado');
  let chamadas = 0;
  const naoAutorizado = criarHandlerSaida(transporte, async () => {
    chamadas += 1;
    return { encerrada_localmente: true, pendencia_externa: false };
  });
  const semProva = requisicao();
  semProva.headers.delete('x-ffcm-prova-sessao');
  const negada = await naoAutorizado(semProva);
  expect(negada.status).toBe(401);
  expect(negada.headers.getSetCookie()).toEqual([]);
  for (const [cabecalho, valor] of [
    ['origin', 'https://outra.example.test'],
    ['x-csrf', 'csrf-incorreto'],
  ] as const) {
    const invalida = requisicao();
    invalida.headers.set(cabecalho, valor);
    const recusada = await naoAutorizado(invalida);
    expect(recusada.status).toBe(403);
    expect(recusada.headers.getSetCookie()).toEqual([]);
  }
  expect(chamadas).toBe(0);
  const semConfirmacao = criarHandlerSaida(transporte, async () => ({
    encerrada_localmente: false,
    pendencia_externa: true,
  }));
  const inconclusiva = await semConfirmacao(requisicao());
  expect(inconclusiva.status).toBe(503);
  expect(inconclusiva.headers.getSetCookie()).toEqual([]);
  const sucesso = criarHandlerSaida(transporte, async (contexto) => {
    expect(contexto).toMatchObject({ usuarioId, sessionId, prova: 'A'.repeat(43), geracao: 1 });
    return { encerrada_localmente: true, pendencia_externa: true };
  });
  const resposta = await sucesso(requisicao());
  expect(resposta.status).toBe(200);
  expect((await resposta.json()).dados).toEqual({
    encerrada_localmente: true,
    pendencia_externa: true,
  });
  expect(resposta.headers.getSetCookie()).toHaveLength(2);
});
