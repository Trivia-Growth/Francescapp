import { describe, expect, it } from 'vitest';
import { criarCodecDeCookiesDesafioIsolado } from '../../../../supabase/functions/_shared/sessao/nucleo.ts';
import { ErroAutenticacaoNegada } from '../../../../supabase/functions/_shared/identidade/auth-tecnica.ts';
import { criarLeitorEntradaTecnica, responderFalhaEntradaTecnica } from './entrada-tecnica-http.ts';

const origem = 'https://app.example.test';
const chave = Buffer.alloc(32, 7).toString('base64url');
const fonte = {
  FFCM_SUPABASE_URL: 'https://projeto.example.test',
  FFCM_SUPABASE_ANON_KEY: 'publica',
  FFCM_COOKIE_SEALING_KEY: chave,
  FFCM_ALLOWED_ORIGINS: origem,
};
const csrf = 'c'.repeat(43);

describe('leitura HTTP de entrada técnica', () => {
  it('mapeia negação de identidade para 401 genérico', async () => {
    const resposta = responderFalhaEntradaTecnica(new ErroAutenticacaoNegada('entrada'));
    expect(resposta.status).toBe(401);
    expect(await resposta.json()).toMatchObject({
      erro: { codigo: 'nao_autenticado', mensagem: 'Sessão inválida.' },
    });
  });
  it('sinaliza falha de leitura como indisponibilidade sem expor erro interno', async () => {
    const codec = criarCodecDeCookiesDesafioIsolado(
      { chaveDeSelagem: chave, transporte: 'https' },
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    const cookie = (await codec.selarCsrfDesafio(csrf)).split(';')[0] ?? '';
    const corpo = new ReadableStream({
      start(controller) {
        controller.error(new Error('senha-ficticia'));
      },
    });
    const request = new Request(`${origem}/api/sessao/tecnica`, {
      method: 'POST',
      headers: {
        origin: origem,
        cookie,
        'x-csrf': csrf,
        'x-desafio': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'content-type': 'application/json',
      },
      body: corpo,
      duplex: 'half',
    } as RequestInit);
    const erro = await criarLeitorEntradaTecnica(fonte)(request).catch((falha: unknown) => falha);
    const resposta = responderFalhaEntradaTecnica(erro);
    expect(resposta.status).toBe(503);
    expect(await resposta.text()).not.toContain('senha-ficticia');
  });
  it('recusa corpo que não termina mesmo se cancelamento não resolve', async () => {
    const codec = criarCodecDeCookiesDesafioIsolado(
      { chaveDeSelagem: chave, transporte: 'https' },
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    const cookie = (await codec.selarCsrfDesafio(csrf)).split(';')[0] ?? '';
    const corpo = new ReadableStream({ cancel: () => new Promise<void>(() => {}) });
    const request = new Request(`${origem}/api/sessao/tecnica`, {
      method: 'POST',
      headers: {
        origin: origem,
        cookie,
        'x-csrf': csrf,
        'x-desafio': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'content-type': 'application/json',
      },
      body: corpo,
      duplex: 'half',
    } as RequestInit);
    const resultado = await Promise.race([
      criarLeitorEntradaTecnica(fonte)(request).then(
        () => 'aceita',
        () => 'recusada',
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve('travada'), 6000)),
    ]);
    expect(resultado).toBe('recusada');
  }, 7000);
  it('nega origem, CSRF, duplicata de cookie e corpos inválidos sem ecoar senha', async () => {
    const codec = criarCodecDeCookiesDesafioIsolado(
      { chaveDeSelagem: chave, transporte: 'https' },
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    const cookie = (await codec.selarCsrfDesafio(csrf)).split(';')[0] ?? '';
    const ler = criarLeitorEntradaTecnica(fonte);
    const base = {
      origin: origem,
      cookie,
      'x-csrf': csrf,
      'x-desafio': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'content-type': 'application/json',
    };
    const casos = [
      {
        headers: { ...base, origin: 'https://atacante.example.test' },
        body: '{"email":"teste@example.test","senha":"senha-ficticia"}',
      },
      {
        headers: { ...base, 'x-csrf': 'outro' },
        body: '{"email":"teste@example.test","senha":"senha-ficticia"}',
      },
      {
        headers: { ...base, cookie: `${cookie}; ${cookie}` },
        body: '{"email":"teste@example.test","senha":"senha-ficticia"}',
      },
      {
        headers: base,
        body: JSON.stringify({
          email: 'teste@example.test',
          senha: 'senha-ficticia',
          perfil: 'administrador',
        }),
      },
      { headers: base, body: 'x'.repeat(16385) },
    ];
    for (const [indice, caso] of casos.entries()) {
      const erro = await ler(
        new Request(`${origem}/api/sessao/tecnica`, { method: 'POST', ...caso }),
      ).catch((falha: unknown) => falha);
      expect(erro).toBeInstanceOf(Error);
      expect((erro as Error).message).toBe('Entrada técnica recusada.');
      expect(JSON.stringify(erro)).not.toContain('senha-ficticia');
      const resposta = responderFalhaEntradaTecnica(erro);
      expect(resposta.status).toBe(indice < 3 ? 403 : 422);
      expect(await resposta.text()).not.toContain('senha-ficticia');
    }
  });

  it('recusa método e parâmetros de URL não previstos', async () => {
    const ler = criarLeitorEntradaTecnica(fonte);
    await expect(ler(new Request(`${origem}/api/sessao/tecnica`))).rejects.toThrow(
      'Entrada técnica recusada.',
    );
    await expect(
      ler(new Request(`${origem}/api/sessao/tecnica?x=1`, { method: 'POST' })),
    ).rejects.toThrow('Entrada técnica recusada.');
  });

  it('aceita senha de 1024 caracteres codificada com escapes JSON', async () => {
    const codec = criarCodecDeCookiesDesafioIsolado(
      { chaveDeSelagem: chave, transporte: 'https' },
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    const cookie = (await codec.selarCsrfDesafio(csrf)).split(';')[0] ?? '';
    const corpo = `{"email":"teste@example.test","senha":"${'\\u0061'.repeat(1024)}"}`;
    const request = new Request(`${origem}/api/sessao/tecnica`, {
      method: 'POST',
      headers: {
        origin: origem,
        cookie,
        'x-csrf': csrf,
        'x-desafio': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'content-type': 'application/json',
      },
      body: corpo,
    });
    expect((await criarLeitorEntradaTecnica(fonte)(request)).senha).toHaveLength(1024);
  });
  it('recebe credenciais transitórias somente com origem e desafio CSRF válidos', async () => {
    const codec = criarCodecDeCookiesDesafioIsolado(
      { chaveDeSelagem: chave, transporte: 'https' },
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    const cookie = (await codec.selarCsrfDesafio(csrf)).split(';')[0] ?? '';
    const ler = criarLeitorEntradaTecnica(fonte);
    const request = new Request(`${origem}/api/sessao/tecnica`, {
      method: 'POST',
      headers: {
        origin: origem,
        cookie,
        'x-csrf': csrf,
        'x-desafio': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: 'teste@example.test', senha: 'senha-ficticia' }),
    });
    const dados = await ler(request);
    expect(dados.email).toBe('teste@example.test');
    expect(dados.senha).toBe('senha-ficticia');
    expect(JSON.stringify(dados)).not.toContain('senha-ficticia');
  });
});
