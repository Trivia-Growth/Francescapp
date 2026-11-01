import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { criarTransporteHttpSessaoComProva } from './http-prova.ts';

const origem = 'https://app.example.test';
const usuarioId = '10000000-0000-4000-8000-000000000001';
const sessionId = '10000000-0000-4000-8000-000000000002';
const prova = 'A'.repeat(43);
const fonte = {
  FFCM_SUPABASE_URL: 'https://projeto.example.test',
  FFCM_SUPABASE_ANON_KEY: 'publica',
  FFCM_COOKIE_SEALING_KEY: Buffer.alloc(32, 7).toString('base64url'),
  FFCM_ALLOWED_ORIGINS: origem,
};
const configuracaoJwt = {
  issuer: 'https://projeto.example.test/auth/v1',
  audience: 'authenticated',
  algoritmosPermitidos: ['HS256' as const],
  chaveDeVerificacao: new Uint8Array(32).fill(9),
};

describe('transporte HTTP de sessão com prova', () => {
  it('responde 401 sanitizado para prova malformada', async () => {
    const transporte = criarTransporteHttpSessaoComProva(fonte, { configuracaoJwt });
    const request = new Request(`${origem}/api/sessao`, {
      headers: { 'x-ffcm-prova-sessao': 'segredo-ficticio', 'x-ffcm-geracao-sessao': '1' },
    });
    const erro = await transporte.lerIdentidadeDaConsulta(request).catch((falha: unknown) => falha);
    const resposta = transporte.responderFalha(erro);
    expect(resposta.status).toBe(401);
    expect(await resposta.text()).not.toContain('segredo-ficticio');
  });
  it('recusa prova ausente, malformada e geração inválida antes da consulta', async () => {
    const transporte = criarTransporteHttpSessaoComProva(fonte, { configuracaoJwt });
    for (const headers of [
      {},
      { 'x-ffcm-prova-sessao': `${'A'.repeat(42)}B`, 'x-ffcm-geracao-sessao': '1' },
      { 'x-ffcm-prova-sessao': prova, 'x-ffcm-geracao-sessao': '01' },
    ] as Record<string, string>[]) {
      const request = new Request(`${origem}/api/sessao`, { headers });
      await expect(transporte.lerIdentidadeDaConsulta(request)).rejects.toThrow(
        'Prova de sessão inválida.',
      );
    }
  });
  it('entrega prova no corpo mas não em cookie, e exige prova para renovar', async () => {
    const jwt = await new SignJWT({ session_id: sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuarioId)
      .setIssuer(configuracaoJwt.issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(configuracaoJwt.chaveDeVerificacao);
    const transporte = criarTransporteHttpSessaoComProva(fonte, { configuracaoJwt });
    const sessao = {
      usuario: { id: usuarioId, perfil: 'profissional', ativo: true, versao: 1 },
      capacidades: [],
    };
    const resposta = await transporte.responderEntrada({
      sessao,
      accessToken: jwt,
      prova,
      geracao: 1,
    });
    const dados = (await resposta.json()).dados;
    expect(dados).toMatchObject({ prova_sessao: prova, geracao_sessao: 1 });
    expect(resposta.headers.getSetCookie().join(';')).not.toContain(prova);
    const cookie = resposta.headers
      .getSetCookie()
      .map((item) => item.split(';')[0])
      .join('; ');
    const request = new Request(`${origem}/api/sessao/renovar`, {
      method: 'POST',
      headers: {
        origin: origem,
        cookie,
        'content-type': 'application/json',
        'x-csrf': dados.csrf,
        'x-sessao': dados.seletor_sessao,
        'x-ffcm-prova-sessao': prova,
        'x-ffcm-geracao-sessao': '1',
      },
      body: '{}',
    });
    const contexto = await transporte.lerComandoComCookie(request, 'renovarSessao');
    expect(contexto).toMatchObject({ usuarioId, sessionId, prova, geracao: 1 });
    expect(JSON.stringify(contexto)).not.toContain(prova);
    const novaProva = `${'B'.repeat(42)}A`;
    const renovacao = await transporte.responderRenovacao(
      { sessao, accessToken: jwt, prova: novaProva, geracao: 2 },
      contexto,
    );
    expect((await renovacao.json()).dados).toMatchObject({
      prova_sessao: novaProva,
      geracao_sessao: 2,
    });
    expect(renovacao.headers.getSetCookie()).toEqual([]);
    await expect(
      transporte.responderRenovacao(
        { sessao, accessToken: jwt, prova: novaProva, geracao: 2 },
        contexto,
      ),
    ).rejects.toThrow();
  });
});
