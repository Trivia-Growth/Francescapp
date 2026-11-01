import { describe, expect, it } from 'vitest';
import { criarCodecDeCookiesDesafioIsolado } from '../../../../supabase/functions/_shared/sessao/nucleo.ts';
import { criarLeitorEntradaGoogle } from './entrada-google-http.ts';

const origem = 'https://app.example.test';
const chave = Buffer.alloc(32, 7).toString('base64url');
const fonte = {
  FFCM_SUPABASE_URL: 'https://projeto.example.test',
  FFCM_SUPABASE_ANON_KEY: 'publica',
  FFCM_COOKIE_SEALING_KEY: chave,
  FFCM_ALLOWED_ORIGINS: origem,
};
const desafioId = '11111111-1111-4111-8111-111111111111';
const csrf = 'c'.repeat(43);
describe('leitor HTTP Google não exposto', () => {
  it('rejeita overflow, UTF-8 inválido e cookies ou cabeçalhos CSRF duplicados', async () => {
    const codec = criarCodecDeCookiesDesafioIsolado(
      { chaveDeSelagem: chave, transporte: 'https' },
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    const cookie = (await codec.selarCsrfDesafio(csrf)).split(';')[0];
    const base = {
      origin: origem,
      cookie: `${cookie}; ffcm_nonce_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa=nonce.selado`,
      'x-csrf': csrf,
      'x-desafio': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'content-type': 'application/json',
    };
    const ler = criarLeitorEntradaGoogle(fonte);
    const corpo = JSON.stringify({ desafio_id: desafioId, credencial: 'token-ficticio' });
    for (const [headers, body] of [
      [base, 'x'.repeat(100_001)],
      [base, new Uint8Array([0xc3, 0x28])],
      [
        {
          ...base,
          cookie: `${cookie}; ${cookie}; ffcm_nonce_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa=nonce.selado`,
        },
        corpo,
      ],
      [{ ...base, 'x-csrf': `${csrf}, ${csrf}` }, corpo],
    ] as Array<[Record<string, string>, BodyInit]>) {
      const erro = await ler(
        new Request(`${origem}/api/sessao/google`, { method: 'POST', headers, body }),
      ).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(Error);
      expect(String(erro)).not.toContain('token-ficticio');
    }
  });
  it('não fica preso em corpo que não termina nem ao cancelá-lo', async () => {
    const codec = criarCodecDeCookiesDesafioIsolado(
      { chaveDeSelagem: chave, transporte: 'https' },
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    const cookie = (await codec.selarCsrfDesafio(csrf)).split(';')[0];
    const corpo = new ReadableStream({ cancel: () => new Promise<void>(() => {}) });
    const request = new Request(`${origem}/api/sessao/google`, {
      method: 'POST',
      headers: {
        origin: origem,
        cookie: `${cookie}; ffcm_nonce_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa=nonce.selado`,
        'x-csrf': csrf,
        'x-desafio': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'content-type': 'application/json',
      },
      body: corpo,
      duplex: 'half',
    } as RequestInit);
    const resultado = await Promise.race([
      criarLeitorEntradaGoogle(fonte)(request).then(
        () => 'aceito',
        () => 'negado',
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve('travado'), 6000)),
    ]);
    expect(resultado).toBe('negado');
  }, 7000);
  it('aceita credencial máxima escapada sem aceitar parâmetros extras na URL', async () => {
    const codec = criarCodecDeCookiesDesafioIsolado(
      { chaveDeSelagem: chave, transporte: 'https' },
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    const cookie = (await codec.selarCsrfDesafio(csrf)).split(';')[0];
    const headers = {
      origin: origem,
      cookie: `${cookie}; ffcm_nonce_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa=nonce.selado; ffcm_sessao=existente`,
      'x-csrf': csrf,
      'x-desafio': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'content-type': 'application/json',
    };
    const corpo = `{"desafio_id":"${desafioId}","credencial":"${'\\u0061'.repeat(16_384)}"}`;
    const ler = criarLeitorEntradaGoogle(fonte);
    const dados = await ler(
      new Request(`${origem}/api/sessao/google`, { method: 'POST', headers, body: corpo }),
    );
    expect(dados.idToken).toHaveLength(16_384);
    await expect(
      ler(
        new Request(`${origem}/api/sessao/google?token=indesejado`, {
          method: 'POST',
          headers,
          body: corpo,
        }),
      ),
    ).rejects.toThrow('Entrada Google recusada.');
  });
  it('aceita apenas credencial, nonce selado e desafio com origem/CSRF válidos', async () => {
    const codec = criarCodecDeCookiesDesafioIsolado(
      { chaveDeSelagem: chave, transporte: 'https' },
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    const cookie = (await codec.selarCsrfDesafio(csrf)).split(';')[0];
    const ler = criarLeitorEntradaGoogle(fonte);
    const montar = (cabecalhos: Record<string, string>, corpo: unknown) =>
      new Request(`${origem}/api/sessao/google`, {
        method: 'POST',
        headers: {
          origin: origem,
          cookie: `${cookie}; ffcm_nonce_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa=nonce.selado`,
          'x-csrf': csrf,
          'x-desafio': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'content-type': 'application/json',
          ...cabecalhos,
        },
        body: JSON.stringify(corpo),
      });
    const corpo = { desafio_id: desafioId, credencial: 'token-ficticio' };
    const dados = await ler(montar({}, corpo));
    expect(dados).toMatchObject({
      desafioId,
      idToken: 'token-ficticio',
      nonceSelado: 'nonce.selado',
    });
    expect(JSON.stringify(dados)).not.toContain('token-ficticio');
    const invalidos: Record<string, string>[] = [
      { origin: 'https://atacante.example.test' },
      { 'x-csrf': 'inválido' },
      {
        cookie: `${cookie}; ffcm_nonce_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa=um; ffcm_nonce_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa=dois`,
      },
      { cookie: `${cookie}` },
    ];
    for (const cabecalhos of invalidos) {
      await expect(ler(montar(cabecalhos, corpo))).rejects.toThrow('Entrada Google recusada.');
    }
    await expect(ler(montar({}, { ...corpo, perfil: 'administrador' }))).rejects.toThrow(
      'Entrada Google recusada.',
    );
  });
});
