import { SignJWT } from 'jose';
import { expect, it, vi } from 'vitest';
import { criarTransporteHttpSessaoComProva } from './http-prova.ts';
import { criarHandlerConsultaSessao } from './consulta-http.ts';

const usuario = '11111111-1111-4111-8111-111111111111';
const sessao = '22222222-2222-4222-8222-222222222222';
const chave = new Uint8Array(32).fill(9);
const fonte = {
  FFCM_SUPABASE_URL: 'https://projeto.example.test',
  FFCM_SUPABASE_ANON_KEY: 'publica',
  FFCM_COOKIE_SEALING_KEY: Buffer.alloc(32, 7).toString('base64url'),
  FFCM_ALLOWED_ORIGINS: 'https://app.example.test',
};
const config = {
  issuer: 'https://projeto.example.test/auth/v1',
  audience: 'authenticated',
  algoritmosPermitidos: ['HS256' as const],
  chaveDeVerificacao: chave,
};

it('devolve autoridade vigente após conferir JWT e prova da sessão', async () => {
  const token = await new SignJWT({ session_id: sessao })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuario)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setExpirationTime('5m')
    .sign(chave);
  const transporte = criarTransporteHttpSessaoComProva(fonte, { configuracaoJwt: config });
  const handler = criarHandlerConsultaSessao(transporte, async (identidade) => {
    expect(Reflect.get(identidade, 'jwt')).toBe(token);
    expect(JSON.stringify(identidade)).not.toContain(token);
    expect(JSON.stringify(identidade)).not.toContain('A'.repeat(43));
    if (
      identidade.usuarioId !== usuario ||
      identidade.sessionId !== sessao ||
      identidade.geracao !== 1 ||
      identidade.prova !== 'A'.repeat(43)
    )
      throw new Error('identidade incorreta');
    return {
      usuario: { id: usuario, perfil: 'administrador', ativo: true, versao: 1 },
      capacidades: [],
    };
  });
  const resposta = await handler(
    new Request('https://app.example.test/api/sessao', {
      headers: {
        authorization: `Bearer ${token}`,
        'x-ffcm-prova-sessao': 'A'.repeat(43),
        'x-ffcm-geracao-sessao': '1',
      },
    }),
  );
  expect(resposta.status).toBe(200);
  expect((await resposta.json()).dados.usuario.id).toBe(usuario);
  expect(resposta.headers.get('cache-control')).toBe('no-store');
});

it('nega sessão revogada sem apresentar detalhes', async () => {
  const token = await new SignJWT({ session_id: sessao })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuario)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setExpirationTime('5m')
    .sign(chave);
  const transporte = criarTransporteHttpSessaoComProva(fonte, { configuracaoJwt: config });
  const handler = criarHandlerConsultaSessao(transporte, async () => null);
  const resposta = await handler(
    new Request('https://app.example.test/api/sessao', {
      headers: {
        authorization: `Bearer ${token}`,
        'x-ffcm-prova-sessao': 'A'.repeat(43),
        'x-ffcm-geracao-sessao': '1',
      },
    }),
  );
  expect(resposta.status).toBe(401);
  expect(await resposta.text()).not.toContain(token);
});

it('não responde com sessão de outra identidade', async () => {
  const token = await new SignJWT({ session_id: sessao })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuario)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setExpirationTime('5m')
    .sign(chave);
  const transporte = criarTransporteHttpSessaoComProva(fonte, { configuracaoJwt: config });
  const handler = criarHandlerConsultaSessao(transporte, async () => ({
    usuario: {
      id: '33333333-3333-4333-8333-333333333333',
      perfil: 'administrador',
      ativo: true,
      versao: 1,
    },
    capacidades: [],
  }));
  const resposta = await handler(
    new Request('https://app.example.test/api/sessao', {
      headers: {
        authorization: `Bearer ${token}`,
        'x-ffcm-prova-sessao': 'A'.repeat(43),
        'x-ffcm-geracao-sessao': '1',
      },
    }),
  );
  expect(resposta.status).toBe(503);
  expect(await resposta.text()).not.toContain('33333333-3333-4333-8333-333333333333');
});

