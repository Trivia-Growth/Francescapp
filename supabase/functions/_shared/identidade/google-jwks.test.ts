import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';

import { criarValidadorGoogleComJwks } from './google-jwks.ts';
import { ErroIdTokenGoogleInvalido } from './google-id-token.ts';

describe('validação Google com JWKS', () => {
  it('não estende a validade se o relógio recuar durante fetch ou leitura', async () => {
    const par = await generateKeyPair('RS256');
    const chave = { ...(await exportJWK(par.publicKey)), kid: 'chave', alg: 'RS256', use: 'sig' };
    const token = await new SignJWT({
      email: 'pessoa@empresa.exemplo',
      email_verified: true,
      hd: 'empresa.exemplo',
      nonce: 'N'.repeat(43),
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'chave' })
      .setSubject('subject-ficticio')
      .setIssuer('https://accounts.google.com')
      .setAudience('cliente-ficticio')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(par.privateKey);
    const config = {
      audienciaEsperada: 'cliente-ficticio',
      dominioWorkspace: 'empresa.exemplo',
      nonceEsperado: 'N'.repeat(43),
    };
    for (const etapa of ['fetch', 'leitura']) {
      const inicio = Date.now();
      const monotono = performance.now();
      const relogio = vi.spyOn(Date, 'now').mockReturnValue(inicio);
      const decurso = vi.spyOn(performance, 'now').mockReturnValue(monotono);
      const avancar = () => {
        relogio.mockReturnValue(inicio - 10_000);
        decurso.mockReturnValue(monotono + 1_001);
      };
      const buscar = async () => {
        if (etapa === 'fetch') avancar();
        const bytes = new TextEncoder().encode(JSON.stringify({ keys: [chave] }));
        return new Response(
          new ReadableStream({
            pull(controller) {
              if (etapa === 'leitura') avancar();
              controller.enqueue(bytes);
              controller.close();
            },
          }),
          { headers: { 'cache-control': 'max-age=1' } },
        );
      };
      try {
        await expect(criarValidadorGoogleComJwks(buscar)(token, config)).rejects.toThrow(
          'Validação Google indisponível.',
        );
      } finally {
        relogio.mockRestore();
        decurso.mockRestore();
      }
    }
  });
  it('recusa corpo inválido sem envenenar cache e cancela respostas recusadas', async () => {
    const par = await generateKeyPair('RS256');
    const chave = { ...(await exportJWK(par.publicKey)), kid: 'chave', alg: 'RS256', use: 'sig' };
    const token = await new SignJWT({
      email: 'pessoa@empresa.exemplo',
      email_verified: true,
      hd: 'empresa.exemplo',
      nonce: 'N'.repeat(43),
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'chave' })
      .setSubject('subject-ficticio')
      .setIssuer('https://accounts.google.com')
      .setAudience('cliente-ficticio')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(par.privateKey);
    const config = {
      audienciaEsperada: 'cliente-ficticio',
      dominioWorkspace: 'empresa.exemplo',
      nonceEsperado: 'N'.repeat(43),
    };
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(new Response('{', { headers: { 'cache-control': 'max-age=60' } }))
      .mockResolvedValueOnce(
        Response.json({ keys: [chave] }, { headers: { 'cache-control': 'max-age=60' } }),
      );
    const validar = criarValidadorGoogleComJwks(buscar);
    await expect(validar(token, config)).rejects.toThrow('Validação Google indisponível.');
    await expect(validar(token, config)).resolves.toMatchObject({ subject: 'subject-ficticio' });
    for (const resposta of [503, 200]) {
      const cancelado = vi.fn();
      const buscarInvalido = async () =>
        new Response(new ReadableStream({ cancel: cancelado }), { status: resposta });
      await expect(criarValidadorGoogleComJwks(buscarInvalido)(token, config)).rejects.toThrow(
        'Validação Google indisponível.',
      );
      expect(cancelado).toHaveBeenCalled();
    }
  });
  it('não aceita chave removida após expiração indicada pelo provedor', async () => {
    const par = await generateKeyPair('RS256');
    const chave = { ...(await exportJWK(par.publicKey)), kid: 'antiga', alg: 'RS256', use: 'sig' };
    let removida = false;
    const buscar = vi.fn(async () =>
      Response.json(
        { keys: removida ? [] : [chave] },
        {
          headers: { 'cache-control': 'public, max-age=1' },
        },
      ),
    );
    const validar = criarValidadorGoogleComJwks(buscar);
    const token = await new SignJWT({
      email: 'pessoa@empresa.exemplo',
      email_verified: true,
      hd: 'empresa.exemplo',
      nonce: 'N'.repeat(43),
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'antiga' })
      .setSubject('subject-ficticio')
      .setIssuer('https://accounts.google.com')
      .setAudience('cliente-ficticio')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(par.privateKey);
    const config = {
      audienciaEsperada: 'cliente-ficticio',
      dominioWorkspace: 'empresa.exemplo',
      nonceEsperado: 'N'.repeat(43),
    };
    const inicio = Date.now();
    const relogio = vi.spyOn(Date, 'now').mockReturnValue(inicio);
    try {
      await expect(Promise.all([validar(token, config), validar(token, config)])).resolves.toEqual([
        expect.objectContaining({ subject: 'subject-ficticio' }),
        expect.objectContaining({ subject: 'subject-ficticio' }),
      ]);
      expect(buscar).toHaveBeenCalledTimes(1);
      removida = true;
      relogio.mockReturnValue(inicio + 1_001);
      const falha = await validar(token, config).catch((erro: unknown) => erro);
      expect(falha).toBeInstanceOf(Error);
      expect(falha).not.toBeInstanceOf(ErroIdTokenGoogleInvalido);
      expect(buscar).toHaveBeenCalledTimes(2);
    } finally {
      relogio.mockRestore();
    }
  });
  it('não reutiliza resposta com no-cache ou idade já expirada', async () => {
    const par = await generateKeyPair('RS256');
    const chave = { ...(await exportJWK(par.publicKey)), kid: 'chave', alg: 'RS256', use: 'sig' };
    const token = await new SignJWT({
      email: 'pessoa@empresa.exemplo',
      email_verified: true,
      hd: 'empresa.exemplo',
      nonce: 'N'.repeat(43),
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'chave' })
      .setSubject('subject-ficticio')
      .setIssuer('https://accounts.google.com')
      .setAudience('cliente-ficticio')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(par.privateKey);
    const config = {
      audienciaEsperada: 'cliente-ficticio',
      dominioWorkspace: 'empresa.exemplo',
      nonceEsperado: 'N'.repeat(43),
    };
    for (const headers of [{ 'cache-control': 'public, max-age=60, no-cache' }]) {
      const buscar = vi
        .fn()
        .mockResolvedValueOnce(Response.json({ keys: [chave] }, { headers }))
        .mockRejectedValue(new Error('indisponível'));
      const validar = criarValidadorGoogleComJwks(buscar);
      await expect(validar(token, config)).resolves.toMatchObject({ subject: 'subject-ficticio' });
      await expect(validar(token, config)).rejects.toThrow('Validação Google indisponível.');
      expect(buscar).toHaveBeenCalledTimes(2);
    }
    const expirada = criarValidadorGoogleComJwks(async () =>
      Response.json({ keys: [chave] }, { headers: { 'cache-control': 'max-age=60', age: '60' } }),
    );
    await expect(expirada(token, config)).rejects.toThrow('Validação Google indisponível.');
  });
  it('encerra leitura que não termina dentro do prazo', async () => {
    const par = await generateKeyPair('RS256');
    const token = await new SignJWT({
      email: 'pessoa@empresa.exemplo',
      email_verified: true,
      hd: 'empresa.exemplo',
      nonce: 'N'.repeat(43),
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'chave' })
      .setSubject('subject-ficticio')
      .setIssuer('https://accounts.google.com')
      .setAudience('cliente-ficticio')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(par.privateKey);
    const cancelar = vi.fn();
    const buscar = async () =>
      new Response(new ReadableStream({ cancel: cancelar }), {
        headers: { 'cache-control': 'max-age=60' },
      });
    await expect(
      criarValidadorGoogleComJwks(buscar)(token, {
        audienciaEsperada: 'cliente-ficticio',
        dominioWorkspace: 'empresa.exemplo',
        nonceEsperado: 'N'.repeat(43),
      }),
    ).rejects.toThrow('Validação Google indisponível.');
    expect(cancelar).toHaveBeenCalled();
  }, 8_000);
  it('valida assinatura com chave obtida apenas do endpoint Google fixo', async () => {
    const par = await generateKeyPair('RS256');
    const chave = {
      ...(await exportJWK(par.publicKey)),
      kid: 'chave-ficticia',
      alg: 'RS256',
      use: 'sig',
    };
    const buscar = vi.fn(async () =>
      Response.json({ keys: [chave] }, { headers: { 'cache-control': 'public, max-age=60' } }),
    );
    const validar = criarValidadorGoogleComJwks(buscar);
    const token = await new SignJWT({
      email: 'pessoa@empresa.exemplo',
      email_verified: true,
      hd: 'empresa.exemplo',
      nonce: 'N'.repeat(43),
    })
      .setProtectedHeader({
        alg: 'RS256',
        kid: 'chave-ficticia',
        jku: 'https://invasor.exemplo/chaves',
      })
      .setSubject('subject-ficticio')
      .setIssuer('https://accounts.google.com')
      .setAudience('cliente-ficticio')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(par.privateKey);

    await expect(
      validar(token, {
        audienciaEsperada: 'cliente-ficticio',
        dominioWorkspace: 'empresa.exemplo',
        nonceEsperado: 'N'.repeat(43),
      }),
    ).resolves.toMatchObject({ subject: 'subject-ficticio' });
    expect(buscar).toHaveBeenCalledWith(
      'https://www.googleapis.com/oauth2/v3/certs',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('falha fechada em redirecionamento, resposta excessiva ou indisponibilidade', async () => {
    const par = await generateKeyPair('RS256');
    const token = await new SignJWT({
      email: 'pessoa@empresa.exemplo',
      email_verified: true,
      hd: 'empresa.exemplo',
      nonce: 'N'.repeat(43),
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'chave-ficticia' })
      .setSubject('subject-ficticio')
      .setIssuer('https://accounts.google.com')
      .setAudience('cliente-ficticio')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(par.privateKey);
    const configuracao = {
      audienciaEsperada: 'cliente-ficticio',
      dominioWorkspace: 'empresa.exemplo',
      nonceEsperado: 'N'.repeat(43),
    };
    const respostas = [
      async () =>
        new Response(null, { status: 302, headers: { location: 'https://invasor.exemplo' } }),
      async () => new Response('x'.repeat(65_537), { headers: { 'cache-control': 'max-age=60' } }),
      async () => Response.json({ keys: [] }),
      async () => Response.json({ keys: [] }, { headers: { 'cache-control': 'max-age=invalido' } }),
      async () =>
        Response.json({ keys: [] }, { headers: { 'cache-control': 'max-age=60, max-age=3600' } }),
      async () => {
        throw new Error('detalhe interno não deve vazar');
      },
    ];
    for (const buscar of respostas) {
      await expect(criarValidadorGoogleComJwks(buscar)(token, configuracao)).rejects.toThrow(
        'Validação Google indisponível.',
      );
    }
  });

  it('recusa chave desconhecida enquanto espera a janela de atualização', async () => {
    const par = await generateKeyPair('RS256');
    const chave = {
      ...(await exportJWK(par.publicKey)),
      kid: 'chave-atual',
      alg: 'RS256',
      use: 'sig',
    };
    const buscar = vi.fn(async () =>
      Response.json({ keys: [chave] }, { headers: { 'cache-control': 'public, max-age=60' } }),
    );
    const validar = criarValidadorGoogleComJwks(buscar);
    const configuracao = {
      audienciaEsperada: 'cliente-ficticio',
      dominioWorkspace: 'empresa.exemplo',
      nonceEsperado: 'N'.repeat(43),
    };
    const assinar = (kid: string) =>
      new SignJWT({
        email: 'pessoa@empresa.exemplo',
        email_verified: true,
        hd: 'empresa.exemplo',
        nonce: 'N'.repeat(43),
      })
        .setProtectedHeader({ alg: 'RS256', kid })
        .setSubject('subject-ficticio')
        .setIssuer('https://accounts.google.com')
        .setAudience('cliente-ficticio')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(par.privateKey);
    await expect(validar(await assinar('chave-atual'), configuracao)).resolves.toMatchObject({
      subject: 'subject-ficticio',
    });
    await expect(validar(await assinar('chave-desconhecida'), configuracao)).rejects.toThrow(
      'Validação Google indisponível.',
    );
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it('aceita chave nova após a janela de atualização', async () => {
    const primeira = await generateKeyPair('RS256');
    const segunda = await generateKeyPair('RS256');
    let atual = 0;
    const buscar = async () =>
      Response.json(
        {
          keys: [
            {
              ...(await exportJWK((atual === 0 ? primeira : segunda).publicKey)),
              kid: `chave-${atual}`,
              alg: 'RS256',
              use: 'sig',
            },
          ],
        },
        { headers: { 'cache-control': 'public, max-age=30' } },
      );
    const validar = criarValidadorGoogleComJwks(buscar);
    const configuracao = {
      audienciaEsperada: 'cliente-ficticio',
      dominioWorkspace: 'empresa.exemplo',
      nonceEsperado: 'N'.repeat(43),
    };
    const assinar = (indice: number) =>
      new SignJWT({
        email: 'pessoa@empresa.exemplo',
        email_verified: true,
        hd: 'empresa.exemplo',
        nonce: 'N'.repeat(43),
      })
        .setProtectedHeader({ alg: 'RS256', kid: `chave-${indice}` })
        .setSubject('subject-ficticio')
        .setIssuer('https://accounts.google.com')
        .setAudience('cliente-ficticio')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign((indice === 0 ? primeira : segunda).privateKey);
    const inicio = Date.now();
    const relogio = vi.spyOn(Date, 'now').mockReturnValue(inicio);
    try {
      await expect(validar(await assinar(0), configuracao)).resolves.toMatchObject({
        subject: 'subject-ficticio',
      });
      atual = 1;
      relogio.mockReturnValue(inicio + 31_000);
      await expect(validar(await assinar(1), configuracao)).resolves.toMatchObject({
        subject: 'subject-ficticio',
      });
    } finally {
      relogio.mockRestore();
    }
  });
});
