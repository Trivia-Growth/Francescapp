import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { criarAutorizadorCarteiraExperimental } from './autorizar-carteira-experimental.ts';

const chave = new TextEncoder().encode('a'.repeat(64));
const configuracao = {
  issuer: 'https://projeto-ficticio.supabase.co/auth/v1',
  audience: 'authenticated',
  algoritmosPermitidos: ['HS256'],
  chaveDeVerificacao: chave,
};
const usuario = '31a7e0e6-8b2f-4c85-8baf-9422b39a4175';
const sessao = '41a7e0e6-8b2f-4c85-8baf-9422b39a4175';
const prova = 'A'.repeat(43);
async function jwt(
  opcoes: {
    issuer?: string;
    exp?: string;
    segredo?: Uint8Array;
    audience?: string;
    semSessao?: boolean;
  } = {},
) {
  return new SignJWT(opcoes.semSessao ? {} : { session_id: sessao })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuario)
    .setIssuer(opcoes.issuer ?? configuracao.issuer)
    .setAudience(opcoes.audience ?? 'authenticated')
    .setExpirationTime(opcoes.exp ?? '5m')
    .sign(opcoes.segredo ?? chave);
}
function pedido(token: string, p = prova, g = '1') {
  return new Request('https://app.example.test/api/pacientes', {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-ffcm-prova-sessao': p,
      'x-ffcm-geracao-sessao': g,
      'x-usuario-id': '00000000-0000-4000-8000-000000000000',
    },
  });
}
describe('autorizador experimental da carteira', () => {
  it('isola configuração de mutação posterior e preserva CryptoKey', async () => {
    const material = new Uint8Array(chave);
    const algoritmos = ['HS256'];
    const configuravel = {
      ...configuracao,
      algoritmosPermitidos: algoritmos,
      chaveDeVerificacao: material,
    };
    const autorizar = criarAutorizadorCarteiraExperimental(configuravel);
    const token = await jwt();
    configuravel.issuer = 'https://outro-projeto.supabase.co/auth/v1';
    algoritmos.splice(0, 1, 'HS384');
    material.fill(9);
    expect((await autorizar(pedido(token))).estado).toBe('autorizado');
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      chave,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const comCryptoKey = criarAutorizadorCarteiraExperimental({
      ...configuracao,
      chaveDeVerificacao: cryptoKey,
    });
    expect((await comCryptoKey(pedido(token))).estado).toBe('autorizado');
  });
  it('deriva identidade apenas do JWT verificado e não enumera credenciais', async () => {
    const token = await jwt();
    const resultado = await criarAutorizadorCarteiraExperimental(configuracao)(pedido(token));
    expect(resultado).toMatchObject({
      estado: 'autorizado',
      identidade: { usuario_id: usuario, session_id: sessao },
      geracao: 1,
    });
    if (resultado.estado !== 'autorizado') throw new Error();
    expect(resultado.jwt).toBe(token);
    expect(resultado.prova).toBe(prova);
    expect(JSON.stringify(resultado)).not.toContain(token);
    expect(JSON.stringify(resultado)).not.toContain(prova);
  });
  it('nega assinatura errada, expiração e issuer de outro projeto', async () => {
    const autorizar = criarAutorizadorCarteiraExperimental(configuracao);
    for (const token of [
      await jwt({ segredo: new Uint8Array(64).fill(9) }),
      await jwt({ exp: '1s ago' }),
      await jwt({ issuer: 'https://outro-projeto.supabase.co/auth/v1' }),
      await jwt({ audience: 'outra' }),
      await jwt({ semSessao: true }),
    ]) {
      expect(await autorizar(pedido(token))).toEqual({ estado: 'nao_autenticado' });
    }
  });
  it('nega prova ou geração malformada', async () => {
    const autorizar = criarAutorizadorCarteiraExperimental(configuracao);
    const token = await jwt();
    for (const [p, g] of [
      ['invalida', '1'],
      [prova, '0'],
      [prova, '01'],
      [prova, '9007199254740992'],
    ]) {
      expect(await autorizar(pedido(token, p, g))).toEqual({ estado: 'nao_autenticado' });
    }
  });
  it('nega credenciais ausentes ou cabeçalho ambíguo', async () => {
    const autorizar = criarAutorizadorCarteiraExperimental(configuracao);
    const token = await jwt();
    const testes: HeadersInit[] = [
      {},
      { Authorization: `Bearer ${token}`, 'x-ffcm-geracao-sessao': '1' },
      {
        Authorization: `Bearer ${token}, Bearer ${token}`,
        'x-ffcm-prova-sessao': prova,
        'x-ffcm-geracao-sessao': '1',
      },
    ];
    for (const headers of testes) {
      expect(
        await autorizar(new Request('https://app.example.test/api/pacientes', { headers })),
      ).toEqual({ estado: 'nao_autenticado' });
    }
  });
});