it('falha fechada sem vazar detalhe quando banco está indisponível', async () => {
  const token = await new SignJWT({ session_id: sessao })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuario)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setExpirationTime('5m')
    .sign(chave);
  const transporte = criarTransporteHttpSessaoComProva(fonte, { configuracaoJwt: config });
  const handler = criarHandlerConsultaSessao(transporte, async () => {
    throw new Error('segredo-ficticio');
  });
  const resposta = await handler(
    new Request('https://app.example.test/api/sessao', {
      headers: {
        authorization: `Bearer ${token}`,
        'x-ffcm-prova-sessao': 'A'.repeat(43),
        'x-ffcm-geracao-sessao': '1',
      },
    }),
  );
  expect(resposta.status).toBe(503);
  expect(await resposta.text()).not.toContain('segredo-ficticio');
});

it('rejeita prova ausente antes de consultar autoridade', async () => {
  let consultou = false;
  const transporte = criarTransporteHttpSessaoComProva(fonte, { configuracaoJwt: config });
  const handler = criarHandlerConsultaSessao(transporte, async () => {
    consultou = true;
    return null;
  });
  const resposta = await handler(new Request('https://app.example.test/api/sessao'));
  expect(resposta.status).toBe(401);
  expect(consultou).toBe(false);
});

it('não consulta autoridade com JWT inválido ou expirado', async () => {
  const gerarToken = (expiracao: string, chaveDeAssinatura: Uint8Array) =>
    new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(config.issuer)
      .setAudience(config.audience)
      .setExpirationTime(expiracao)
      .sign(chaveDeAssinatura);
  const tokens = [
    await gerarToken('5m', new Uint8Array(32).fill(8)),
    await gerarToken('-1m', chave),
  ];
  const consultar = vi.fn(async () => null);
  const handler = criarHandlerConsultaSessao(
    criarTransporteHttpSessaoComProva(fonte, { configuracaoJwt: config }),
    consultar,
  );
  for (const token of tokens) {
    const resposta = await handler(
      new Request('https://app.example.test/api/sessao', {
        headers: {
          authorization: `Bearer ${token}`,
          'x-ffcm-prova-sessao': 'A'.repeat(43),
          'x-ffcm-geracao-sessao': '1',
        },
      }),
    );
    expect(resposta.status).toBe(401);
    expect(await resposta.text()).not.toContain(token);
  }
  expect(consultar).not.toHaveBeenCalled();
});

it('não consulta autoridade com prova ou geração malformadas', async () => {
  const token = await new SignJWT({ session_id: sessao })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuario)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setExpirationTime('5m')
    .sign(chave);
  const consultar = vi.fn(async () => null);
  const handler = criarHandlerConsultaSessao(
    criarTransporteHttpSessaoComProva(fonte, { configuracaoJwt: config }),
    consultar,
  );
  const entradas: ReadonlyArray<readonly [string, string]> = [
    ['inválida', '1'],
    ['A'.repeat(43), '0'],
    ['A'.repeat(43), '1.5'],
  ];
  for (const [prova, geracao] of entradas) {
    const resposta = await handler(
      new Request('https://app.example.test/api/sessao', {
        headers: {
          authorization: `Bearer ${token}`,
          'x-ffcm-prova-sessao': prova,
          'x-ffcm-geracao-sessao': geracao,
        },
      }),
    );
    expect(resposta.status).toBe(401);
    expect(await resposta.text()).not.toContain(token);
  }
  expect(consultar).not.toHaveBeenCalled();
});

it('encerra consulta demorada e descarta autoridade recebida após prazo', async () => {
  const token = await new SignJWT({ session_id: sessao })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuario)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setExpirationTime('5m')
    .sign(chave);
  const transporte = criarTransporteHttpSessaoComProva(fonte, { configuracaoJwt: config });
  let liberar!: (valor: unknown) => void;
  let iniciou!: () => void;
  const iniciada = new Promise<void>((resolve) => {
    iniciou = resolve;
  });
  const espera = new Promise<unknown>((resolve) => {
    liberar = resolve;
  });
  const handler = criarHandlerConsultaSessao(transporte, async () => {
    iniciou();
    return espera;
  });
  vi.useFakeTimers();
  try {
    const respostaPendente = handler(
      new Request('https://app.example.test/api/sessao', {
        headers: {
          authorization: `Bearer ${token}`,
          'x-ffcm-prova-sessao': 'A'.repeat(43),
          'x-ffcm-geracao-sessao': '1',
        },
      }),
    );
    await iniciada;
    await vi.advanceTimersByTimeAsync(15_001);
    const resposta = await respostaPendente;
    expect(resposta.status).toBe(503);
    liberar({
      usuario: { id: usuario, perfil: 'administrador', ativo: true, versao: 1 },
      capacidades: [],
    });
    await Promise.resolve();
    expect(resposta.status).toBe(503);
  } finally {
    vi.useRealTimers();
  }
});
